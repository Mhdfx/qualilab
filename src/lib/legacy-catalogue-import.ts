import "server-only";
import { createHash } from "node:crypto";
import type { Family, Prisma } from "@/generated/prisma/client";
import { logAudit } from "./audit";
import { catalogueKey } from "./billing";
import { detectDelimiter, parseCsv } from "./csv";
import {
  IN_FLIGHT_STATUSES,
  criteriaEditedByHand,
  familyEditedByHand,
  normKey,
  parseLegacyCriteria,
  parseLegacyRegulations,
  parseLegacyTypes,
  planLegacyCatalogue,
  regulationEditedByHand,
  splitOrigin,
  type CataloguePlan,
  type CatalogueSnapshot,
  type InFlightStatus,
  type LegacyRegulation,
} from "./legacy-catalogue";
import { prisma } from "./prisma";
import { normalizeLabel } from "./serie-input";

/**
 * The « Catalogue de l'ancien logiciel » import (RETOUR-LABO-30-09.md, slice
 * J; RETOUR-LABO-16-10.md F3) — what `POST /api/admin/import/legacy` runs
 * once the caller is known to be ADMIN. Reads the database, plans with
 * `planLegacyCatalogue` (pure), and in `commit` writes the plan in one
 * transaction, planned against what that transaction reads.
 *
 *   mode=analyse → what would be written, nothing written, and the plan's
 *                  fingerprint (`planHash`);
 *   mode=commit  → one transaction, idempotent (re-running changes nothing),
 *                  refused (409, nothing written) when:
 *                    - the plan is no longer the one analysed (`planHash`
 *                      missing or different: a family edited meanwhile,
 *                      another session's import, « créer les paramètres
 *                      inconnus » toggled);
 *                    - a parameter to create looks like an existing one,
 *                      unless `confirmSimilar` (an alias in /admin/parametres
 *                      is the usual answer, then a new analysis);
 *                    - samples in progress change verdict (criteria that
 *                      start to apply, or rows deactivated under them — a
 *                      row deleted in the old software (f) included),
 *                      unless `confirmInFlight`.
 *
 * Step (f) deactivates — never deletes — the rows an earlier import brought
 * in from rows the old software had deleted from their family's grid
 * (OBSOLETE = 2), before the copies of (b), in the same transaction.
 *
 * Each existing family the reprise changes gets its line in the journal
 * (`LEGACY_CATALOGUE_REPRISE`, the regulation linked included), written in
 * the same transaction as the change; the run itself is journalled as
 * `LEGACY_CATALOGUE_IMPORTED` (counts and ids only — the lists name
 * clients' families).
 */

const MAX_CHARS = 20 * 1024 * 1024;

type Db = Prisma.TransactionClient;

export type LegacyImportInput = {
  /** The three CSV files as read by the browser — anything else is refused. */
  files: { regulations: unknown; types: unknown; criteria: unknown };
  mode: "analyse" | "commit";
  createMissing: boolean;
  /** commit: the fingerprint the analysis returned. */
  planHash?: string | null;
  /** commit: the admin read the samples in progress whose verdicts change. */
  confirmInFlight?: boolean;
  /** commit: the admin checked that the look-alike parameters are distinct germs. */
  confirmSimilar?: boolean;
  actorId: string;
};

export type LegacyImportResult = { status: number; body: Record<string, unknown> };

export const STALE_PLAN = "Le catalogue a changé depuis l'analyse : relancez l'analyse.";

function csvRows(value: unknown, label: string): { rows: string[][]; error: string | null } {
  if (typeof value !== "string" || !value.trim()) return { rows: [], error: `Le fichier ${label} manque.` };
  if (value.length > MAX_CHARS) return { rows: [], error: `Le fichier ${label} est trop volumineux.` };
  const text = value.replace(/^﻿/, "");
  return { rows: parseCsv(text, detectDelimiter(text)), error: null };
}

/**
 * The catalogue as the planner reads it, plus how to find a norm version by
 * its key. Sequential reads: inside the transaction they share one
 * connection anyway. Stable orders, so two analyses plan the same thing.
 */
