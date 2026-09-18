import { NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parameterLabel, parseCriteriaSheet, type CriterionDraft, type SheetRow } from "@/lib/criteria-import";
import { loadParameterIndex } from "@/lib/criteria-match";
import { normalizeLabel } from "@/lib/serie-input";

/**
 * Import of the laboratory's criteria workbook (CRITERES.md §5) — one
 * endpoint, three modes:
 *
 *  mode=analyse → what the file contains and what would happen, row by row;
 *  mode=commit  → the import itself, idempotent (types, norms, versions and
 *                 criteria are matched on their keys and updated in place).
 *
 * Unknown germs are created as parameters only when the admin asks for it
 * (`createMissing=1`); otherwise their rows are refused and listed.
 */

const MAX_BYTES = 8 * 1024 * 1024;

function cellText(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("richText" in value) return value.richText.map((r) => r.text).join("");
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("text" in value) return String(value.text);
  }
  return String(value);
}

async function readSheet(file: File): Promise<SheetRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: SheetRow[] = [];
  sheet.eachRow({ includeEmpty: true }, (row, number) => {
    const values = (row.values as ExcelJS.CellValue[]).slice(1, 8);
    rows[number - 1] = Array.from({ length: 7 }, (_, i) => cellText(values[i] ?? null));
  });
  return rows;
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const file = form.get("file");
  const mode = form.get("mode") === "commit" ? "commit" : "analyse";
  const createMissing = form.get("createMissing") === "1";
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choisissez le fichier Excel des critères." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Fichier trop volumineux (8 Mo maximum)." }, { status: 400 });
  }

  let rows: SheetRow[];
  try {
    rows = await readSheet(file);
  } catch {
    return NextResponse.json({ error: "Fichier illisible — un classeur .xlsx est attendu." }, { status: 400 });
  }
  const parsed = parseCriteriaSheet(rows);

  // ---- match against the catalogue ------------------------------------------
  const [index, existingTypes, norms, criteria] = await Promise.all([
    loadParameterIndex(),
    prisma.productType.findMany({ where: { clientId: null }, select: { id: true, normalizedName: true } }),
    prisma.norm.findMany({ select: { id: true, code: true, versions: { select: { id: true, version: true, current: true } } } }),
    prisma.criterion.findMany({ select: { id: true, productTypeId: true, parameterId: true, normVersionId: true, unit: true, n: true, c: true, mKind: true, m: true, bigM: true } }),
  ]);
  const typeByKey = new Map(existingTypes.map((t) => [t.normalizedName, t.id]));
  const normByCode = new Map(norms.map((n) => [n.code, n]));
  const versionKey = (normId: string, version: string) => `${normId}|${version}`;
  const versionByKey = new Map(norms.flatMap((n) => n.versions.map((v) => [versionKey(n.id, v.version), v.id] as const)));
  const criterionKey = (t: string, p: string, v: string | null) => `${t}|${p}|${v ?? ""}`;
  const criterionByKey = new Map(criteria.map((c) => [criterionKey(c.productTypeId, c.parameterId, c.normVersionId), c]));

  const unmatched = new Map<string, { label: string; count: number }>();
  const matched: CriterionDraft[] = [];
  for (const draft of parsed.drafts) {
    if (index.has(draft.parameterKey)) matched.push(draft);
    else {
      const entry = unmatched.get(draft.parameterKey) ?? { label: parameterLabel(draft.parameterLabel), count: 0 };
      entry.count += 1;
      unmatched.set(draft.parameterKey, entry);
    }
  }
  const usable = createMissing ? parsed.drafts : matched;
  const typesToCreate = parsed.productTypes.filter((name) => !typeByKey.has(normalizeLabel(name)));
  const normPairs = new Map<string, { code: string; version: string; label: string }>();
  for (const d of usable) {
    if (d.normCode) normPairs.set(`${d.normCode}|${d.normVersion}`, { code: d.normCode, version: d.normVersion, label: d.normLabel });
  }

  const summary = {
    rows: parsed.drafts.length,
    refused: parsed.refused,
    productTypes: { total: parsed.productTypes.length, existing: parsed.productTypes.length - typesToCreate.length, toCreate: typesToCreate.length },
    parameters: { matched: matched.length, unmatched: [...unmatched.values()].sort((a, b) => b.count - a.count) },
    norms: normPairs.size,
    criteria: { usable: usable.length, refusedUnknownParameter: parsed.drafts.length - usable.length, existing: criteria.length, duplicates: parsed.duplicates.length },
    duplicates: parsed.duplicates,
  };

  if (mode === "analyse") return NextResponse.json({ mode, ...summary });

  // ---- commit ----------------------------------------------------------------
  let created = { productTypes: 0, parameters: 0, norms: 0, versions: 0, criteria: 0, updated: 0 };
  try {
    created = await prisma.$transaction(
      async (tx) => {
        const counts = { productTypes: 0, parameters: 0, norms: 0, versions: 0, criteria: 0, updated: 0 };

        // Unknown germs become parameters (food microbiology) when asked.
        if (createMissing) {
          for (const [key, entry] of unmatched) {
            const draft = parsed.drafts.find((d) => d.parameterKey === key)!;
            const spellings = [...new Set(parsed.drafts.filter((d) => d.parameterKey === key).map((d) => d.parameterLabel))].filter((l) => l !== entry.label);
            const parameter = await tx.analysisParameter.create({
              data: { name: entry.label, category: "ALIMENTAIRE", unit: draft.unit || null, aliases: spellings.length ? spellings.join("\n") : null },
              select: { id: true, name: true, category: true, unit: true },
            });
            index.set(key, parameter);
            counts.parameters += 1;
          }
        }

        for (const name of typesToCreate) {
          const type = await tx.productType.create({
            data: { name, normalizedName: normalizeLabel(name), family: "MICRO" },
            select: { id: true },
          });
          typeByKey.set(normalizeLabel(name), type.id);
          counts.productTypes += 1;
        }

        for (const pair of normPairs.values()) {
          let norm = normByCode.get(pair.code);
          if (!norm) {
            const row = await tx.norm.create({ data: { code: pair.code }, select: { id: true, code: true } });
            norm = { ...row, versions: [] };
            normByCode.set(pair.code, norm);
            counts.norms += 1;
          }
          if (!versionByKey.has(versionKey(norm.id, pair.version))) {
            const version = await tx.normVersion.create({
              data: { normId: norm.id, version: pair.version, label: pair.label },
              select: { id: true },
            });
            versionByKey.set(versionKey(norm.id, pair.version), version.id);
            counts.versions += 1;
          }
        }

        const toCreate: {
          productTypeId: string; parameterId: string; normVersionId: string | null; unit: string | null;
          n: number; c: number | null; mKind: CriterionDraft["mKind"]; m: number | null; bigM: number | null;
        }[] = [];
        for (const draft of usable) {
          const productTypeId = typeByKey.get(draft.productKey);
          const parameter = index.get(draft.parameterKey);
          if (!productTypeId || !parameter) continue;
          const norm = normByCode.get(draft.normCode);
          const normVersionId = norm ? versionByKey.get(versionKey(norm.id, draft.normVersion)) ?? null : null;
          const data = {
            productTypeId, parameterId: parameter.id, normVersionId, unit: draft.unit || null,
            n: draft.n, c: draft.c, mKind: draft.mKind, m: draft.m, bigM: draft.bigM,
          };
          const existing = criterionByKey.get(criterionKey(productTypeId, parameter.id, normVersionId));
          if (!existing) {
            toCreate.push(data);
          } else if (
            existing.unit !== data.unit || existing.n !== data.n || existing.c !== data.c ||
            existing.mKind !== data.mKind || existing.m !== data.m || existing.bigM !== data.bigM
          ) {
            await tx.criterion.update({ where: { id: existing.id }, data });
            counts.updated += 1;
          }
        }
        // The same (type, parameter, version) twice in the file: keep the first.
        const seen = new Set<string>();
        const unique = toCreate.filter((c) => {
          const key = criterionKey(c.productTypeId, c.parameterId, c.normVersionId);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        for (let i = 0; i < unique.length; i += 200) {
          const chunk = unique.slice(i, i + 200);
          await tx.criterion.createMany({ data: chunk });
          counts.criteria += chunk.length;
        }

        // Every norm has one version in force: the most recent, unless the admin chose.
        const all = await tx.norm.findMany({ select: { id: true, versions: { select: { id: true, version: true, current: true } } } });
        for (const norm of all) {
          if (norm.versions.length === 0 || norm.versions.some((v) => v.current)) continue;
          const latest = [...norm.versions].sort((a, b) => b.version.localeCompare(a.version))[0];
          await tx.normVersion.update({ where: { id: latest.id }, data: { current: true } });
        }
        return counts;
      },
      { timeout: 180_000 }
    );
  } catch (error) {
    console.error("[import/criteres] failed", { error });
    return NextResponse.json({ error: "L'import a échoué — rien n'a été écrit." }, { status: 500 });
  }

  await logAudit({
    actorId: session.id,
    action: "CRITERIA_IMPORTED",
    entity: "Criterion",
    entityId: null,
    metadata: { file: file.name, rows: parsed.drafts.length, refused: parsed.refused.length, createMissing, created },
  });

  return NextResponse.json({ mode, ...summary, created });
}
