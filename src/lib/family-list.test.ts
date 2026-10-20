import { describe, expect, it } from "vitest";
import {
  CATALOGUE,
  NO_FAMILY_FILTER,
  UNCLASSIFIED,
  UNCLASSIFIED_LABEL,
  criteriaCountLabel,
  criteriaGridCountLabel,
  criteriaGridSavedNotice,
  familyListQuery,
  filterFamilyList,
  germCount,
  groupFamiliesByNature,
  parseFamilyListFilter,
  withFamilyListQuery,
  type FamilyListFilter,
  type FamilyListRow,
} from "./family-list";

/**
 * « Familles & critères » (RETOUR-LABO-16-10.md F4, Q122 / Q125): the list
 * the responsable des paramètres works through — by type d'analyse, client,
 * state, « Sans critère » (Q43) and a search on the family's name and on
 * its germs. Generic family names only: the old software's catalogue holds
 * client names and stays out of the repository.
 */

const GERMS = ["Escherichia coli", "Listeria monocytogenes", "Salmonella", "Staphylocoques à coagulase positive", "Flore totale"];
const germ = (name: string) => GERMS.indexOf(name);

function row(overrides: Partial<FamilyListRow> & { id: string; name: string }): FamilyListRow {
  return {
    family: "MICRO",
    natureId: "nat_micro_aliments",
    clientId: null,
    clientName: null,
    active: true,
    criteriaCount: 0,
    sampleCount: 0,
    germs: [],
    ...overrides,
  };
}

const ROWS: FamilyListRow[] = [
  row({ id: "f1", name: "PLATS CUISINÉS-VOLAILLES", criteriaCount: 3, germs: [germ("Salmonella"), germ("Listeria monocytogenes"), germ("Flore totale")] }),
  row({ id: "f2", name: "Salades composées", criteriaCount: 2, germs: [germ("Escherichia coli"), germ("Listeria monocytogenes")] }),
  row({ id: "f3", name: "HYGIÈNE DU PERSONNEL", natureId: "nat_micro_surfaces", criteriaCount: 1, germs: [germ("Staphylocoques à coagulase positive")] }),
  row({ id: "f4", name: "HYGIÈNES DE SURFACES", family: "CHIMIE", natureId: "nat_pc_surfaces" }),
  row({ id: "f5", name: "PRODUIT ALIMENTAIRE", natureId: null }),
  row({ id: "f6", name: "Salade du client", clientId: "c1", clientName: "Client A", criteriaCount: 1, germs: [germ("Salmonella")] }),
  row({ id: "f7", name: "Ancienne famille", active: false, criteriaCount: 1, germs: [germ("Escherichia coli")] }),
];

const filter = (patch: Partial<FamilyListFilter>): FamilyListFilter => ({ ...NO_FAMILY_FILTER, ...patch });
const ids = (rows: FamilyListRow[]) => rows.map((r) => r.id).sort();