async function loadCatalogue(db: Db, regulationLegacyIds: number[]) {
  const natures = await db.analysisNature.findMany({
    select: { id: true, code: true, label: true, legacyId: true, family: true, legacyType: true, active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
  });
  const parameters = await db.analysisParameter.findMany({
    select: {
      id: true, name: true, category: true, family: true, unit: true, aliases: true,
      alertOnExceed: true, limitValue: true, threshold: true, calcFactor: true,
    },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });
  const types = await db.productType.findMany({
    select: { id: true, name: true, normalizedName: true, clientId: true, legacyId: true, natureId: true, family: true, active: true, regulationId: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const criteria = await db.criterion.findMany({
    select: { id: true, productTypeId: true, parameterId: true, normVersionId: true, active: true, unit: true, n: true, c: true, mKind: true, m: true, bigM: true },
    orderBy: { id: "asc" },
  });
  const norms = await db.norm.findMany({ select: { id: true, code: true, versions: { select: { id: true, version: true } } } });
  // What a person changed by hand is never undone (F3): the domain, the
  // criteria grid, the regulation — read from the journal.
  const edits = await db.auditLog.findMany({
    where: { action: { in: ["PRODUCT_TYPE_UPDATED", "CRITERIA_UPDATED"] }, entity: "ProductType" },
    select: { action: true, entityId: true, metadata: true },
  });
  const services = await db.labService.findMany({ where: { active: true }, select: { name: true, category: true } });
  const inFlight = await db.sample.groupBy({
    by: ["productTypeId", "type", "status"],
    where: { productTypeId: { not: null }, status: { in: [...IN_FLIGHT_STATUSES] } },
    _count: { _all: true },
  });

  const editedBy = (action: string, rule: (metadata: string | null) => boolean) =>
    new Set(edits.filter((e) => e.action === action && e.entityId && rule(e.metadata)).map((e) => e.entityId!));
  const familyEdited = editedBy("PRODUCT_TYPE_UPDATED", familyEditedByHand);
  const regulationEdited = editedBy("PRODUCT_TYPE_UPDATED", regulationEditedByHand);
  const criteriaEdited = editedBy("CRITERIA_UPDATED", criteriaEditedByHand);
  // The family « Scinder par domaine » created, and its source (step (f) lists the
  // deleted rows the split copied into it): read from the split's own save.
  const splitFrom = new Map<string, string>();
  for (const e of edits) {
    if (e.action !== "CRITERIA_UPDATED") continue;
    const origin = splitOrigin(e.metadata);
    if (origin && e.entityId === origin.to) splitFrom.set(origin.to, origin.from);
  }
  const keyOfVersion = new Map<string, string>();
  const versionIdByKey = new Map<string, string>();
  const normIdByCode = new Map<string, string>();
  for (const norm of norms) {
    normIdByCode.set(norm.code, norm.id);
    for (const version of norm.versions) {
      const key = normKey(norm.code, version.version);
      keyOfVersion.set(version.id, key);
      versionIdByKey.set(key, version.id);
    }
  }
  const snapshot: CatalogueSnapshot = {
    natures,
    parameters,
    types: types.map((t) => ({
      ...t,
      familyEdited: familyEdited.has(t.id),
      criteriaEdited: criteriaEdited.has(t.id),
      regulationEdited: regulationEdited.has(t.id),
      splitFrom: splitFrom.get(t.id) ?? null,
    })),
    criteria: criteria.map((c) => ({ ...c, normKey: c.normVersionId ? keyOfVersion.get(c.normVersionId) ?? null : null })),
    normKeys: [...versionIdByKey.keys()].sort(),
    regulationLegacyIds: [...new Set(regulationLegacyIds)].sort((a, b) => a - b),
    pricedKeys: [...new Set(services.map((s) => catalogueKey(s.name, s.category)))].sort(),
    inFlight: inFlight
      .map((row) => ({ productTypeId: row.productTypeId!, type: row.type, status: row.status as InFlightStatus, count: row._count._all }))
      .sort((a, b) => a.productTypeId.localeCompare(b.productTypeId) || a.type.localeCompare(b.type) || a.status.localeCompare(b.status)),
  };
  return { snapshot, versionIdByKey, normIdByCode };
}

/**
 * The regulations of the old software the database does not hold yet, those
 * it holds under the same title without their legacy id, and every legacy id
 * a family may be linked to once they are written.
 */
async function planRegulations(db: Db, items: LegacyRegulation[]) {
  const existing = await db.regulation.findMany({ select: { id: true, legacyId: true, normalizedTitle: true }, orderBy: { id: "asc" } });
  const byLegacy = new Map(existing.filter((r) => r.legacyId !== null).map((r) => [r.legacyId!, r.id]));
  const byTitle = new Map(existing.map((r) => [r.normalizedTitle, r.id]));
  const toCreate = items.filter((r) => !byLegacy.has(r.legacyId) && !byTitle.has(normalizeLabel(r.title)));
  const matched = items.flatMap((r) => {
    if (byLegacy.has(r.legacyId)) return [];
    const id = byTitle.get(normalizeLabel(r.title));
    return id ? [{ id, legacyId: r.legacyId }] : [];
  });
  const knownLegacyIds = [...byLegacy.keys(), ...items.map((r) => r.legacyId)];
  return { byLegacy, toCreate, matched, knownLegacyIds };
}

/**
 * The plan's fingerprint: what the admin read in the analysis and what the
 * commit is about to write must be the same plan (the summary, and every
 * row, copy, update and link it stands for).
 */
function planHash(plan: CataloguePlan, regulations: { toCreate: LegacyRegulation[]; matched: { id: string; legacyId: number }[] }): string {
  const fingerprint = {
    summary: plan.summary,
    typesToCreate: plan.typesToCreate.map((t) => [t.ref, t.natureId, t.family, t.active]),
    parameters: plan.parameters.map((p) => [p.ref, p.unit, p.alertOnExceed]),
    natureUpdates: plan.natureUpdates.map((u) => [u.typeId, u.natureId, u.family]),
    links: plan.links.map((l) => [l.typeId, l.regulationLegacyId]),
    retirements: plan.retirements.map((r) => r.criterionId),
    copies: plan.copies.map((c) => [c.criterionId, c.parameterRef]),
    tolerances: plan.tolerances.map((t) => t.criterionId),
    rows: plan.rows.map((r) => [r.productTypeRef, r.parameterRef, r.norm?.key ?? null, r.unit, r.n, r.c, r.mKind, r.m, r.bigM]),
    regulations: [regulations.toCreate.map((r) => r.legacyId), regulations.matched.map((r) => [r.id, r.legacyId])],
  };
  return createHash("sha256").update(JSON.stringify(fingerprint)).digest("hex");
}

/** Counts only: the journal's metadata is a TEXT column, and the lists name clients' families. */
function auditCounts(plan: CataloguePlan) {
  const { types, criteria, norms, normsToCreate, reprise } = plan.summary;
  return {
    types,
    criteria: {
      rows: criteria.rows,
      usable: criteria.usable,
      missingC: criteria.missingC,
      skipped: criteria.skipped,
      unmatchedParameters: criteria.unmatchedParameters.length,
      unmatchedRows: criteria.unmatchedRows,
      toInsert: criteria.toInsert,
      alreadyPresent: criteria.alreadyPresent,
    },
    norms,
    normsToCreate,
    reprise: {
      natures: {
        assigned: reprise.natures.assigned,
        created: reprise.natures.created,
        familyChanged: reprise.natures.familyChanged,
        unknown: reprise.natures.unknown.length,
        conflicts: reprise.natures.conflicts.length,
        unclassified: reprise.natures.unclassified.length,
      },
      rebinding: { ...reprise.rebinding, collisions: reprise.rebinding.collisions.length },
      parameters: reprise.parameters.length,
      nearDuplicates: reprise.nearDuplicates,
      unpriced: reprise.parameters.filter((p) => !p.priced).length,
      fill: reprise.fill,
      stillEmpty: { active: reprise.stillEmpty.active.length, inactive: reprise.stillEmpty.inactive },
      links: reprise.links,
      handEdited: reprise.handEdited.map((f) => f.id),
      orphanedSources: reprise.orphanedSources.length,
      inFlight: { startJudged: reprise.inFlight.startJudged, loseCriteria: reprise.inFlight.loseCriteria, retired: reprise.inFlight.retired },
      tolerances: reprise.tolerances,
      retired: { rows: reprise.retired.rows, families: reprise.retired.families, leftActive: reprise.retired.leftActive.map((f) => f.id) },
    },
  };
}

const PLANNED_REF = /^(nouveau-parametre|nouvelle-famille):/;

type Refusal = { refused: LegacyImportResult };

export async function importLegacyCatalogue({
  files: raw,
  mode,
  createMissing,
  planHash: expectedHash = null,
  confirmInFlight = false,
  confirmSimilar = false,
  actorId,
}: LegacyImportInput): Promise<LegacyImportResult> {
  const files = {
    regulations: csvRows(raw.regulations, "regulations.csv"),
    types: csvRows(raw.types, "types.csv"),
    criteria: csvRows(raw.criteria, "criteria.csv"),
  };
  const fileError = Object.values(files).find((f) => f.error)?.error;
  if (fileError) return { status: 400, body: { error: fileError } };

  const regulations = parseLegacyRegulations(files.regulations.rows);
  const types = parseLegacyTypes(files.types.rows);
  const criteria = parseLegacyCriteria(files.criteria.rows);
  const parseError = regulations.error ?? types.error ?? criteria.error;
  if (parseError) return { status: 400, body: { error: parseError } };

  const regulationSummary = (regs: { toCreate: unknown[]; matched: unknown[] }) => ({
    total: regulations.items.length,
    new: regs.toCreate.length,
    matched: regs.matched.length,
    withoutText: regulations.skipped,
  });
  const planFrom = (snapshot: CatalogueSnapshot) =>
    planLegacyCatalogue({ legacyTypes: types.items, legacyCriteria: criteria.items, snapshot, createMissing });

  if (mode === "analyse") {
    const regs = await planRegulations(prisma, regulations.items);
    const { snapshot } = await loadCatalogue(prisma, regs.knownLegacyIds);
    const plan = planFrom(snapshot);
    return { status: 200, body: { mode, regulations: regulationSummary(regs), ...plan.summary, planHash: planHash(plan, regs) } };
  }

  // ---- commit: read, plan, check and write in one transaction -----------------
  const created = {
    regulations: 0, regulationsMatched: 0, productTypes: 0, parameters: 0, norms: 0, versions: 0, criteria: 0, linked: 0,
    natures: 0, families: 0, retired: 0, copies: 0, deactivated: 0, tolerancesCleared: 0,
  };
  let outcome: { plan: CataloguePlan; regs: Awaited<ReturnType<typeof planRegulations>> } | Refusal;
  try {
    outcome = await prisma.$transaction(
      async (tx): Promise<typeof outcome> => {
        const regs = await planRegulations(tx, regulations.items);
        const { snapshot, versionIdByKey, normIdByCode } = await loadCatalogue(tx, regs.knownLegacyIds);
        const plan = planFrom(snapshot);

        // Nothing is written unless it is the plan the admin read and agreed to.
        const { nearDuplicates, inFlight } = plan.summary.reprise;
        if (!expectedHash || expectedHash !== planHash(plan, regs)) {
          return { refused: { status: 409, body: { error: STALE_PLAN, code: "stale" } } };
        }
        if (nearDuplicates > 0 && !confirmSimilar) {
          return {
            refused: {
              status: 409,
              body: {
                error: `${nearDuplicates} paramètre${nearDuplicates > 1 ? "s" : ""} à créer ressemble${nearDuplicates > 1 ? "nt" : ""} à un paramètre existant : ajoutez l'orthographe en alias dans « Paramètres » puis relancez l'analyse, ou confirmez que ce sont des germes distincts.`,
                code: "similar",
              },
            },
          };
        }
        const affected = inFlight.startJudged + inFlight.loseCriteria + inFlight.retired;
        if (affected > 0 && !confirmInFlight) {
          return {
            refused: {
              status: 409,
              body: {
                error: `${affected} échantillon(s) en cours changent de verdict avec cet import : confirmez-le, ou attendez qu'ils soient validés.`,
                code: "in-flight",
              },
            },
          };
        }

        // Regulations first: the new families point at them.
        for (const r of regs.toCreate) {
          const row = await tx.regulation.create({
            data: { title: r.title, normalizedTitle: normalizeLabel(r.title), text: r.text, active: r.active, legacyId: r.legacyId, sortOrder: 20 },
            select: { id: true },
          });
          regs.byLegacy.set(r.legacyId, row.id);
          created.regulations += 1;
        }
        // A regulation already known by title gets its legacy id, so the next
        // run finds it that way (its id is in LEGACY_CATALOGUE_IMPORTED).
        for (const r of regs.matched) {
          if (regs.byLegacy.has(r.legacyId)) continue;
          await tx.regulation.update({ where: { id: r.id }, data: { legacyId: r.legacyId } });
          regs.byLegacy.set(r.legacyId, r.id);
          created.regulationsMatched += 1;
        }
        const regulationIdOf = (legacyId: number | null) => (legacyId !== null ? regs.byLegacy.get(legacyId) ?? null : null);

        // The planned rows name the new parameters and families by a ref.
        const idByRef = new Map<string, string>();
        const idOf = (ref: string) => {
          if (!PLANNED_REF.test(ref)) return ref;
          const id = idByRef.get(ref);
          if (!id) throw new Error(`unresolved ref ${ref}`);
          return id;
        };

        for (const p of plan.parameters) {
          const row = await tx.analysisParameter.create({
            data: {
              name: p.name,
              category: p.category,
              family: p.family,
              unit: p.unit,
              aliases: p.aliases,
              alertOnExceed: p.alertOnExceed,
              limitValue: p.limitValue,
              threshold: p.threshold,
              calcFactor: p.calcFactor,
            },
            select: { id: true },
          });
          idByRef.set(p.ref, row.id);
          created.parameters += 1;
        }

        // (a) Only where the family has no nature yet, its domain only where
        // still the default: the conditions are repeated in the WHERE.
        const byTarget = new Map<string, { natureId: string; family: Family | null; ids: string[] }>();
        for (const u of plan.natureUpdates) {
          const key = `${u.natureId}|${u.family ?? ""}`;
          const group = byTarget.get(key) ?? { natureId: u.natureId, family: u.family, ids: [] };
          group.ids.push(u.typeId);
          byTarget.set(key, group);
        }
        for (const group of byTarget.values()) {
          const { count } = await tx.productType.updateMany({
            where: { id: { in: group.ids }, natureId: null, ...(group.family ? { family: "MICRO" as const } : {}) },
            data: { natureId: group.natureId, ...(group.family ? { family: group.family } : {}) },
          });
          created.natures += count;
        }

        for (const p of plan.typesToCreate) {
          const row = await tx.productType.create({
            data: {
              name: p.name,
              normalizedName: p.normalizedName,
              family: p.family,
              natureId: p.natureId,
              active: p.active,
              legacyId: p.legacyId,
              regulationId: regulationIdOf(p.regulationLegacyId),
            },
            select: { id: true },
          });
          idByRef.set(p.ref, row.id);
          created.productTypes += 1;
        }
        // The links planned (no regulation yet, never one changed by hand),
        // the condition repeated in the WHERE; each one journalled below.
        const linkedTo = new Map<string, string>();
        for (const link of plan.links) {
          const regulationId = regulationIdOf(link.regulationLegacyId);
          if (!regulationId) continue;
          const { count } = await tx.productType.updateMany({ where: { id: link.typeId, regulationId: null }, data: { regulationId } });
          if (count === 0) continue;
          linkedTo.set(link.typeId, regulationId);
          created.linked += 1;
        }

        for (const norm of plan.normsToCreate) {
          let normId = normIdByCode.get(norm.code);
          if (!normId) {
            normId = (await tx.norm.create({ data: { code: norm.code }, select: { id: true } })).id;
            normIdByCode.set(norm.code, normId);
            created.norms += 1;
          }
          const version = await tx.normVersion.create({ data: { normId, version: norm.version, label: norm.label }, select: { id: true } });
          versionIdByKey.set(norm.key, version.id);
          created.versions += 1;
        }

        // (f) The rows the old software deleted from their family's grid
        // (OBSOLETE = 2): deactivated, never deleted — the samples already
        // recorded keep their analyses. Before (b), which never copies them.
        for (let i = 0; i < plan.retirements.length; i += 200) {
          const chunk = plan.retirements.slice(i, i + 200);
          const { count } = await tx.criterion.updateMany({ where: { id: { in: chunk.map((r) => r.criterionId) }, active: true }, data: { active: false } });
          created.retired += count;
        }

        // (b) N2 / OLD31: the copy first, then the old row deactivated — never
        // an UPDATE of its parameter.
        for (let i = 0; i < plan.copies.length; i += 200) {
          const chunk = plan.copies.slice(i, i + 200);
          await tx.criterion.createMany({
            data: chunk.map((c) => ({
              productTypeId: c.productTypeId,
              parameterId: idOf(c.parameterRef),
              normVersionId: c.normVersionId,
              unit: c.unit,
              n: c.n,
              c: c.c,
              mKind: c.mKind,
              m: c.m,
              bigM: c.bigM,
            })),
          });
          created.copies += chunk.length;
          const { count } = await tx.criterion.updateMany({ where: { id: { in: chunk.map((c) => c.criterionId) }, active: true }, data: { active: false } });
          created.deactivated += count;
        }

        // F2: the tolerance c an earlier import left where it means nothing
        // (absence tests, limitless rows) — cleared, no verdict read it.
        for (let i = 0; i < plan.tolerances.length; i += 200) {
          const chunk = plan.tolerances.slice(i, i + 200);
          const { count } = await tx.criterion.updateMany({ where: { id: { in: chunk.map((t) => t.criterionId) } }, data: { c: null } });
          created.tolerancesCleared += count;
        }

        // Slice J and (c): the old software's criteria.
        for (let i = 0; i < plan.rows.length; i += 200) {
          const chunk = plan.rows.slice(i, i + 200);
          await tx.criterion.createMany({
            data: chunk.map((row) => {
              const normVersionId = row.norm ? versionIdByKey.get(row.norm.key) : null;
              if (normVersionId === undefined) throw new Error(`unknown norm version ${row.norm?.key}`);
              return {
                productTypeId: idOf(row.productTypeRef),
                parameterId: idOf(row.parameterRef),
                normVersionId,
                unit: row.unit,
                n: row.n,
                c: row.c,
                mKind: row.mKind,
                m: row.m,
                bigM: row.bigM,
              };
            }),
          });
          created.criteria += chunk.length;
        }
        created.families = plan.summary.reprise.fill.families;

        const all = await tx.norm.findMany({ select: { id: true, versions: { select: { id: true, version: true, current: true } } } });
        for (const norm of all) {
          if (norm.versions.length === 0 || norm.versions.some((v) => v.current)) continue;
          const latest = [...norm.versions].sort((a, b) => b.version.localeCompare(a.version))[0];
          await tx.normVersion.update({ where: { id: latest.id }, data: { current: true } });
        }

        // The journal of each existing family changed, with the change itself
        // (the regulation as linked; a link that did not happen is dropped).
        const journal = plan.journal.flatMap((entry) => {
          const { regulation, ...rest } = entry.metadata;
          const after = linkedTo.get(entry.typeId);
          const metadata = regulation && after ? { ...rest, regulation: { ...regulation, after } } : rest;
          return Object.keys(metadata).length > 1 ? [{ typeId: entry.typeId, metadata }] : [];
        });
        for (let i = 0; i < journal.length; i += 200) {
          await tx.auditLog.createMany({
            data: journal.slice(i, i + 200).map((entry) => ({
              actorId,
              action: "LEGACY_CATALOGUE_REPRISE",
              entity: "ProductType",
              entityId: entry.typeId,
              metadata: JSON.stringify(entry.metadata),
            })),
          });
        }
        return { plan, regs };
      },
      { timeout: 300_000 }
    );
  } catch (error) {
    console.error("[import/legacy] failed", { error });
    return { status: 500, body: { error: "L'import a échoué — rien n'a été écrit." } };
  }
  if ("refused" in outcome) return outcome.refused;

  const { plan, regs } = outcome;
  const summary = { regulations: regulationSummary(regs), ...plan.summary };
  await logAudit({
    actorId,
    action: "LEGACY_CATALOGUE_IMPORTED",
    entity: "ProductType",
    entityId: null,
    metadata: {
      regulations: summary.regulations,
      regulationsMatched: regs.matched.map((r) => r.id),
      ...auditCounts(plan),
      createMissing,
      confirmInFlight,
      confirmSimilar,
      created,
    },
  });
  return { status: 200, body: { mode, ...summary, created } };
}
