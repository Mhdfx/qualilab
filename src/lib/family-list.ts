import type { Family } from "@/generated/prisma/enums";
import { normalizeLabel } from "./serie-input";
import { matchesQuery } from "./similar";

/**
 * The list of the families de produits and their criteria
 * (RETOUR-LABO-16-10.md F4, Q122 / Q125) — « Familles & critères » for the
 * responsable des paramètres, « Familles de produits & critères » for the
 * administrator: one screen, two places. Pure, so the filters the
 * laboratory works with are tested here and the screen only renders them.
 *
 * There are no categories (Q121): the list is grouped by type d'analyse
 * (`ProductType.natureId`), « à préciser » while it is not known, then by
 * family name.
 */

/** The « Type d'analyse » filter's value for the families without one yet. */
export const UNCLASSIFIED = "a_preciser";

/** The « Client » filter's value for the common catalogue (no client's own family). */
export const CATALOGUE = "catalogue";

/** What « à préciser » reads on screen. */
export const UNCLASSIFIED_LABEL = "Type d'analyse à préciser";

/** The longest search kept from a URL. */
const MAX_QUERY = 100;

export type FamilyListRow = {
  id: string;
  name: string;
  /** The domain (Micro / PC / Autre): derived from the type d'analyse when there is one. */
  family: Family;
  /** The type d'analyse; null = « à préciser ». */
  natureId: string | null;
  clientId: string | null;
  clientName: string | null;
  active: boolean;
  /** Its active criteria. */
  criteriaCount: number;
  sampleCount: number;
  /**
   * The germs of its active criteria, as indexes into the page's list of
   * germ names: each name travels once, however many families share it.
   */
  germs: number[];
};

export type FamilyListFilter = {
  /** "" = every type d'analyse; `UNCLASSIFIED` = « à préciser »; otherwise a nature's id. */
  natureId: string;
  /** "" = every family; `CATALOGUE` = the common catalogue; otherwise a client's id. */
  clientId: string;
  /** The archived families instead of the active ones. */
  inactive: boolean;
  /** Only the families without any active criterion (Q43: the ones to complete). */
  withoutCriteria: boolean;
  /** Words of the family's name or of one of its germs. */
  query: string;
};

export const NO_FAMILY_FILTER: FamilyListFilter = {
  natureId: "",
  clientId: "",
  inactive: false,
  withoutCriteria: false,
  query: "",
};

/**
 * The families the filter keeps. Every word typed must be found — accents,
 * case and one typing error ignored (`matchesQuery`) — in the family's name
 * or in one of its germs: « salade listeria » finds the salads whose
 * criteria include Listeria.
 */
export function filterFamilyList(
  rows: readonly FamilyListRow[],
  filter: FamilyListFilter,
  germNames: readonly string[]
): FamilyListRow[] {
  const words = normalizeLabel(filter.query).split(" ").filter(Boolean);
  // Each word is matched once against the germ names, not once per family.
  const germHits = words.map(
    (word) => new Set(germNames.flatMap((name, index) => (matchesQuery(name, word) ? [index] : [])))
  );
  return rows.filter((row) => {
    if (filter.inactive ? row.active : !row.active) return false;
    if (filter.natureId === UNCLASSIFIED ? row.natureId !== null : filter.natureId !== "" && row.natureId !== filter.natureId) {
      return false;
    }
    if (filter.clientId === CATALOGUE ? row.clientId !== null : filter.clientId !== "" && row.clientId !== filter.clientId) {
      return false;
    }
    if (filter.withoutCriteria && row.criteriaCount > 0) return false;
    return words.every((word, i) => matchesQuery(row.name, word) || row.germs.some((germ) => germHits[i].has(germ)));
  });
}

export type FamilyGroup = {
  /** null = « à préciser ». */
  natureId: string | null;
  label: string;
  rows: FamilyListRow[];
};

/**
 * The families under their type d'analyse, in the natures' order (the one
 * given), « à préciser » last; by name inside each group. A group without
 * a family is left out.
 */
export function groupFamiliesByNature(
  rows: readonly FamilyListRow[],
  natures: readonly { id: string; label: string }[]
): FamilyGroup[] {
  const byNature = new Map<string | null, FamilyListRow[]>();
  for (const row of rows) {
    const group = byNature.get(row.natureId);
    if (group) group.push(row);
    else byNature.set(row.natureId, [row]);
  }
  const byName = (a: FamilyListRow, b: FamilyListRow) =>
    a.name.localeCompare(b.name, "fr", { sensitivity: "base" }) || (a.clientName ?? "").localeCompare(b.clientName ?? "", "fr");
  const known = new Set(natures.map((nature) => nature.id));
  const groups: FamilyGroup[] = natures
    .filter((nature) => byNature.has(nature.id))
    .map((nature) => ({ natureId: nature.id, label: nature.label, rows: byNature.get(nature.id)!.sort(byName) }));
  // A nature the page was not given (never expected: archived ones are given
  // too) still shows its families rather than hiding them.
  for (const [natureId, group] of byNature) {
    if (natureId !== null && !known.has(natureId)) {
      groups.push({ natureId, label: "Type d'analyse inconnu", rows: group.sort(byName) });
    }
  }
  const unclassified = byNature.get(null);
  if (unclassified) groups.push({ natureId: null, label: UNCLASSIFIED_LABEL, rows: unclassified.sort(byName) });
  return groups;
}

type SearchParamsLike = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
}

/**
 * The filter carried by the list's address (`?type=&client=&etat=&sans=&q=`),
 * so that coming back from a family finds the list as it was left. A type
 * d'analyse or a client the page does not know is dropped, never applied
 * blind.
 */
export function parseFamilyListFilter(
  params: SearchParamsLike,
  known: { natureIds: readonly string[]; clientIds: readonly string[] }
): FamilyListFilter {
  const natureId = first(params.type);
  const clientId = first(params.client);
  return {
    natureId: natureId === UNCLASSIFIED || known.natureIds.includes(natureId) ? natureId : "",
    clientId: clientId === CATALOGUE || known.clientIds.includes(clientId) ? clientId : "",
    inactive: first(params.etat) === "inactives",
    withoutCriteria: first(params.sans) === "1",
    query: first(params.q).slice(0, MAX_QUERY),
  };
}

/** The query string of a filter, without « ? »; "" when nothing is filtered. */
export function familyListQuery(filter: FamilyListFilter): string {
  const params = new URLSearchParams();
  if (filter.natureId) params.set("type", filter.natureId);
  if (filter.clientId) params.set("client", filter.clientId);
  if (filter.inactive) params.set("etat", "inactives");
  if (filter.withoutCriteria) params.set("sans", "1");
  const query = filter.query.trim();
  if (query) params.set("q", query);
  return params.toString();
}

/** A path with the filter's query string, when there is one. */
export function withFamilyListQuery(path: string, filter: FamilyListFilter): string {
  const query = familyListQuery(filter);
  return query ? `${path}?${query}` : path;
}
