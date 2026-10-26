import "server-only";
import type { Family, LineKind, SampleType } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { buildCatalogueIndex, catalogueKey, type CatalogueEntry } from "./billing";
import { germCount } from "./family-list";
import { toMoney } from "./money";
import {
  natureHomeFromJournal,
  programmeNatureFamilies,
  type NatureChange,
  type ProgrammeContext,
  type ProgrammeNatureRef,
} from "./programme-input";
import { twinOfCode, type SampleTwin } from "./sample-code";
import { PROGRAMMABLE_STATUSES } from "./sample-status";

/**
 * What the programme d'analyse reads and writes (PROGRAMME.md §4–5): the
 * line with its current programme, and the referential the fiche needs —
 * the product types the client may use with their criteria, the parameters
 * of the nature's category, the profiles, the norm versions of each
 * parameter, and — for the billing roles only (the owner's rule of 25/10,
 * `seesBilling`) — the catalogue prices. Shared by GET and PUT so the rules
 * are checked against exactly what the screen was offered.
 *
 * No technician is chosen here any more (« prise en charge libre », 13/10 —
 * PROGRAMME.md §10): the line carries who took it at the bench
 * (`technician`, `assignedAt`) for the fiche to show, read-only, and the
 * programme itself — what the fiche edits and the journal compares — holds
 * no technician at all.
 *
 * RETOUR-LABO-06-10.md §5 (V3, Q49 by default): the fiche may change the
 * line's nature to another active nature of the same family — and, since
 * 16/10 (Q129, F9), to an « Autres analyses » nature of the same kind of
 * sample, and back (`programmeNatureFamilies`); the referential then lists
 * those natures and can be computed for any of them (its parameters,
 * profiles and prices follow the nature's category). Each parameter carries
 * its family (`AnalysisParameter.family`).
 */

export const PROGRAMME_SAMPLE_SELECT = {
  id: true,
  code: true,
  controlCode: true,
  status: true,
  lineNumber: true,
  lineKind: true,
  type: true,
  clientId: true,
  client: { select: { id: true, name: true } },
  serie: {
    select: {
      id: true,
      serialNumber: true,
      kind: true,
      receivedAt: true,
      // The entry check recomputes C1 (délai prélèvement → laboratoire).
      startedAt: true,
      endedAt: true,
      arrivedAt: true,
      samplingTimeDeclared: true,
    },
  },
  natureId: true,
  nature: { select: { id: true, code: true, label: true, family: true, legacyType: true, defaultLineKind: true, active: true } },
  produit: true,
  numeroLot: true,
  lieu: true,
  quantity: true,
  quantityUnit: true,
  receivedAt: true,
  receptionTemperature: true,
  conformity: true,
  conformityReason: true,
  conformityNote: true,
  receptionExploitable: true,
  // C5 only: C3 (emballage) is no longer shown, nor asked (16/10, Q70).
  receptionIdentificationOk: true,
  storageClass: true,
  receptionTemperatureSource: true,
  // C7: the DLC of a food sample, in the entry check.
  expiryDate: true,
  analysisBlocked: true,
  unitCount: true,
  productTypeId: true,
  productType: { select: { id: true, name: true } },
  // Who took the line at the bench (« Prendre en charge », or a first
  // result) and when — shown on the fiche, never written by the programme.
  technicianId: true,
  technician: { select: { id: true, name: true } },
  assignedAt: true,
  priority: true,
  dueAt: true,
  testPortion: true,
  programmeNote: true,
  programmedAt: true,
  programmedById: true,
  programmedBy: { select: { id: true, name: true } },
  cancelReason: true,
  parameters: {
    select: {
      parameterId: true,
      // A legacy per-analysis technician (before 13/10): read-only, kept
      // by the PUT on the analyses that stay.
      technicianId: true,
      normVersionId: true,
      dilutionFactor: true,
      note: true,
      parameter: { select: { id: true, name: true, unit: true, calcFactor: true, family: true, category: true } },
      technician: { select: { id: true, name: true } },
      normVersion: { select: { id: true, label: true, current: true } },
    },
    orderBy: { parameter: { name: "asc" as const } },
  },
} as const;