describe("filterFamilyList", () => {
  it("shows the active families by default, the archived ones on « Inactives »", () => {
    expect(ids(filterFamilyList(ROWS, NO_FAMILY_FILTER, GERMS))).toEqual(["f1", "f2", "f3", "f4", "f5", "f6"]);
    expect(ids(filterFamilyList(ROWS, filter({ inactive: true }), GERMS))).toEqual(["f7"]);
  });

  it("keeps one type d'analyse, or the families still « à préciser »", () => {
    expect(ids(filterFamilyList(ROWS, filter({ natureId: "nat_micro_surfaces" }), GERMS))).toEqual(["f3"]);
    expect(ids(filterFamilyList(ROWS, filter({ natureId: UNCLASSIFIED }), GERMS))).toEqual(["f5"]);
  });

  it("keeps the common catalogue, or one client's own families", () => {
    expect(ids(filterFamilyList(ROWS, filter({ clientId: CATALOGUE }), GERMS))).toEqual(["f1", "f2", "f3", "f4", "f5"]);
    expect(ids(filterFamilyList(ROWS, filter({ clientId: "c1" }), GERMS))).toEqual(["f6"]);
  });

  it("« Sans critère » keeps the families without an active criterion — the ones to complete (Q43)", () => {
    expect(ids(filterFamilyList(ROWS, filter({ withoutCriteria: true }), GERMS))).toEqual(["f4", "f5"]);
    expect(ids(filterFamilyList(ROWS, filter({ withoutCriteria: true, natureId: UNCLASSIFIED }), GERMS))).toEqual(["f5"]);
  });

  it("searches the family's name with accents, case and one typing error ignored", () => {
    expect(ids(filterFamilyList(ROWS, filter({ query: "hygiene" }), GERMS))).toEqual(["f3", "f4"]);
    expect(ids(filterFamilyList(ROWS, filter({ query: "plats cuisines" }), GERMS))).toEqual(["f1"]);
    expect(ids(filterFamilyList(ROWS, filter({ query: "salads" }), GERMS))).toEqual(["f2", "f6"]);
  });

  it("searches the germs of the family's criteria", () => {
    expect(ids(filterFamilyList(ROWS, filter({ query: "listeria" }), GERMS))).toEqual(["f1", "f2"]);
    expect(ids(filterFamilyList(ROWS, filter({ query: "staphylocoques" }), GERMS))).toEqual(["f3"]);
    // The archived family holding the germ stays hidden while « Actives » is on.
    expect(ids(filterFamilyList(ROWS, filter({ query: "escherichia" }), GERMS))).toEqual(["f2"]);
  });

  it("needs every word, each in the name or in a germ: « salade listeria » finds the salads with Listeria", () => {
    expect(ids(filterFamilyList(ROWS, filter({ query: "salade listeria" }), GERMS))).toEqual(["f2"]);
    expect(ids(filterFamilyList(ROWS, filter({ query: "salade poisson" }), GERMS))).toEqual([]);
  });

  it("combines every filter", () => {
    expect(ids(filterFamilyList(ROWS, filter({ query: "salmonella", clientId: "c1" }), GERMS))).toEqual(["f6"]);
    expect(ids(filterFamilyList(ROWS, filter({ query: "salmonella", clientId: CATALOGUE }), GERMS))).toEqual(["f1"]);
  });
});

describe("groupFamiliesByNature", () => {
  const NATURES = [
    { id: "nat_micro_aliments", label: "Microbiologie des aliments" },
    { id: "nat_micro_surfaces", label: "Microbiologie des surfaces" },
    { id: "nat_micro_eaux", label: "Microbiologie des eaux" },
    { id: "nat_pc_surfaces", label: "Physico-chimie des surfaces" },
  ];

  it("groups by type d'analyse in the natures' order, « à préciser » last, empty groups left out", () => {
    const groups = groupFamiliesByNature(filterFamilyList(ROWS, NO_FAMILY_FILTER, GERMS), NATURES);
    expect(groups.map((g) => g.label)).toEqual([
      "Microbiologie des aliments",
      "Microbiologie des surfaces",
      "Physico-chimie des surfaces",
      UNCLASSIFIED_LABEL,
    ]);
    expect(groups.at(-1)?.natureId).toBeNull();
  });

  it("lists the families by name inside a group, accents ignored", () => {
    const [food] = groupFamiliesByNature(filterFamilyList(ROWS, NO_FAMILY_FILTER, GERMS), NATURES);
    expect(food.rows.map((r) => r.name)).toEqual(["PLATS CUISINÉS-VOLAILLES", "Salade du client", "Salades composées"]);
  });

  it("still shows the families of a nature it was not given", () => {
    const groups = groupFamiliesByNature([row({ id: "x", name: "X", natureId: "nat_gone" })], NATURES);
    expect(groups).toEqual([{ natureId: "nat_gone", label: "Type d'analyse inconnu", rows: [expect.objectContaining({ id: "x" })] }]);
  });
});

