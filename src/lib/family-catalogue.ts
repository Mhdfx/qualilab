import "server-only";
import type { Family } from "@/generated/prisma/enums";
import { prisma } from "./prisma";
import { getLabSettings } from "./lab-settings";
import { germCount, parseFamilyListFilter, type FamilyListFilter, type FamilyListRow } from "./family-list";

/**
 * What the families' screens read (RETOUR-LABO-16-10.md F4): the list and
 * one family's criteria, the same for the administrator
 * (/admin/types-produits) and for the responsable des paramètres
 * (/programmation/familles). The pages keep their own guard; this only reads.
 */

type SearchParams = Record<string, string | string[] | undefined>;

/** A type d'analyse as the screens offer it; an archived one only names the families that still carry it. */
export type FamilyNatureOption = { id: string; label: string; family: Family; active: boolean };

export type FamilyClientOption = { id: string; name: string };

function loadNatures(): Promise<FamilyNatureOption[]> {
  return prisma.analysisNature.findMany({
    select: { id: true, label: true, family: true, active: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
  });
}

/** Every family, active or not — the filters run on the screen. */
export async function loadFamilyList(searchParams: SearchParams): Promise<{
  types: FamilyListRow[];
  germNames: string[];
  natures: FamilyNatureOption[];
  clients: FamilyClientOption[];
  filter: FamilyListFilter;
}> {
  const [types, parameters, natures, clients] = await Promise.all([
    prisma.productType.findMany({
      select: {
        id: true,
        name: true,
        family: true,
        natureId: true,
        clientId: true,
        active: true,
        client: { select: { name: true } },
        criteria: { where: { active: true }, select: { parameterId: true } },
        _count: { select: { samples: true } },
      },
      orderBy: [{ name: "asc" }],
    }),
    prisma.analysisParameter.findMany({ select: { id: true, name: true } }),
    loadNatures(),
    prisma.client.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  // The germ names, each once: a family's germs are indexes into this list.
  const parameterName = new Map(parameters.map((parameter) => [parameter.id, parameter.name]));
  const germNames = [...new Set(types.flatMap((type) => type.criteria.flatMap((c) => parameterName.get(c.parameterId) ?? [])))].sort(
    (a, b) => a.localeCompare(b, "fr")
  );
  const germIndex = new Map(germNames.map((name, index) => [name, index]));

  const rows: FamilyListRow[] = types.map((type) => ({
    id: type.id,
    name: type.name,
    family: type.family,
    natureId: type.natureId,
    clientId: type.clientId,
    clientName: type.client?.name ?? null,
    active: type.active,
    // One per germ, as the picker and the programme sheet count them (D-17).
    criteriaCount: germCount(type.criteria),
    sampleCount: type._count.samples,
    germs: [...new Set(type.criteria.flatMap((c) => germIndex.get(parameterName.get(c.parameterId) ?? "") ?? []))],
  }));

  return {
    types: rows,
    germNames,
    natures,
    clients,
    filter: parseFamilyListFilter(searchParams, {
      natureIds: natures.map((nature) => nature.id),
      // A client's own families stay findable once the client is archived.
      clientIds: rows.flatMap((row) => (row.clientId ? [row.clientId] : [])),
    }),
  };
}

/** One family with its criteria and everything its grid offers; null when it does not exist. */
export async function loadFamilyDetail(id: string, searchParams: SearchParams) {
  const [type, parameters, norms, clients, settings, regulations, natures] = await Promise.all([
    prisma.productType.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        family: true,
        natureId: true,
        clientId: true,
        client: { select: { id: true, name: true } },
        active: true,
        regulationId: true,
        criteria: {
          select: { id: true, parameterId: true, normVersionId: true, unit: true, n: true, c: true, mKind: true, m: true, bigM: true, active: true, updatedAt: true },
          orderBy: [{ parameter: { name: "asc" } }, { normVersion: { version: "desc" } }],
        },
      },
    }),
    prisma.analysisParameter.findMany({ select: { id: true, name: true, category: true, unit: true }, orderBy: { name: "asc" } }),
    prisma.norm.findMany({
      select: { code: true, versions: { select: { id: true, version: true, label: true, current: true }, orderBy: { version: "desc" } } },
      orderBy: { code: "asc" },
    }),
    prisma.client.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    getLabSettings(),
    prisma.regulation.findMany({ where: { active: true }, select: { id: true, title: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] }),
    loadNatures(),
  ]);
  if (!type) return null;

  // The family's own client stays in the list once archived: the header
  // shows who it belongs to rather than « catalogue commun ».
  const clientOptions = type.client && !clients.some((client) => client.id === type.client!.id) ? [...clients, type.client] : clients;
  const defaultRegulationId = type.family === "CHIMIE" ? settings.regulationChimieId : settings.regulationMicroId;

  return {
    type: {
      id: type.id,
      name: type.name,
      family: type.family,
      natureId: type.natureId,
      clientId: type.clientId,
      active: type.active,
      regulationId: type.regulationId,
    },
    // With each row's last write: the grid sends their version back with its
    // save (`criteriaGridVersion`), so a page opened before a split cannot
    // write its old rows back.
    criteria: type.criteria.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
    parameters,
    versions: norms.flatMap((norm) => norm.versions.map((v) => ({ id: v.id, code: norm.code, version: v.version, label: v.label, current: v.current }))),
    clients: clientOptions,
    natures,
    regulations,
    familyDefaultRegulation: regulations.find((regulation) => regulation.id === defaultRegulationId)?.title ?? null,
    filter: parseFamilyListFilter(searchParams, {
      natureIds: natures.map((nature) => nature.id),
      clientIds: clientOptions.map((client) => client.id),
    }),
  };
}

export type FamilyDetailData = NonNullable<Awaited<ReturnType<typeof loadFamilyDetail>>>;
