import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import { parameterKey, parseNorm } from "@/lib/criteria-import";
import { loadParameterIndex, type ParameterRef } from "@/lib/criteria-match";
import {
  parseLegacyCriteria,
  parseLegacyRegulations,
  parseLegacyTypes,
  usableNorm,
  type LegacyCriterion,
  type LegacyType,
} from "@/lib/legacy-catalogue";
import { normalizeLabel } from "@/lib/serie-input";

/**
 * The old software's catalogue (RETOUR-LABO-30-09.md, slice J): the 176
 * regulation sources, the 634 product types and their criteria, from the
 * three CSV files `scripts/legacy/extract-legacy.py` writes.
 *
 *   mode=analyse → what would be written, nothing written;
 *   mode=commit  → one transaction, idempotent (re-running changes nothing).
 *
 * Q39 defaults: a type the September workbook already holds keeps the
 * workbook's criteria and only gains its regulation; a type the old
 * software alone knows is created with its criteria; a type unused since
 * 2025 comes in inactive. Unknown parameters are listed, never created
 * unless asked (`createMissing`).
 */

const MAX_CHARS = 20 * 1024 * 1024;

type Body = { regulations?: unknown; types?: unknown; criteria?: unknown; mode?: unknown; createMissing?: unknown };

function csvRows(value: unknown, label: string): { rows: string[][]; error: string | null } {
  if (typeof value !== "string" || !value.trim()) return { rows: [], error: `Le fichier ${label} manque.` };
  if (value.length > MAX_CHARS) return { rows: [], error: `Le fichier ${label} est trop volumineux.` };
  const text = value.replace(/^﻿/, "");
  return { rows: parseCsv(text, detectDelimiter(text)), error: null };
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const mode = body.mode === "commit" ? "commit" : "analyse";
  const createMissing = body.createMissing === true;

  const files = {
    regulations: csvRows(body.regulations, "regulations.csv"),
    types: csvRows(body.types, "types.csv"),
    criteria: csvRows(body.criteria, "criteria.csv"),
  };
  const fileError = Object.values(files).find((f) => f.error)?.error;
  if (fileError) return NextResponse.json({ error: fileError }, { status: 400 });

  const regulations = parseLegacyRegulations(files.regulations.rows);
  const types = parseLegacyTypes(files.types.rows);
  const criteria = parseLegacyCriteria(files.criteria.rows);
  const parseError = regulations.error ?? types.error ?? criteria.error;
  if (parseError) return NextResponse.json({ error: parseError }, { status: 400 });

  // ---- what the database already knows ------------------------------------
  const [existingRegulations, existingTypes, indexes, norms, existingCriteria] = await Promise.all([
    prisma.regulation.findMany({ select: { id: true, legacyId: true, normalizedTitle: true } }),
    prisma.productType.findMany({ select: { id: true, name: true, normalizedName: true, clientId: true, legacyId: true, regulationId: true } }),
    Promise.all([loadParameterIndex("ALIMENTAIRE"), loadParameterIndex("EAU"), loadParameterIndex("AMBIANCE")]),
    prisma.norm.findMany({ select: { id: true, code: true, versions: { select: { id: true, version: true, current: true } } } }),
    prisma.criterion.findMany({ select: { productTypeId: true, parameterId: true, normVersionId: true } }),
  ]);
  // Food parameters first: the same germ exists for water and surfaces.
  const index = new Map<string, ParameterRef>();
  for (const partial of indexes) for (const [key, ref] of partial) if (!index.has(key)) index.set(key, ref);

  const regulationByLegacy = new Map(existingRegulations.filter((r) => r.legacyId !== null).map((r) => [r.legacyId!, r.id]));
  const regulationByTitle = new Map(existingRegulations.map((r) => [r.normalizedTitle, r.id]));
  const newRegulations = regulations.items.filter(
    (r) => !regulationByLegacy.has(r.legacyId) && !regulationByTitle.has(normalizeLabel(r.title))
  );

  // One legacy type per name: the one used most recently wins.
  const byName = new Map<string, LegacyType>();
  for (const t of [...types.items].sort((a, b) => (b.lastUse?.getTime() ?? 0) - (a.lastUse?.getTime() ?? 0))) {
    const key = normalizeLabel(t.name);
    if (!byName.has(key)) byName.set(key, t);
  }
  const typeByLegacy = new Map(existingTypes.filter((t) => t.legacyId !== null).map((t) => [t.legacyId!, t]));
  const commonByName = new Map(existingTypes.filter((t) => t.clientId === null).map((t) => [t.normalizedName, t]));

  type Decision =
    | { kind: "legacy-existing"; type: LegacyType; id: string; regulationId: string | null }
    | { kind: "workbook"; type: LegacyType; id: string; regulationId: string | null }
    | { kind: "create"; type: LegacyType };
  const decisions: Decision[] = [];
  const legacyIdToDbId = new Map<number, string>();
  const regulationIdOf = (t: LegacyType) =>
    t.regulationLegacyId !== null ? regulationByLegacy.get(t.regulationLegacyId) ?? null : null;
  for (const t of byName.values()) {
    const byLegacy = typeByLegacy.get(t.legacyId);
    if (byLegacy) {
      decisions.push({ kind: "legacy-existing", type: t, id: byLegacy.id, regulationId: byLegacy.regulationId });
      legacyIdToDbId.set(t.legacyId, byLegacy.id);
      continue;
    }
    const common = commonByName.get(normalizeLabel(t.name));
    if (common) {
      decisions.push({ kind: "workbook", type: t, id: common.id, regulationId: common.regulationId });
      legacyIdToDbId.set(t.legacyId, common.id);
      continue;
    }
    decisions.push({ kind: "create", type: t });
  }
  // Every legacy id of a duplicate name maps to the same database type.
  for (const t of types.items) {
    if (legacyIdToDbId.has(t.legacyId)) continue;
    const winner = byName.get(normalizeLabel(t.name));
    const id = winner ? legacyIdToDbId.get(winner.legacyId) : undefined;
    if (id) legacyIdToDbId.set(t.legacyId, id);
  }

  // ---- criteria: only for the types the old software alone knows --------------
  const legacyOwned = new Set<number>();
  for (const d of decisions) if (d.kind !== "workbook") legacyOwned.add(d.type.legacyId);
  for (const t of types.items) {
    const winner = byName.get(normalizeLabel(t.name));
    if (winner && legacyOwned.has(winner.legacyId)) legacyOwned.add(t.legacyId);
  }
  const unmatched = new Map<string, { label: string; count: number }>();
  const skipped = new Map<string, number>();
  const usable: (LegacyCriterion & { parameter: ParameterRef })[] = [];
  let missingC = 0;
  for (const c of criteria.items) {
    if (!legacyOwned.has(c.typeLegacyId)) {
      skipped.set("type du classeur (critères de septembre conservés)", (skipped.get("type du classeur (critères de septembre conservés)") ?? 0) + 1);
      continue;
    }
    if (!c.plan) {
      skipped.set(c.reason ?? "?", (skipped.get(c.reason ?? "?") ?? 0) + 1);
      continue;
    }
    const key = parameterKey(c.parameterName).key;
    const parameter = index.get(key);
    if (!parameter) {
      const entry = unmatched.get(key) ?? { label: c.parameterName, count: 0 };
      entry.count += 1;
      unmatched.set(key, entry);
      continue;
    }
    if (c.plan.mKind === "VALUE" && c.plan.bigM !== null && c.plan.bigM > (c.plan.m ?? 0) && c.plan.c === null) missingC += 1;
    usable.push({ ...c, parameter });
  }

  const normByCode = new Map(norms.map((n) => [n.code, n]));
  const versionKey = (normId: string, version: string) => `${normId}|${version}`;
  const versionByKey = new Map(norms.flatMap((n) => n.versions.map((v) => [versionKey(n.id, v.version), v.id] as const)));
  const normPairs = new Map<string, { code: string; version: string; label: string }>();
  for (const c of usable) {
    if (!usableNorm(c.norm)) continue;
    const parsed = parseNorm(c.norm);
    if (parsed.version) normPairs.set(`${parsed.code}|${parsed.version}`, parsed);
  }
  const criterionKey = (t: string, p: string, v: string | null) => `${t}|${p}|${v ?? ""}`;
  const existingKeys = new Set(existingCriteria.map((c) => criterionKey(c.productTypeId, c.parameterId, c.normVersionId)));

  const toCreate = decisions.filter((d) => d.kind === "create");
  const summary = {
    regulations: { total: regulations.items.length, new: newRegulations.length, withoutText: regulations.skipped },
    types: {
      total: types.items.length,
      distinct: byName.size,
      workbook: decisions.filter((d) => d.kind === "workbook").length,
      legacyExisting: decisions.filter((d) => d.kind === "legacy-existing").length,
      toCreate: toCreate.length,
      inactive: toCreate.filter((d) => !d.type.active).length,
    },
    criteria: {
      rows: criteria.items.length,
      usable: usable.length,
      missingC,
      skipped: [...skipped.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count),
      unmatchedParameters: [...unmatched.values()].sort((a, b) => b.count - a.count),
      unmatchedRows: [...unmatched.values()].reduce((n, u) => n + u.count, 0),
    },
    norms: normPairs.size,
  };
  if (mode === "analyse") return NextResponse.json({ mode, ...summary });

  // ---- commit ----------------------------------------------------------------
  const created = { regulations: 0, productTypes: 0, parameters: 0, norms: 0, versions: 0, criteria: 0, linked: 0 };
  try {
    await prisma.$transaction(
      async (tx) => {
        for (const r of newRegulations) {
          const row = await tx.regulation.create({
            data: { title: r.title, normalizedTitle: normalizeLabel(r.title), text: r.text, active: r.active, legacyId: r.legacyId, sortOrder: 20 },
            select: { id: true },
          });
          regulationByLegacy.set(r.legacyId, row.id);
          created.regulations += 1;
        }
        // A regulation already known by title gets its legacy id, so the next
        // run finds it that way.
        for (const r of regulations.items) {
          if (regulationByLegacy.has(r.legacyId)) continue;
          const id = regulationByTitle.get(normalizeLabel(r.title));
          if (id) {
            await tx.regulation.update({ where: { id }, data: { legacyId: r.legacyId } });
            regulationByLegacy.set(r.legacyId, id);
          }
        }

        if (createMissing) {
          for (const [key, entry] of unmatched) {
            const sample = criteria.items.find((c) => parameterKey(c.parameterName).key === key)!;
            const parameter = await tx.analysisParameter.create({
              data: { name: entry.label, category: "ALIMENTAIRE", unit: sample.unit },
              select: { id: true, name: true, category: true, unit: true },
            });
            index.set(key, parameter);
            created.parameters += 1;
            for (const c of criteria.items) {
              if (c.plan && legacyOwned.has(c.typeLegacyId) && parameterKey(c.parameterName).key === key) usable.push({ ...c, parameter });
            }
          }
        }

        for (const d of decisions) {
          const regulationId = regulationIdOf(d.type);
          if (d.kind === "create") {
            const row = await tx.productType.create({
              data: { name: d.type.name, normalizedName: normalizeLabel(d.type.name), family: "MICRO", active: d.type.active, legacyId: d.type.legacyId, regulationId },
              select: { id: true },
            });
            legacyIdToDbId.set(d.type.legacyId, row.id);
            for (const t of types.items) if (normalizeLabel(t.name) === normalizeLabel(d.type.name)) legacyIdToDbId.set(t.legacyId, row.id);
            created.productTypes += 1;
          } else if (d.regulationId === null && regulationId) {
            await tx.productType.update({ where: { id: d.id }, data: { regulationId } });
            created.linked += 1;
          }
        }

        for (const pair of normPairs.values()) {
          let norm = normByCode.get(pair.code);
          if (!norm) {
            const row = await tx.norm.create({ data: { code: pair.code }, select: { id: true, code: true } });
            norm = { ...row, versions: [] };
            normByCode.set(pair.code, norm);
            created.norms += 1;
          }
          if (!versionByKey.has(versionKey(norm.id, pair.version))) {
            const version = await tx.normVersion.create({ data: { normId: norm.id, version: pair.version, label: pair.label }, select: { id: true } });
            versionByKey.set(versionKey(norm.id, pair.version), version.id);
            created.versions += 1;
          }
        }

        const rows: { productTypeId: string; parameterId: string; normVersionId: string | null; unit: string | null; n: number; c: number | null; mKind: LegacyCriterion["plan"] extends infer P ? (P extends { mKind: infer K } ? K : never) : never; m: number | null; bigM: number | null }[] = [];
        const seen = new Set<string>();
        for (const c of usable) {
          const productTypeId = legacyIdToDbId.get(c.typeLegacyId);
          if (!productTypeId || !c.plan) continue;
          let normVersionId: string | null = null;
          if (usableNorm(c.norm)) {
            const parsed = parseNorm(c.norm);
            const norm = parsed.version ? normByCode.get(parsed.code) : undefined;
            normVersionId = norm ? versionByKey.get(versionKey(norm.id, parsed.version)) ?? null : null;
          }
          const key = criterionKey(productTypeId, c.parameter.id, normVersionId);
          if (existingKeys.has(key) || seen.has(key)) continue;
          seen.add(key);
          rows.push({
            productTypeId, parameterId: c.parameter.id, normVersionId, unit: c.unit ?? c.parameter.unit,
            n: c.plan.n, c: c.plan.c, mKind: c.plan.mKind, m: c.plan.m, bigM: c.plan.bigM,
          });
        }
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          await tx.criterion.createMany({ data: chunk });
          created.criteria += chunk.length;
        }

        const all = await tx.norm.findMany({ select: { id: true, versions: { select: { id: true, version: true, current: true } } } });
        for (const norm of all) {
          if (norm.versions.length === 0 || norm.versions.some((v) => v.current)) continue;
          const latest = [...norm.versions].sort((a, b) => b.version.localeCompare(a.version))[0];
          await tx.normVersion.update({ where: { id: latest.id }, data: { current: true } });
        }
      },
      { timeout: 300_000 }
    );
  } catch (error) {
    console.error("[import/legacy] failed", { error });
    return NextResponse.json({ error: "L'import a échoué — rien n'a été écrit." }, { status: 500 });
  }

  await logAudit({
    actorId: session.id,
    action: "LEGACY_CATALOGUE_IMPORTED",
    entity: "ProductType",
    entityId: null,
    metadata: { ...summary, createMissing, created },
  });
  return NextResponse.json({ mode, ...summary, created });
}