describe("the list's address keeps its filters", () => {
  const known = { natureIds: ["nat_micro_eaux"], clientIds: ["c1"] };

  it("reads every filter back", () => {
    const parsed = parseFamilyListFilter({ type: "nat_micro_eaux", client: "c1", etat: "inactives", sans: "1", q: " listeria " }, known);
    expect(parsed).toEqual({ natureId: "nat_micro_eaux", clientId: "c1", inactive: true, withoutCriteria: true, query: "listeria" });
    expect(parseFamilyListFilter({ type: UNCLASSIFIED, client: CATALOGUE }, known)).toEqual(
      filter({ natureId: UNCLASSIFIED, clientId: CATALOGUE })
    );
  });

  it("drops a type d'analyse or a client it does not know, and anything else", () => {
    expect(parseFamilyListFilter({ type: "nat_unknown", client: "c9", etat: "toutes", sans: "oui" }, known)).toEqual(NO_FAMILY_FILTER);
    expect(parseFamilyListFilter({}, known)).toEqual(NO_FAMILY_FILTER);
    expect(parseFamilyListFilter({ q: "x".repeat(500) }, known).query).toHaveLength(100);
  });

  it("writes only what is filtered, and round-trips", () => {
    expect(familyListQuery(NO_FAMILY_FILTER)).toBe("");
    expect(withFamilyListQuery("/programmation/familles", NO_FAMILY_FILTER)).toBe("/programmation/familles");
    const chosen = filter({ natureId: UNCLASSIFIED, withoutCriteria: true, query: "plats cuisinés" });
    const href = withFamilyListQuery("/programmation/familles/f1", chosen);
    expect(href).toBe("/programmation/familles/f1?type=a_preciser&sans=1&q=plats+cuisin%C3%A9s");
    const params = Object.fromEntries(new URL(href, "http://localhost").searchParams);
    expect(parseFamilyListFilter(params, known)).toEqual(chosen);
  });
});

describe("one count of criteria on every screen (RETOUR-LABO-19-10.md D-17)", () => {
  /** A family kept under two versions of one norm for one germ: 6 rows, 5 germs (« CONFITURES, COMPOTES… » on the copy). */
  const rows = [
    { parameterId: "p-levures", active: true },
    { parameterId: "p-moisissures", active: true },
    { parameterId: "p-flore", active: true },
    { parameterId: "p-coliformes", active: true },
    { parameterId: "p-staph", active: true },
    // The same germ under the older version of its norm: no criterion more.
    { parameterId: "p-staph", active: true },
  ];

  it("counts the distinct germs, never the rows — the list, the picker and the sheet say the same number", () => {
    expect(germCount(rows)).toBe(5);
    expect(germCount([])).toBe(0);
    expect(criteriaCountLabel(germCount(rows))).toBe("5 critères");
    expect(criteriaCountLabel(1)).toBe("1 critère");
    expect(criteriaCountLabel(0)).toBe("aucun critère");
  });

  it("the family's grid also says how many rows it holds, when they are more", () => {
    expect(criteriaGridCountLabel(rows)).toBe("5 critères · 6 lignes");
    expect(criteriaGridCountLabel(rows.slice(0, 5))).toBe("5 critères");
    // An inactive row and a row without a germ yet are rows, not criteria.
    expect(criteriaGridCountLabel([...rows.slice(0, 5), { parameterId: "p-salm", active: false }, { parameterId: "", active: true }])).toBe(
      "5 critères · 7 lignes"
    );
    expect(criteriaGridCountLabel([{ parameterId: "p-salm", active: false }])).toBe("aucun critère · 1 ligne");
    expect(criteriaGridCountLabel([])).toBe("aucun critère");
  });

  it("the grid's save notice gives that count, and never « enregistrés (aucun critère) »", () => {
    expect(criteriaGridSavedNotice(rows)).toBe("Critères enregistrés (5 critères · 6 lignes).");
    expect(criteriaGridSavedNotice(rows.slice(0, 1))).toBe("Critères enregistrés (1 critère).");
    // Every row deleted, then saved.
    expect(criteriaGridSavedNotice([])).toBe("Critères enregistrés : la famille n'a aucun critère et sera lue en valeur simple, sans verdict.");
    // Inactive rows only: kept, but no criterion is read.
    expect(criteriaGridSavedNotice([{ parameterId: "p-salm", active: false }])).toBe(
      "Critères enregistrés : aucun critère actif (1 ligne inactive), la famille sera lue en valeur simple, sans verdict."
    );
    expect(criteriaGridSavedNotice([{ parameterId: "p-salm", active: false }, { parameterId: "p-staph", active: false }])).toBe(
      "Critères enregistrés : aucun critère actif (2 lignes inactives), la famille sera lue en valeur simple, sans verdict."
    );
    for (const saved of [[], [{ parameterId: "p-salm", active: false }], rows]) {
      expect(criteriaGridSavedNotice(saved)).not.toMatch(/\(aucun critère/);
    }
  });

  it("« Sans critère » still finds only the families without any", () => {
    const counted = row({ id: "f8", name: "CONFITURES, COMPOTES", criteriaCount: germCount(rows) });
    expect(ids(filterFamilyList([...ROWS, counted], filter({ withoutCriteria: true }), GERMS))).toEqual(["f4", "f5"]);
  });
});