export async function loadProgrammeSample(id: string) {
  const row = await prisma.sample.findUnique({ where: { id }, select: PROGRAMME_SAMPLE_SELECT });
  if (!row) return null;
  return { ...row, natureHome: await loadNatureHome(row) };
}

/** The programme's journal entries that changed a line's nature (`metadata.nature`, Q49 / Q129). */
const PROGRAMME_ACTIONS = ["SAMPLE_PROGRAMMED", "SAMPLE_PROGRAMME_UPDATED"];

/**
 * The domain a single-sample line on « Autres analyses » came from — the
 * only one it may go back to (`programmeNatureFamilies`). Read only when it
 * matters: a line elsewhere, or with its code's letter, needs nothing.
 */
async function loadNatureHome(row: { id: string; code: string; natureId: string; nature: { family: Family } }): Promise<Family | null> {
  if (row.nature.family !== "AUTRE" || twinOfCode(row.code) !== null) return null;
  const [entries, natures] = await Promise.all([
    prisma.auditLog.findMany({
      where: { entity: "Sample", entityId: row.id, action: { in: PROGRAMME_ACTIONS }, metadata: { contains: '"nature":{' } },
      select: { metadata: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    }),
    prisma.analysisNature.findMany({ select: { id: true, family: true } }),
  ]);
  const changes: NatureChange[] = entries.flatMap(({ metadata }) => {
    try {
      const nature = (JSON.parse(metadata ?? "") as { nature?: { before?: { id?: unknown }; after?: { id?: unknown } } }).nature;
      return typeof nature?.before?.id === "string" && typeof nature.after?.id === "string"
        ? [{ before: nature.before.id, after: nature.after.id }]
        : [];
    } catch {
      return [];
    }
  });
  return natureHomeFromJournal(changes, row.natureId, new Map(natures.map((n) => [n.id, n.family])));
}

export type ProgrammeSampleRow = NonNullable<Awaited<ReturnType<typeof loadProgrammeSample>>>;

type Numeric = { toString(): string } | number | null | undefined;
const num = (value: Numeric) => (value === null || value === undefined ? null : Number(value));

/**
 * The programme as the fiche edits it — also the audit's before/after. No
 * technician: the programme assigns nobody (13/10); who holds the line is
 * the bench's business (`SAMPLE_TAKEN` / `SAMPLE_UNTAKEN` in the journal).
 */
export function programmeOf(sample: ProgrammeSampleRow) {
  return {
    /** The nature the programme was decided for — changeable within its family (Q49) or to « Autres analyses » (Q129). */
    natureId: sample.natureId,
    productTypeId: sample.productTypeId,
    parameterIds: sample.parameters.map((p) => p.parameterId),
    unitCount: sample.unitCount,
    testPortion: sample.testPortion,
    priority: sample.priority,
    dueAt: sample.dueAt,
    programmeNote: sample.programmeNote,
    parameters: sample.parameters.map((p) => ({
      parameterId: p.parameterId,
      normVersionId: p.normVersionId,
      dilutionFactor: num(p.dilutionFactor),
      note: p.note,
    })),
  };
}

/** JSON-ready: Decimals become numbers, the programme travels beside the line. */
export function serializeProgramme(sample: ProgrammeSampleRow) {
  const { parameters, quantity, ...rest } = sample;
  return {
    sample: {
      ...rest,
      quantity: num(quantity),
      parameters: parameters.map((p) => ({
        parameterId: p.parameterId,
        name: p.parameter.name,
        unit: p.parameter.unit,
        calcFactor: p.parameter.calcFactor,
        family: p.parameter.family,
        category: p.parameter.category,
        technicianId: p.technicianId,
        technician: p.technician,
        normVersionId: p.normVersionId,
        normVersion: p.normVersion,
        dilutionFactor: num(p.dilutionFactor),
        note: p.note,
      })),
    },
    programme: {
      ...programmeOf(sample),
      programmedAt: sample.programmedAt,
      programmedBy: sample.programmedBy,
      /** May the programme still be written? Not once the bench started, not while held at reception. */
      editable: PROGRAMMABLE_STATUSES.includes(sample.status) && !sample.analysisBlocked,
    },
  };
}

/** A nature the fiche may give the line (`current` = the one it has). */
export type ProgrammeNatureOption = ProgrammeNatureRef & { code: string; current: boolean };

/** The line as the nature rules read it: its code (its twin letter) and its nature. */
type NatureLine = {
  code: string;
  natureId: string;
  nature: { family: Family; defaultLineKind?: LineKind };
  /** The domain a single-sample line on « Autres analyses » came from (`loadProgrammeSample`). */
  natureHome?: Family | null;
};

/**
 * What `resolveProgrammeNature` needs to know about the line, derived in one
 * place for the GET and the PUT: its nature, its kind of sample and the
 * letter of its code (Q129 — the family a line on « Autres analyses » goes
 * back to).
 */
export function programmeNatureContext(
  sample: NatureLine,
  natures: readonly ProgrammeNatureRef[]
): Pick<ProgrammeContext, "natureId" | "natureFamily" | "natureLineKind" | "twin" | "natureHome" | "natures"> {
  return {
    natureId: sample.natureId,
    natureFamily: sample.nature.family,
    natureLineKind: sample.nature.defaultLineKind,
    twin: twinOfCode(sample.code),
    natureHome: sample.natureHome ?? null,
    natures,
  };
}

/**
 * The natures the programme may name for this line: the active natures of
 * the families it may take (`programmeNatureFamilies`, Q129) for its kind
 * of sample, its current nature (even archived — it stays readable) and,
 * for a PUT, the one the request names (so a refusal can say why).
 */
export async function loadProgrammeNatures(
  sample: NatureLine,
  requestedId?: string | null
): Promise<ProgrammeNatureOption[]> {
  const ids = [sample.natureId, ...(requestedId ? [requestedId] : [])];
  const rows = await prisma.analysisNature.findMany({
    where: {
      OR: [
        {
          active: true,
          family: { in: programmeNatureFamilies(sample.nature.family, twinOfCode(sample.code), sample.natureHome ?? null) },
          ...(sample.nature.defaultLineKind ? { defaultLineKind: sample.nature.defaultLineKind } : {}),
        },
        { id: { in: ids } },
      ],
    },
    select: { id: true, code: true, label: true, family: true, legacyType: true, defaultLineKind: true, active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
  return rows.map((row) => ({ ...row, current: row.id === sample.natureId }));
}

/**
 * The natures the fiche offers: the current one and the active ones of the
 * families the line may take (`programmeNatureFamilies` — its own, « Autres
 * analyses », and back by its code's letter) and of its kind of sample.
 */
export function selectableNatures(
  natures: readonly ProgrammeNatureOption[],
  line: { family: Family; twin: SampleTwin | null; lineKind?: LineKind; home?: Family | null }
) {
  const families = programmeNatureFamilies(line.family, line.twin, line.home ?? null);
  return natures.filter(
    (nature) =>
      nature.current ||
      (nature.active &&
        families.includes(nature.family) &&
        (!line.lineKind || !nature.defaultLineKind || nature.defaultLineKind === line.lineKind))
  );
}

export type NormVersionOption = {
  id: string;
  normId: string;
  normCode: string;
  version: string;
  label: string;
  current: boolean;
};

/**
 * The norm versions each parameter may be programmed with: every version of
 * the norms its catalogue criteria cite, plus the version a line already
 * holds (a criterion edited since must not invalidate the line's programme).
 */
export async function normVersionsForParameters(
  parameterIds: string[],
  keep: { parameterId: string; normVersionId: string | null }[] = []
): Promise<Record<string, NormVersionOption[]>> {
  const result: Record<string, NormVersionOption[]> = {};
  for (const parameterId of parameterIds) result[parameterId] = [];
  if (parameterIds.length === 0) return result;

  const criteria = await prisma.criterion.findMany({
    where: { parameterId: { in: parameterIds }, normVersionId: { not: null } },
    select: { parameterId: true, normVersion: { select: { normId: true } } },
  });
  const normsByParameter = new Map<string, Set<string>>();
  for (const criterion of criteria) {
    if (!criterion.normVersion) continue;
    const norms = normsByParameter.get(criterion.parameterId) ?? new Set<string>();
    norms.add(criterion.normVersion.normId);
    normsByParameter.set(criterion.parameterId, norms);
  }
  const keptIds = keep.flatMap((k) => (k.normVersionId ? [k.normVersionId] : []));
  const normIds = [...new Set([...normsByParameter.values()].flatMap((set) => [...set]))];
  if (normIds.length === 0 && keptIds.length === 0) return result;

  const versions = await prisma.normVersion.findMany({
    where: { OR: [{ normId: { in: normIds } }, { id: { in: keptIds } }] },
    select: { id: true, normId: true, version: true, label: true, current: true, norm: { select: { code: true } } },
    orderBy: [{ norm: { code: "asc" } }, { current: "desc" }, { version: "desc" }],
  });
  const options: NormVersionOption[] = versions.map((v) => ({
    id: v.id,
    normId: v.normId,
    normCode: v.norm.code,
    version: v.version,
    label: v.label,
    current: v.current,
  }));
  const byNorm = new Map<string, NormVersionOption[]>();
  for (const option of options) {
    byNorm.set(option.normId, [...(byNorm.get(option.normId) ?? []), option]);
  }

  for (const parameterId of parameterIds) {
    const list = [...(normsByParameter.get(parameterId) ?? [])].flatMap((normId) => byNorm.get(normId) ?? []);
    for (const kept of keep) {
      if (kept.parameterId !== parameterId || !kept.normVersionId) continue;
      if (list.some((option) => option.id === kept.normVersionId)) continue;
      const option = options.find((candidate) => candidate.id === kept.normVersionId);
      if (option) list.push(option);
    }
    result[parameterId] = list;
  }
  return result;
}

/**
 * The referential of the fiche (PROGRAMME.md §5, GET), computed for the
 * line's nature or — `options.natureId` — for another nature the fiche may
 * give it (Q49): the parameters, profiles and prices then follow that
 * nature's category. A nature the line may not take falls back to the
 * current one; the GET route refuses it before calling this.
 *
 * `withPrices`: the catalogue price of each parameter (section 7 of the
 * sheet), for a role that sees the billing (`seesBilling`). Without it the
 * services are not even read and `prices` is empty — the referential is the
 * page's RSC payload and the GET's JSON, readable whatever the screen hides.
 */
export async function loadProgrammeReferential(
  sample: NatureLine & {
    clientId: string;
    type: SampleType;
    parameters: { parameterId: string; normVersionId: string | null }[];
  },
  options: { natureId?: string | null; natures?: ProgrammeNatureOption[]; withPrices: boolean }
) {
  const natures = selectableNatures(options.natures ?? (await loadProgrammeNatures(sample)), {
    family: sample.nature.family,
    twin: twinOfCode(sample.code),
    lineKind: sample.nature.defaultLineKind,
    home: sample.natureHome ?? null,
  });
  const target =
    (options.natureId && natures.find((nature) => nature.id === options.natureId)) ||
    natures.find((nature) => nature.current) ||
    null;
  // The current nature keeps the line's own category (a row typed before
  // the natures existed); another nature brings its own.
  const category: SampleType = target && !target.current ? target.legacyType : sample.type;
  const natureId = target?.id ?? sample.natureId;

  const [productTypes, familyNatures, parameters, profiles, services] = await Promise.all([
    prisma.productType.findMany({
      where: { active: true, OR: [{ clientId: null }, { clientId: sample.clientId }] },
      select: {
        id: true,
        name: true,
        family: true,
        natureId: true,
        clientId: true,
        criteria: {
          where: { active: true },
          select: {
            parameterId: true,
            n: true,
            c: true,
            mKind: true,
            m: true,
            bigM: true,
            unit: true,
            normVersionId: true,
            normVersion: { select: { id: true, label: true, current: true, version: true } },
            parameter: { select: { name: true } },
          },
        },
      },
      // The client's own types first (NULL sorts last in DESC), then the catalogue.
      orderBy: [{ clientId: "desc" }, { name: "asc" }],
    }),
    // The picker's « Type d'analyse » filter (RETOUR-LABO-16-10.md F5): the
    // natures these families are classified under, and the one on screen —
    // its preset, even when no family carries it yet.
    prisma.analysisNature.findMany({
      where: {
        OR: [
          { id: natureId },
          { productTypes: { some: { active: true, OR: [{ clientId: null }, { clientId: sample.clientId }] } } },
        ],
      },
      select: { id: true, label: true, legacyType: true },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    }),
    prisma.analysisParameter.findMany({
      where: { category },
      select: { id: true, name: true, unit: true, threshold: true, calcFactor: true, family: true, category: true, aliases: true },
      orderBy: { name: "asc" },
    }),
    prisma.analysisProfile.findMany({
      where: { active: true, natureId, OR: [{ clientId: null }, { clientId: sample.clientId }] },
      select: { id: true, name: true, clientId: true, unitCount: true, parameters: { select: { parameterId: true } } },
      orderBy: [{ clientId: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    options.withPrices
      ? prisma.labService.findMany({
          where: { active: true, category },
          select: { name: true, category: true, unitPrice: true, active: true },
        })
      : Promise.resolve([]),
  ]);

  const normVersions = await normVersionsForParameters(
    parameters.map((p) => p.id),
    sample.parameters
  );

  // The catalogue price of each parameter, matched by name like the invoice
  // proposal does (`/api/clients/[id]/billable`); null = « prix à saisir ».
  // None at all without `withPrices`: not a « prix à saisir » per parameter.
  const prices: Record<string, number | null> = {};
  if (options.withPrices) {
    const catalogue: CatalogueEntry[] = services.map((service) => ({
      name: service.name,
      category: service.category,
      unitPrice: toMoney(service.unitPrice),
      active: service.active,
    }));
    const index = buildCatalogueIndex(catalogue);
    for (const parameter of parameters) {
      prices[parameter.id] = index.get(catalogueKey(parameter.name, category))?.unitPrice ?? null;
    }
  }

  return {
    /** The nature this referential was computed for, and its category. */
    natureId,
    category,
    /** A single-sample line on « Autres analyses »: the domain it may go back to (null = unknown or not needed). */
    natureHome: sample.natureHome ?? null,
    /** The natures the fiche may give the line (the current one flagged), in the catalogue order. */
    natures: natures.map((nature) => ({
      id: nature.id,
      code: nature.code,
      label: nature.label,
      family: nature.family,
      legacyType: nature.legacyType,
      active: nature.active,
      current: nature.current,
    })),
    productTypes: productTypes.map((type) => ({
      id: type.id,
      name: type.name,
      family: type.family,
      /** The family's type d'analyse (RETOUR-LABO-16-10.md F1); null = « à préciser ». */
      natureId: type.natureId,
      clientId: type.clientId,
      /**
       * Its germs with an active criterion — the picker and the sheet show the
       * count (F5). One per germ, as the preview and « Paramètres à
       * rechercher » list them (the version in force, `criteriaOf`), not one
       * per row: an older norm version of a germ is no criterion more — the
       * count of « Familles & critères » too (D-17, `germCount`).
       */
      criteriaCount: germCount(type.criteria),
      criteria: type.criteria.map((criterion) => ({
        parameterId: criterion.parameterId,
        parameterName: criterion.parameter.name,
        n: criterion.n,
        c: criterion.c,
        mKind: criterion.mKind,
        m: criterion.m,
        bigM: criterion.bigM,
        unit: criterion.unit,
        normVersionId: criterion.normVersionId,
        normVersion: criterion.normVersion,
      })),
    })),
    familyNatures: familyNatures.map((nature) => ({ id: nature.id, label: nature.label, category: nature.legacyType })),
    parameters,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      clientId: profile.clientId,
      unitCount: profile.unitCount,
      parameterIds: profile.parameters.map((p) => p.parameterId),
    })),
    normVersions,
    /** The catalogue price of each parameter (null = « prix à saisir ») — empty without `withPrices`. */
    prices,
  };
}
