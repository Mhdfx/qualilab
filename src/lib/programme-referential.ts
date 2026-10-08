import "server-only";
import type { Family, LineKind, SampleType } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { buildCatalogueIndex, catalogueKey, type CatalogueEntry } from "./billing";
import { toMoney } from "./money";
import type { ProgrammeNatureRef } from "./programme-input";
import { PROGRAMMABLE_STATUSES } from "./sample-status";

/**
 * What the programme d'analyse reads and writes (PROGRAMME.md §4–5): the
 * line with its current programme, and the referential the fiche needs —
 * the product types the client may use with their criteria, the parameters
 * of the nature's category, the profiles, the active technicians, the norm
 * versions of each parameter, the catalogue prices. Shared by GET and PUT
 * so the rules are checked against exactly what the screen was offered.
 *
 * RETOUR-LABO-06-10.md §5 (V3, Q49 by default): the fiche may change the
 * line's nature to another active nature of the same family; the
 * referential then lists those natures and can be computed for any of them
 * (its parameters, profiles and prices follow the nature's category). Each
 * parameter carries its family (`AnalysisParameter.family`).
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
  serie: { select: { id: true, serialNumber: true, kind: true, receivedAt: true } },
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
  analysisBlocked: true,
  unitCount: true,
  productTypeId: true,
  productType: { select: { id: true, name: true } },
  technicianId: true,
  technician: { select: { id: true, name: true } },
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
  return prisma.sample.findUnique({ where: { id }, select: PROGRAMME_SAMPLE_SELECT });
}

export type ProgrammeSampleRow = NonNullable<Awaited<ReturnType<typeof loadProgrammeSample>>>;

type Numeric = { toString(): string } | number | null | undefined;
const num = (value: Numeric) => (value === null || value === undefined ? null : Number(value));

/** The programme as the fiche edits it — also the audit's before/after. */
export function programmeOf(sample: ProgrammeSampleRow) {
  return {
    /** The nature the programme was decided for — changeable within its family (Q49). */
    natureId: sample.natureId,
    productTypeId: sample.productTypeId,
    parameterIds: sample.parameters.map((p) => p.parameterId),
    unitCount: sample.unitCount,
    testPortion: sample.testPortion,
    technicianId: sample.technicianId,
    priority: sample.priority,
    dueAt: sample.dueAt,
    programmeNote: sample.programmeNote,
    parameters: sample.parameters.map((p) => ({
      parameterId: p.parameterId,
      technicianId: p.technicianId,
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

/**
 * The natures the programme may name for this line: the active natures of
 * its family, its current nature (even archived — it stays readable) and,
 * for a PUT, the one the request names (so a refusal can say why).
 */
export async function loadProgrammeNatures(
  sample: { natureId: string; nature: { family: Family; defaultLineKind?: LineKind } },
  requestedId?: string | null
): Promise<ProgrammeNatureOption[]> {
  const ids = [sample.natureId, ...(requestedId ? [requestedId] : [])];
  const rows = await prisma.analysisNature.findMany({
    where: {
      OR: [
        {
          active: true,
          family: sample.nature.family,
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

/** The natures the fiche offers: the current one and the active ones of its family and its kind of sample. */
export function selectableNatures(natures: readonly ProgrammeNatureOption[], family: Family, lineKind?: LineKind) {
  return natures.filter(
    (nature) =>
      nature.current ||
      (nature.active && nature.family === family && (!lineKind || !nature.defaultLineKind || nature.defaultLineKind === lineKind))
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
 */
export async function loadProgrammeReferential(
  sample: {
    clientId: string;
    type: SampleType;
    natureId: string;
    nature: { family: Family; defaultLineKind?: LineKind };
    parameters: { parameterId: string; normVersionId: string | null }[];
  },
  options: { natureId?: string | null; natures?: ProgrammeNatureOption[] } = {}
) {
  const natures = selectableNatures(
    options.natures ?? (await loadProgrammeNatures(sample)),
    sample.nature.family,
    sample.nature.defaultLineKind
  );
  const target =
    (options.natureId && natures.find((nature) => nature.id === options.natureId)) ||
    natures.find((nature) => nature.current) ||
    null;
  // The current nature keeps the line's own category (a row typed before
  // the natures existed); another nature brings its own.
  const category: SampleType = target && !target.current ? target.legacyType : sample.type;
  const natureId = target?.id ?? sample.natureId;

  const [productTypes, parameters, profiles, technicians, services] = await Promise.all([
    prisma.productType.findMany({
      where: { active: true, OR: [{ clientId: null }, { clientId: sample.clientId }] },
      select: {
        id: true,
        name: true,
        family: true,
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
    prisma.user.findMany({
      where: { role: "TECHNICIEN", banned: { not: true } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.labService.findMany({
      where: { active: true, category },
      select: { name: true, category: true, unitPrice: true, active: true },
    }),
  ]);

  const normVersions = await normVersionsForParameters(
    parameters.map((p) => p.id),
    sample.parameters
  );

  // The catalogue price of each parameter, matched by name like the invoice
  // proposal does (`/api/clients/[id]/billable`); null = « prix à saisir ».
  const catalogue: CatalogueEntry[] = services.map((service) => ({
    name: service.name,
    category: service.category,
    unitPrice: toMoney(service.unitPrice),
    active: service.active,
  }));
  const index = buildCatalogueIndex(catalogue);
  const prices: Record<string, number | null> = {};
  for (const parameter of parameters) {
    prices[parameter.id] = index.get(catalogueKey(parameter.name, category))?.unitPrice ?? null;
  }

  return {
    /** The nature this referential was computed for, and its category. */
    natureId,
    category,
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
      clientId: type.clientId,
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
    parameters,
    profiles: profiles.map((profile) => ({
      id: profile.id,
      name: profile.name,
      clientId: profile.clientId,
      unitCount: profile.unitCount,
      parameterIds: profile.parameters.map((p) => p.parameterId),
    })),
    technicians,
    normVersions,
    prices,
  };
}
