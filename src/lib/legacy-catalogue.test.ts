import { describe, expect, it } from "vitest";
import type { Family as Domain } from "@/generated/prisma/enums";
import { copiedCriterion, movedCriteria, splitJournal, type SplitCriterion } from "./family-split";
import {
  REASON_DELETED,
  REASON_OBSOLETE,
  SKIP_EDITED,
  SKIP_WORKBOOK,
  criteriaEditedByHand,
  derivePlan,
  familyEditedByHand,
  legacyNorm,
  parameterKeys,
  parseLegacyCriteria,
  parseLegacyRegulations,
  parseLegacyTypes,
  planLegacyCatalogue,
  regulationEditedByHand,
  regulationTitle,
  splitOrigin,
  usableNorm,
  type CataloguePlan,
  type CatalogueSnapshot,
  type LegacyCriterion,
  type LegacyType,
} from "./legacy-catalogue";

const CRIT_HEADER = "id;id_type;id_param;parametre;norme;unite;type_pm;type_resultat;classe;nbr;control;valeur_pm;exp_pm;obsolete;ordre;l1_min;l1_exp_min;l1_max;l1_exp_max;l1_concl;l1_oper;l2_min;l2_exp_min;l2_max;l2_exp_max;l2_concl;l2_oper;l3_min;l3_exp_min;l3_max;l3_exp_max;l3_concl;l3_oper".split(";");
const row = (values: Record<string, string>) => {
  const r: Record<string, string> = {};
  for (const h of CRIT_HEADER) r[h] = values[h] ?? "";
  return r;
};

describe("derivePlan — the old software's criteria", () => {
  it("reads a three-class plan from its interval lines (m = 1.10², M = 1.10⁴, c = 2)", () => {
    const r = row({ type_pm: "3", type_resultat: "11", classe: "3", nbr: "5", control: "2", obsolete: "0",
      l1_max: "1.0000", l1_exp_max: "2", l1_concl: "2", l2_min: "1.0000", l2_exp_min: "2", l2_max: "1.0000", l2_exp_max: "4", l2_concl: "1", l3_concl: "0" });
    expect(derivePlan(r)).toEqual({ plan: { n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 10000 }, reason: null });
  });

  it("reads a two-class plan, n = 1 when the old base says nothing, c null", () => {
    const r = row({ type_pm: "3", type_resultat: "11", obsolete: "0", l1_max: "3.0000", l1_exp_max: "1", l1_concl: "2", l2_concl: "0" });
    expect(derivePlan(r)).toEqual({ plan: { n: 1, c: null, mKind: "VALUE", m: 30, bigM: null }, reason: null });
  });

  it("maps absence tests, « non spécifiée » with and without a limit, and refuses the rest", () => {
    expect(derivePlan(row({ type_pm: "1", type_resultat: "12", nbr: "5", obsolete: "0" })).plan).toEqual({ n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null });
    expect(derivePlan(row({ type_pm: "2", type_resultat: "11", obsolete: "0", l1_max: "1.0000", l1_exp_max: "3", l1_concl: "2" })).plan).toMatchObject({ mKind: "UNSPECIFIED", bigM: 1000 });
    expect(derivePlan(row({ type_pm: "2", type_resultat: "11", obsolete: "0" })).plan).toMatchObject({ mKind: "UNSPECIFIED", bigM: null });
    expect(derivePlan(row({ type_pm: "3", type_resultat: "11", obsolete: "0" }))).toEqual({ plan: null, reason: "aucune limite" });
    expect(derivePlan(row({ type_pm: "3", type_resultat: "11", obsolete: "1", l1_max: "1", l1_concl: "2" }))).toEqual({ plan: null, reason: "obsolète" });
  });

  it("imports only OBSOLETE = 0: 2 — deleted from the family's grid — and any other value are « supprimé dans l'ancien logiciel »", () => {
    const limits = { type_pm: "3", type_resultat: "11", nbr: "5", control: "1", l1_max: "1.0000", l1_exp_max: "2", l1_concl: "2" };
    expect(derivePlan(row({ ...limits, obsolete: "0" })).plan).toEqual({ n: 5, c: 1, mKind: "VALUE", m: 100, bigM: null });
    expect(derivePlan(row({ ...limits, obsolete: "1" }))).toEqual({ plan: null, reason: REASON_OBSOLETE });
    // The Listeria row of 23/10: deleted on 02/08/2024, imported active before this fix.
    expect(derivePlan(row({ ...limits, obsolete: "2" }))).toEqual({ plan: null, reason: REASON_DELETED });
    expect(REASON_DELETED).toBe("supprimé dans l'ancien logiciel");
    for (const other of ["3", "", "x", "1.5"]) expect(derivePlan(row({ ...limits, obsolete: other }))).toEqual({ plan: null, reason: REASON_DELETED });
  });

  it("keeps a deleted row's germ and norm in the parsed file (counted, and read by the reprise's step (f))", () => {
    const deleted = row({ id: "21570", id_type: "21564", parametre: "Listeria monocytogenes", norme: "NM ISO 11290-2:2017", type_pm: "3", type_resultat: "11", nbr: "5", control: "1", obsolete: "2", l1_max: "1.0000", l1_exp_max: "2", l1_concl: "2" });
    const parsed = parseLegacyCriteria([CRIT_HEADER, CRIT_HEADER.map((h) => deleted[h])]);
    expect(parsed.items).toEqual([
      { legacyId: 21570, typeLegacyId: 21564, parameterName: "Listeria monocytogenes", norm: "NM ISO 11290-2:2017", unit: null, plan: null, reason: REASON_DELETED },
    ]);
  });

  it("falls back to VALEUR_PM × 10^EXPM when no interval line exists", () => {
    expect(derivePlan(row({ type_pm: "3", type_resultat: "11", obsolete: "0", valeur_pm: "1.5000", exp_pm: "2" })).plan).toMatchObject({ mKind: "VALUE", m: 150, bigM: null });
  });

  it("keeps CONTROL as c only where c means something — never on an absence test or a limitless row (F2)", () => {
    expect(derivePlan(row({ type_pm: "1", type_resultat: "12", control: "2", obsolete: "0" })).plan).toEqual({ n: 1, c: null, mKind: "ABSENCE", m: null, bigM: null });
    expect(derivePlan(row({ type_pm: "2", type_resultat: "11", nbr: "5", control: "1", obsolete: "0" })).plan).toEqual({ n: 5, c: null, mKind: "UNSPECIFIED", m: null, bigM: null });
    // A limit kept: c with it, whether M alone or m alone.
    expect(derivePlan(row({ type_pm: "2", type_resultat: "11", control: "1", obsolete: "0", l1_max: "1.0000", l1_exp_max: "3", l1_concl: "2" })).plan).toMatchObject({ mKind: "UNSPECIFIED", bigM: 1000, c: 1 });
    expect(derivePlan(row({ type_pm: "3", type_resultat: "11", control: "1", obsolete: "0", l1_max: "3.0000", l1_exp_max: "1", l1_concl: "2" })).plan).toMatchObject({ mKind: "VALUE", m: 30, c: 1 });
  });
});

describe("the CSV parsers", () => {
  it("reads criteria, regulations and types as the extractor writes them", () => {
    const criteria = parseLegacyCriteria([
      CRIT_HEADER,
      ["386", "1", "45", "Clostridium perfringens", "NM 08.0.111:2003", "ufc/g", "3", "11", "3", "", "2", "1.0000", "2", "0", "1", "", "", "1.0000", "2", "2", "163", "1.0000", "2", "1.0000", "4", "1", "163", "1.0000", "4", "", "", "0", "60"],
      ["2967", "545", "1167", "Chlore (SA)", "(MI)", "%", "2", "11", "", "", "", "", "", "0", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", ""],
    ]);
    expect(criteria.error).toBeNull();
    expect(criteria.items[0]).toMatchObject({ legacyId: 386, typeLegacyId: 1, parameterName: "Clostridium perfringens", unit: "ufc/g", plan: { n: 1, c: 2, mKind: "VALUE", m: 100, bigM: 10000 } });
    expect(criteria.items[1].plan).toMatchObject({ mKind: "UNSPECIFIED", bigM: null });
    expect(usableNorm("NM 08.0.111:2003")).toBe(true);
    expect(usableNorm("(MI)")).toBe(false);

    const regulations = parseLegacyRegulations([
      ["id", "titre", "texte", "obsolete"],
      ["1789", "Critere 1", "", "0"],
      ["1790", "Critere 2", "Critère Canadien : lignes directrices et normes pour l'interprétation des résultats analytiques en microbiologie alimentaire. «Version Août 2009»", "0"],
    ]);
    expect(regulations.skipped).toBe(1);
    expect(regulations.items[0]).toMatchObject({ legacyId: 1790, title: "Critère Canadien", active: true });

    const types = parseLegacyTypes([
      ["id", "nom", "groupe", "famille", "id_critere", "echantillon", "obsolete", "visible", "id_client", "derniere_utilisation"],
      ["1", "SALADES  AVEC SOURCE PROTEIQUE", "Produit traiteur", "Salade…", "1796", "1", "0", "1", "", "2026-07-01"],
      ["9", "ANCIEN TYPE", "", "", "", "1", "0", "1", "", "2019-03-02"],
      ["10", "TYPE OBSOLÈTE", "", "", "", "1", "1", "1", "", "2026-01-01"],
    ]);
    expect(types.items.map((t) => [t.name, t.active, t.regulationLegacyId, t.natureLegacyId])).toEqual([
      ["SALADES AVEC SOURCE PROTEIQUE", true, 1796, 1],
      ["ANCIEN TYPE", false, null, 1],
      ["TYPE OBSOLÈTE", false, null, 1],
    ]);
  });

  it("names a missing column — the type d'analyse (`echantillon`) included", () => {
    expect(parseLegacyTypes([["id", "nom"]]).error).toContain("Colonnes manquantes");
    expect(parseLegacyTypes([["id", "nom", "id_critere", "obsolete", "visible", "derniere_utilisation"]]).error).toBe("Colonnes manquantes : echantillon.");
  });

  it("cuts a title from a regulation text", () => {
    expect(regulationTitle("Arrêté conjoint du ministre de l'agriculture N° 624-04 du 08/04/2004 (Bulletin officiel N° 5214).", "x")).toBe("Arrêté conjoint du ministre de l'agriculture N° 624-04 du 08/04/2004");
    expect(regulationTitle("FCD 2010", "x")).toBe("FCD 2010");
    expect(regulationTitle("- Arrêté conjoint du Ministre de l'Agriculture", "x")).toBe("Arrêté conjoint du Ministre de l'Agriculture");
  });
});

// ---- RETOUR-LABO-16-10.md F3: the import plan, with the reprise of 16/10 ---------

describe("the plan's small rules", () => {
  it("matches a parameter by its name and each alias, once", () => {
    expect(parameterKeys("E. coli", "Escherichia coli\n\nE.coli")).toEqual(["e coli", "escherichia coli"]);
    expect(parameterKeys("Recherche des Salmonella /25g", null)).toEqual(["salmonella"]);
  });

  it("keys a norm version the same way on both sides", () => {
    expect(legacyNorm("NM ISO 6579-1:2021")).toEqual({ key: "NM ISO 6579-1|2021", code: "NM ISO 6579-1", version: "2021", label: "NM ISO 6579-1:2021" });
    expect(legacyNorm("(MI)")).toBeNull();
    expect(legacyNorm("Méthode interne")).toBeNull();
  });

  it("reads a manual change of domain in the journal — anything unreadable counts as one", () => {
    expect(familyEditedByHand(JSON.stringify({ before: { family: "MICRO", active: true }, after: { family: "MICRO", active: false } }))).toBe(false);
    expect(familyEditedByHand(JSON.stringify({ before: { family: "MICRO" }, after: { family: "CHIMIE" } }))).toBe(true);
    for (const unreadable of [null, "", "{", "null", "{}", JSON.stringify({ after: { family: "MICRO" } })]) {
      expect(familyEditedByHand(unreadable)).toBe(true);
    }
  });

  it("reads a hand save of the criteria grid — a save that changed nothing does not count", () => {
    expect(criteriaEditedByHand(JSON.stringify({ name: "X", before: 3, after: 3, changed: [], removed: [] }))).toBe(false);
    expect(criteriaEditedByHand(JSON.stringify({ name: "X", before: 3, after: 2, changed: [], removed: ["k1"] }))).toBe(true);
    expect(criteriaEditedByHand(JSON.stringify({ name: "X", before: 3, after: 3, changed: [{ id: "k1" }], removed: [] }))).toBe(true);
    for (const unreadable of [null, "", "{", "null", "{}", JSON.stringify({ before: 1, after: 1 })]) {
      expect(criteriaEditedByHand(unreadable)).toBe(true);
    }
  });

  it("reads a hand change of regulation — an edit from before slice I (no regulationId) cannot be one", () => {
    expect(regulationEditedByHand(JSON.stringify({ before: { regulationId: "r1" }, after: { regulationId: null } }))).toBe(true);
    expect(regulationEditedByHand(JSON.stringify({ before: { regulationId: null }, after: { regulationId: null, name: "Y" } }))).toBe(false);
    expect(regulationEditedByHand(JSON.stringify({ before: { name: "X", regulation: "texte" }, after: { name: "Y", regulation: null } }))).toBe(false);
    for (const unreadable of [null, "", "{", "null", "{}"]) expect(regulationEditedByHand(unreadable)).toBe(true);
  });
});

const NATURES: CatalogueSnapshot["natures"] = [
  { id: "n-aliments", code: "MICRO_ALIMENTS", label: "Microbiologie des aliments", legacyId: 1, family: "MICRO", legacyType: "ALIMENTAIRE", active: true },
  { id: "n-eaux", code: "MICRO_EAUX", label: "Microbiologie des eaux", legacyId: 3, family: "MICRO", legacyType: "EAU", active: true },
  { id: "n-surfaces", code: "MICRO_SURFACES", label: "Microbiologie des surfaces", legacyId: 5, family: "MICRO", legacyType: "AMBIANCE", active: true },
  { id: "n-pc-aliments", code: "PC_ALIMENTS", label: "Physico-chimie des aliments", legacyId: 20, family: "CHIMIE", legacyType: "ALIMENTAIRE", active: true },
  { id: "n-sensoriel", code: "ANALYSE_SENSORIELLE", label: "Analyse sensorielle", legacyId: 27, family: "AUTRE", legacyType: "ALIMENTAIRE", active: true },
  { id: "n-pc-surfaces", code: "PC_SURFACES", label: "Physico-chimie des surfaces", legacyId: 30, family: "CHIMIE", legacyType: "AMBIANCE", active: true },
];

type Parameter = CatalogueSnapshot["parameters"][number];
const parameter = (over: Partial<Parameter> & Pick<Parameter, "id" | "name" | "category" | "unit" | "aliases">): Parameter => ({
  family: "MICRO",
  alertOnExceed: false,
  limitValue: null,
  threshold: null,
  calcFactor: 1,
  ...over,
});
const PARAMETERS: CatalogueSnapshot["parameters"] = [
  parameter({ id: "p-ecoli", name: "E. coli", category: "ALIMENTAIRE", unit: "UFC/g", aliases: "Escherichia coli", alertOnExceed: true }),
  parameter({ id: "p-staph", name: "Staphylocoques à coagulase positive", category: "ALIMENTAIRE", unit: "UFC/g", aliases: null }),
  parameter({ id: "p-salm", name: "Salmonelles", category: "ALIMENTAIRE", unit: "/25 g", aliases: "Salmonella", alertOnExceed: true, limitValue: 0, threshold: "Absence dans 25 g" }),
  parameter({ id: "p-coli", name: "Coliformes totaux", category: "ALIMENTAIRE", unit: "UFC/g", aliases: null }),
  parameter({ id: "p-amb-ecoli", name: "E. coli", category: "AMBIANCE", unit: "UFC/cm²", aliases: null, alertOnExceed: true }),
  parameter({ id: "p-eau-coli", name: "Coliformes totaux", category: "EAU", unit: "UFC/100 mL", aliases: null }),
];

type Family = CatalogueSnapshot["types"][number];
const family = (over: Partial<Family> & Pick<Family, "id" | "name">): Family => ({
  normalizedName: over.name.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  clientId: null,
  legacyId: null,
  natureId: null,
  family: "MICRO",
  active: true,
  regulationId: null,
  familyEdited: false,
  criteriaEdited: false,
  regulationEdited: false,
  ...over,
});

type Criterion = CatalogueSnapshot["criteria"][number];
const criterion = (over: Partial<Criterion> & Pick<Criterion, "id" | "productTypeId" | "parameterId">): Criterion => ({
  normVersionId: null,
  normKey: null,
  active: true,
  unit: null,
  n: 5,
  c: 2,
  mKind: "VALUE",
  m: 10,
  bigM: 100,
  ...over,
});

const SNAPSHOT: CatalogueSnapshot = {
  natures: NATURES,
  parameters: PARAMETERS,
  types: [
    // Imported on 01/10 as food micro, its criteria bound to food parameters (N2).
    family({ id: "t-mains", name: "HYGIÈNE DU PERSONNEL", legacyId: 700 }),
    family({ id: "t-eau", name: "Eau de boisson", legacyId: 950 }),
    // A workbook family left empty (Q43), and one with its September criteria (Q39).
    family({ id: "t-plats", name: "PLATS CUISINÉS-VOLAILLES" }),
    family({ id: "t-fromages", name: "Fromages frais" }),
    family({ id: "t-client", name: "Famille du client", clientId: "client-a" }),
    // PC families of the old software: one whose domain the admin changed by hand.
    family({ id: "t-sauces", name: "Sauces", legacyId: 901, familyEdited: true }),
    family({ id: "t-huiles", name: "Huiles de friture", legacyId: 902 }),
    // Classified by hand already: never overwritten.
    family({ id: "t-glaces", name: "Glaces", legacyId: 960, natureId: "n-pc-aliments", family: "CHIMIE" }),
    family({ id: "t-decoupe", name: "Surfaces de découpe", natureId: "n-surfaces" }),
  ],
  criteria: [
    criterion({ id: "k-mains-ecoli", productTypeId: "t-mains", parameterId: "p-ecoli", unit: "UFC/mains" }),
    criterion({ id: "k-mains-staph", productTypeId: "t-mains", parameterId: "p-staph", unit: "UFC/mains", normVersionId: "v-staph", normKey: "NM ISO 6888-1|2021" }),
    criterion({ id: "k-mains-salm", productTypeId: "t-mains", parameterId: "p-salm", active: false, mKind: "ABSENCE", m: null, bigM: null, c: null }),
    criterion({ id: "k-eau", productTypeId: "t-eau", parameterId: "p-coli", unit: "/100 ml", n: 1, c: null, bigM: null }),
    criterion({ id: "k-fromages", productTypeId: "t-fromages", parameterId: "p-ecoli" }),
    criterion({ id: "k-glaces", productTypeId: "t-glaces", parameterId: "p-ecoli" }),
    // Bound to food and already present on the surface parameter: a collision.
    criterion({ id: "k-decoupe-food", productTypeId: "t-decoupe", parameterId: "p-ecoli" }),
    criterion({ id: "k-decoupe-amb", productTypeId: "t-decoupe", parameterId: "p-amb-ecoli" }),
  ],
  normKeys: ["NM ISO 6888-1|2021"],
  regulationLegacyIds: [],
  pricedKeys: [],
  inFlight: [],
};

const legacy = (legacyId: number, name: string, natureLegacyId: number | null, lastUse: string): LegacyType => {
  const used = new Date(lastUse);
  return { legacyId, name, group: "", description: "", regulationLegacyId: null, natureLegacyId, obsolete: false, visible: true, lastUse: used, active: used >= new Date("2025-01-01") };
};
const LEGACY_TYPES: LegacyType[] = [
  legacy(700, "HYGIÈNE DU PERSONNEL", 5, "2026-08-01"),
  legacy(950, "EAU DE BOISSON", 3, "2026-07-01"),
  legacy(15, "PLATS CUISINÉS-VOLAILLES", 1, "2024-05-02"),
  legacy(800, "FROMAGES FRAIS", 1, "2026-06-01"),
  legacy(901, "SAUCES", 20, "2026-02-01"),
  legacy(902, "HUILES DE FRITURE", 20, "2026-02-01"),
  legacy(960, "GLACES", 1, "2026-02-01"),
  legacy(705, "HYGIÈNES DE SURFACES", 30, "2026-08-10"),
  legacy(27, "PRODUIT ALIMENTAIRE", 27, "2025-03-01"),
  legacy(990, "ANCIENNE FAMILLE", 17, "2019-01-01"),
];

let nextCriterion = 1;
const legacyCriterion = (typeLegacyId: number, parameterName: string, plan: LegacyCriterion["plan"], unit: string | null = null, norm = ""): LegacyCriterion => ({
  legacyId: nextCriterion++,
  typeLegacyId,
  parameterName,
  norm,
  unit,
  plan,
  reason: plan ? null : "aucune limite",
});
const LIMITLESS = { n: 1, c: null, mKind: "UNSPECIFIED" as const, m: null, bigM: null };
const LEGACY_CRITERIA: LegacyCriterion[] = [
  legacyCriterion(700, "Escherichia coli", { n: 1, c: 2, mKind: "VALUE", m: 10, bigM: 100 }, "UFC/mains"),
  legacyCriterion(15, "Recherche des Salmonella /25g", { n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null }, "/25g", "NM ISO 6579-1:2021"),
  legacyCriterion(15, "Escherichia coli", { n: 5, c: 2, mKind: "VALUE", m: 10, bigM: 100 }, "ufc/g"),
  legacyCriterion(15, "Listeria", null),
  legacyCriterion(800, "E. coli", { n: 5, c: 2, mKind: "VALUE", m: 10, bigM: 100 }, "ufc/g"),
  legacyCriterion(705, "Allergène gluten", LIMITLESS, "/Ecouvillon."),
  legacyCriterion(705, "Sulfites", LIMITLESS, "mg/Ecouvillon"),
  legacyCriterion(27, "Goût", LIMITLESS, "-"),
  legacyCriterion(990, "E. coli", { n: 5, c: 2, mKind: "VALUE", m: 10, bigM: 100 }, "ufc/g"),
];

const plan = (snapshot: CatalogueSnapshot, createMissing: boolean) =>
  planLegacyCatalogue({ legacyTypes: LEGACY_TYPES, legacyCriteria: LEGACY_CRITERIA, snapshot, createMissing });

/** What the route writes, applied to the snapshot (planned refs become ids). */
function applyPlan(snapshot: CatalogueSnapshot, written: CataloguePlan): CatalogueSnapshot {
  const parameters = [
    ...snapshot.parameters,
    ...written.parameters.map((p) =>
      parameter({
        id: p.ref, name: p.name, category: p.category, family: p.family, unit: p.unit, aliases: p.aliases,
        alertOnExceed: p.alertOnExceed, limitValue: p.limitValue, threshold: p.threshold, calcFactor: p.calcFactor,
      })
    ),
  ];
  const types = snapshot.types.map((t) => {
    const update = written.natureUpdates.find((u) => u.typeId === t.id);
    const link = written.links.find((l) => l.typeId === t.id);
    const linked = link ? { ...t, regulationId: `reg-${link.regulationLegacyId}` } : t;
    return update ? { ...linked, natureId: update.natureId, family: update.family ?? t.family } : linked;
  });
  for (const p of written.typesToCreate) {
    types.push(family({ id: p.ref, name: p.name, legacyId: p.legacyId, natureId: p.natureId, family: p.family, active: p.active }));
  }
  const deactivated = new Set([...written.copies.map((c) => c.criterionId), ...written.retirements.map((r) => r.criterionId)]);
  const tidied = new Set(written.tolerances.map((t) => t.criterionId));
  const criteria = snapshot.criteria.map((c) => ({ ...c, ...(deactivated.has(c.id) ? { active: false } : {}), ...(tidied.has(c.id) ? { c: null } : {}) }));
  written.copies.forEach((c, i) => {
    const from = snapshot.criteria.find((k) => k.id === c.criterionId)!;
    criteria.push({ ...from, id: `copie-${i}`, parameterId: c.parameterRef, c: c.c, active: true });
  });
  written.rows.forEach((r, i) => {
    criteria.push(criterion({
      id: `ligne-${i}`, productTypeId: r.productTypeRef, parameterId: r.parameterRef,
      normVersionId: r.norm ? `v-${r.norm.key}` : null, normKey: r.norm?.key ?? null,
      unit: r.unit, n: r.n, c: r.c, mKind: r.mKind, m: r.m, bigM: r.bigM,
    }));
  });
  return { ...snapshot, parameters, types, criteria, normKeys: [...snapshot.normKeys, ...written.normsToCreate.map((n) => n.key)] };
}

describe("planLegacyCatalogue — (a) the type d'analyse of each family", () => {
  const result = plan(SNAPSHOT, true);

  it("gives each family the nature of its `echantillon`, where it has none", () => {
    const updates = Object.fromEntries(result.natureUpdates.map((u) => [u.typeId, [u.natureId, u.family]]));
    expect(updates).toEqual({
      "t-mains": ["n-surfaces", null],
      "t-eau": ["n-eaux", null],
      "t-plats": ["n-aliments", null],
      // A workbook family with its criteria gets its nature too.
      "t-fromages": ["n-aliments", null],
      // Still the default MICRO, never changed by hand: the domain follows.
      "t-huiles": ["n-pc-aliments", "CHIMIE"],
    });
    expect(result.summary.reprise.natures).toMatchObject({ assigned: 5, familyChanged: 1, created: 2 });
  });

  it("creates the old software's new families with their nature and domain", () => {
    expect(result.typesToCreate.map((t) => [t.legacyId, t.natureId, t.family, t.active])).toEqual([
      [705, "n-pc-surfaces", "CHIMIE", true],
      [27, "n-sensoriel", "AUTRE", true],
      [990, null, "MICRO", false],
    ]);
  });

  it("never overrides a nature already set, nor a domain changed by hand; lists what stays « à préciser »", () => {
    expect(result.natureUpdates.map((u) => u.typeId)).not.toContain("t-glaces");
    expect(result.natureUpdates.map((u) => u.typeId)).not.toContain("t-decoupe");
    expect(result.summary.reprise.natures.conflicts).toEqual([{ name: "Sauces", domain: "MICRO", nature: "Physico-chimie des aliments" }]);
    expect(result.summary.reprise.natures.unknown).toEqual([{ name: "ANCIENNE FAMILLE", values: "17" }]);
    expect(result.summary.reprise.natures.unclassified).toEqual([{ name: "Famille du client", active: true }]);
  });
});

describe("planLegacyCatalogue — (b) N2 / OLD31, the criteria of hands, surface, water and air families", () => {
  const result = plan(SNAPSHOT, false);

  it("copies each misbound criterion onto the same germ of the nature's category, limits and norm kept", () => {
    const byId = Object.fromEntries(result.copies.map((c) => [c.criterionId, c]));
    expect(Object.keys(byId).sort()).toEqual(["k-eau", "k-mains-ecoli", "k-mains-staph"]);
    // The surface « E. coli » exists: found by the food parameter's name.
    expect(byId["k-mains-ecoli"]).toMatchObject({ productTypeId: "t-mains", parameterRef: "p-amb-ecoli", unit: "UFC/mains", n: 5, c: 2, m: 10, bigM: 100 });
    expect(byId["k-eau"]).toMatchObject({ productTypeId: "t-eau", parameterRef: "p-eau-coli", unit: "/100 ml", n: 1, c: null });
    // No surface staphylococci yet: created in the nature's domain; the copy keeps
    // its « UFC/mains », the parameter shared with surfaces and air takes none.
    expect(byId["k-mains-staph"]).toMatchObject({ normVersionId: "v-staph", toParameter: "Staphylocoques à coagulase positive", unit: "UFC/mains" });
    expect(result.parameters).toEqual([
      {
        ref: byId["k-mains-staph"].parameterRef,
        name: "Staphylocoques à coagulase positive",
        aliases: null,
        category: "AMBIANCE",
        family: "MICRO",
        unit: null,
        alertOnExceed: false,
        limitValue: null,
        threshold: null,
        calcFactor: 1,
        priced: false,
        similar: [],
        reason: "rattachement",
        keys: ["staphylocoques a coagulase positive"],
      },
    ]);
    expect(result.summary.reprise.rebinding).toMatchObject({ families: 2, copies: 3, deactivated: 3 });
  });

  it("leaves inactive rows, food families and rows already on the right category alone", () => {
    const moved = result.copies.map((c) => c.criterionId);
    expect(moved).not.toContain("k-mains-salm");
    expect(moved).not.toContain("k-fromages");
    expect(moved).not.toContain("k-glaces");
    expect(moved).not.toContain("k-decoupe-amb");
  });

  it("skips and lists a collision rather than doubling a germ", () => {
    expect(result.copies.map((c) => c.criterionId)).not.toContain("k-decoupe-food");
    expect(result.summary.reprise.rebinding.collisions).toEqual([{ family: "Surfaces de découpe", parameter: "E. coli", target: "E. coli" }]);
  });
});

describe("planLegacyCatalogue — (c) Q43 and (d) the categories of new germs", () => {
  it("fills a workbook family only when it has no active criterion (Q39 kept otherwise)", () => {
    const result = plan(SNAPSHOT, false);
    const rowsOf = (ref: string) => result.rows.filter((r) => r.productTypeRef === ref);
    expect(rowsOf("t-plats").map((r) => [r.parameterRef, r.mKind, r.norm?.key ?? null, r.unit])).toEqual([
      ["p-salm", "ABSENCE", "NM ISO 6579-1|2021", "/25g"],
      ["p-ecoli", "VALUE", null, "ufc/g"],
    ]);
    expect(rowsOf("t-fromages")).toEqual([]);
    expect(result.summary.criteria.skipped).toContainEqual({ reason: SKIP_WORKBOOK, count: 1 });
    expect(result.summary.reprise.fill).toEqual({ families: 1, criteria: 2 });
    expect(result.normsToCreate.map((n) => n.key)).toEqual(["NM ISO 6579-1|2021"]);
  });

  it("does not import again a germ imported before 16/10 under another category", () => {
    const result = plan(SNAPSHOT, false);
    expect(result.rows.filter((r) => r.productTypeRef === "t-mains")).toEqual([]);
    expect(result.summary.criteria.alreadyPresent).toBe(1);
  });

  it("without « créer les paramètres inconnus », lists the germs in their family's category and leaves those families empty", () => {
    const result = plan(SNAPSHOT, false);
    expect(result.parameters.every((p) => p.reason === "rattachement")).toBe(true);
    expect(result.summary.criteria.unmatchedParameters).toEqual([
      { label: "Allergène gluten", category: "AMBIANCE", count: 1, created: false },
      { label: "Sulfites", category: "AMBIANCE", count: 1, created: false },
      { label: "Goût", category: "ALIMENTAIRE", count: 1, created: false },
    ]);
    expect(result.summary.reprise.stillEmpty.active.map((f) => f.name)).toEqual([
      "Famille du client", "Huiles de friture", "HYGIÈNES DE SURFACES", "PRODUIT ALIMENTAIRE", "Sauces",
    ]);
    expect(result.summary.reprise.stillEmpty.active.find((f) => f.name === "HYGIÈNES DE SURFACES")).toEqual({
      name: "HYGIÈNES DE SURFACES", nature: "Physico-chimie des surfaces", lastUse: "2026-08-10",
    });
  });

  it("with it, creates them in the category and domain of the family's nature (PC surfaces, sensory)", () => {
    const result = plan(SNAPSHOT, true);
    const created = result.parameters.filter((p) => p.reason === "ancien logiciel").map((p) => [p.name, p.category, p.family, p.unit]);
    expect(created).toEqual([
      ["Allergène gluten", "AMBIANCE", "CHIMIE", "/Ecouvillon."],
      ["Sulfites", "AMBIANCE", "CHIMIE", "mg/Ecouvillon"],
      ["Goût", "ALIMENTAIRE", "AUTRE", "-"],
    ]);
    const surfaces = result.typesToCreate.find((t) => t.legacyId === 705)!.ref;
    expect(result.rows.filter((r) => r.productTypeRef === surfaces).map((r) => [r.mKind, r.bigM])).toEqual([
      ["UNSPECIFIED", null],
      ["UNSPECIFIED", null],
    ]);
    expect(result.summary.criteria.unmatchedParameters.every((u) => u.created)).toBe(true);
    // A family without a type d'analyse keeps slice J's rule: food first.
    const old = result.typesToCreate.find((t) => t.legacyId === 990)!.ref;
    expect(result.rows.filter((r) => r.productTypeRef === old).map((r) => r.parameterRef)).toEqual(["p-ecoli"]);
  });

  it("journals each existing family changed, once", () => {
    const journal = Object.fromEntries(plan(SNAPSHOT, true).journal.map((e) => [e.typeId, e.metadata]));
    expect(Object.keys(journal).sort()).toEqual(["t-eau", "t-fromages", "t-huiles", "t-mains", "t-plats"]);
    expect(journal["t-huiles"]).toEqual({ name: "Huiles de friture", natureId: { before: null, after: "n-pc-aliments" }, family: { before: "MICRO", after: "CHIMIE" } });
    expect(journal["t-plats"]).toEqual({ name: "PLATS CUISINÉS-VOLAILLES", natureId: { before: null, after: "n-aliments" }, added: 2 });
    expect(journal["t-mains"].rebound?.map((r) => r.criterionId).sort()).toEqual(["k-mains-ecoli", "k-mains-staph"]);
  });
});

describe("planLegacyCatalogue — (e) the tolerance c an earlier import left where it means nothing (F2)", () => {
  // Imported before 19/10 with the old software's CONTROL column: an absence
  // test and a limitless row carrying c, a hands row among them (copied in (b)).
  const stale: CatalogueSnapshot = {
    ...SNAPSHOT,
    criteria: [
      ...SNAPSHOT.criteria.filter((c) => c.id !== "k-mains-ecoli"),
      criterion({ id: "k-mains-ecoli", productTypeId: "t-mains", parameterId: "p-ecoli", unit: "UFC/mains", mKind: "ABSENCE", m: null, bigM: null, c: 1 }),
      criterion({ id: "k-fromages-coli", productTypeId: "t-fromages", parameterId: "p-coli", mKind: "UNSPECIFIED", m: null, bigM: null, c: 2 }),
      // c with a figure: kept.
      criterion({ id: "k-fromages-staph", productTypeId: "t-fromages", parameterId: "p-staph", mKind: "UNSPECIFIED", m: null, bigM: 1000, c: 1 }),
    ],
  };
  const result = plan(stale, false);

  it("clears c on those rows only, and copies none", () => {
    expect(result.tolerances.map((t) => t.criterionId).sort()).toEqual(["k-fromages-coli", "k-mains-ecoli"]);
    expect(result.summary.reprise.tolerances).toEqual({ rows: 2, families: 2 });
    expect(result.copies.find((c) => c.criterionId === "k-mains-ecoli")).toMatchObject({ mKind: "ABSENCE", c: null });
  });

  it("journals the count per family, and plans nothing more once written", () => {
    const journal = Object.fromEntries(result.journal.map((e) => [e.typeId, e.metadata]));
    expect(journal["t-fromages"]).toMatchObject({ toleranceCleared: 1 });
    expect(journal["t-mains"]).toMatchObject({ toleranceCleared: 1 });
    expect(plan(applyPlan(stale, result), false).tolerances).toEqual([]);
  });
});

describe("planLegacyCatalogue — idempotence", () => {
  for (const createMissing of [false, true]) {
    it(`plans nothing more once its plan is written (créer les paramètres inconnus : ${createMissing ? "oui" : "non"})`, () => {
      const first = plan(SNAPSHOT, createMissing);
      expect(first.rows.length + first.copies.length + first.natureUpdates.length).toBeGreaterThan(0);
      const second = plan(applyPlan(SNAPSHOT, first), createMissing);
      expect({
        typesToCreate: second.typesToCreate,
        parameters: second.parameters,
        natureUpdates: second.natureUpdates,
        retirements: second.retirements,
        copies: second.copies,
        tolerances: second.tolerances,
        rows: second.rows,
        normsToCreate: second.normsToCreate,
        journal: second.journal,
      }).toEqual({ typesToCreate: [], parameters: [], natureUpdates: [], retirements: [], copies: [], tolerances: [], rows: [], normsToCreate: [], journal: [] });
      // What only a person can settle is still listed.
      expect(second.summary.reprise.rebinding.collisions).toHaveLength(1);
      expect(second.summary.reprise.natures.conflicts).toHaveLength(1);
    });
  }
});

describe("planLegacyCatalogue — the twins carry their germ, and look-alikes are flagged", () => {
  // A hands family imported on 01/10 with its Salmonella on the food parameter,
  // a surface family whose criteria read per cm², and the seed's
  // « Salmonelles surfaces » (alert on) already in the catalogue.
  const snapshot: CatalogueSnapshot = {
    ...SNAPSHOT,
    parameters: [
      ...PARAMETERS,
      parameter({ id: "p-amb-salm-surf", name: "Salmonelles surfaces", category: "AMBIANCE", unit: "/surface", aliases: null, alertOnExceed: true }),
    ],
    types: [
      family({ id: "t-mains", name: "HYGIÈNE DU PERSONNEL", legacyId: 700, natureId: "n-surfaces" }),
      family({ id: "t-plan", name: "Plans de travail", legacyId: 701, natureId: "n-surfaces" }),
    ],
    criteria: [
      criterion({ id: "k-mains-salm", productTypeId: "t-mains", parameterId: "p-salm", unit: "/mains", mKind: "ABSENCE", m: null, bigM: null, c: null }),
      criterion({ id: "k-plan-salm", productTypeId: "t-plan", parameterId: "p-salm", unit: "/25 cm²", mKind: "ABSENCE", m: null, bigM: null, c: null }),
      criterion({ id: "k-mains-staph", productTypeId: "t-mains", parameterId: "p-staph", unit: "UFC/mains" }),
      criterion({ id: "k-plan-staph", productTypeId: "t-plan", parameterId: "p-staph", unit: "UFC/cm²" }),
    ],
    pricedKeys: ["ambiance::staphylocoques à coagulase positive"],
  };
  const result = planLegacyCatalogue({ legacyTypes: [], legacyCriteria: [], snapshot, createMissing: false });
  const salm = result.parameters.find((p) => p.name === "Salmonelles")!;
  const staph = result.parameters.find((p) => p.name === "Staphylocoques à coagulase positive")!;

  it("copies the contamination alert, the limit, the threshold and the factor onto the twin", () => {
    expect(salm).toMatchObject({ category: "AMBIANCE", alertOnExceed: true, limitValue: 0, threshold: "Absence dans 25 g", calcFactor: 1 });
    expect(result.summary.reprise.parameters.find((p) => p.name === "Salmonelles")).toMatchObject({ alert: true });
  });

  it("never gives a hands unit to the shared twin: the unit the other criteria agree on, else none", () => {
    expect(salm.unit).toBe("/25 cm²");
    expect(staph.unit).toBe("UFC/cm²");
    // Each copy keeps its own unit — the one the bench and the report read (Q40).
    expect(Object.fromEntries(result.copies.map((c) => [c.criterionId, c.unit]))).toMatchObject({ "k-mains-salm": "/mains", "k-plan-staph": "UFC/cm²" });
  });

  it("lists a twin that looks like an existing parameter of its category, and one without a price", () => {
    expect(salm.similar).toEqual(["Salmonelles surfaces"]);
    expect(staph.similar).toEqual([]);
    expect(result.summary.reprise.nearDuplicates).toBe(1);
    expect(result.summary.reprise.parameters.map((p) => [p.name, p.priced])).toEqual([
      ["Salmonelles", false],
      ["Staphylocoques à coagulase positive", true],
    ]);
  });

  it("an alias on the existing parameter settles it: the copies go there, nothing is created", () => {
    const aliased: CatalogueSnapshot = {
      ...snapshot,
      parameters: snapshot.parameters.map((p) => (p.id === "p-amb-salm-surf" ? { ...p, aliases: "Salmonelles" } : p)),
    };
    const settled = planLegacyCatalogue({ legacyTypes: [], legacyCriteria: [], snapshot: aliased, createMissing: false });
    expect(settled.parameters.map((p) => p.name)).toEqual(["Staphylocoques à coagulase positive"]);
    expect(settled.copies.filter((c) => c.parameterRef === "p-amb-salm-surf").map((c) => c.criterionId).sort()).toEqual(["k-mains-salm", "k-plan-salm"]);
    expect(settled.summary.reprise.nearDuplicates).toBe(0);
  });
});

describe("planLegacyCatalogue — a family changed by hand is never undone", () => {
  // Family A (legacyId 10) holds only Salmonelles: its Listeria was deleted by
  // hand. Family B is a hands family whose Salmonella the lab re-pointed to
  // « Salmonelles surfaces ». Family C's regulation was cleared by hand.
  const snapshot: CatalogueSnapshot = {
    ...SNAPSHOT,
    parameters: [
      ...PARAMETERS,
      parameter({ id: "p-list", name: "Listeria", category: "ALIMENTAIRE", unit: "/25 g", aliases: null, alertOnExceed: true }),
      parameter({ id: "p-amb-salm-surf", name: "Salmonelles surfaces", category: "AMBIANCE", unit: "/surface", aliases: null, alertOnExceed: true }),
    ],
    types: [
      family({ id: "t-a", name: "Famille A", legacyId: 10, natureId: "n-aliments", criteriaEdited: true }),
      family({ id: "t-b", name: "Famille B mains", legacyId: 11, natureId: "n-surfaces", criteriaEdited: true }),
      family({ id: "t-c", name: "Famille C", legacyId: 12, natureId: "n-aliments", regulationEdited: true }),
      family({ id: "t-d", name: "Famille D", legacyId: 13, natureId: "n-aliments" }),
      // A workbook family emptied by hand to no row at all, one whose rows were all
      // deactivated by hand, and one whose rows are inactive without any hand edit.
      family({ id: "t-e", name: "Famille E vide", natureId: "n-aliments", criteriaEdited: true }),
      family({ id: "t-f", name: "Famille F inactive", natureId: "n-aliments", criteriaEdited: true }),
      family({ id: "t-g", name: "Famille G inactive", natureId: "n-aliments" }),
    ],
    criteria: [
      criterion({ id: "k-a-salm", productTypeId: "t-a", parameterId: "p-salm", mKind: "ABSENCE", m: null, bigM: null, c: null }),
      criterion({ id: "k-b-salm", productTypeId: "t-b", parameterId: "p-amb-salm-surf", mKind: "ABSENCE", m: null, bigM: null, c: null }),
      criterion({ id: "k-c-ecoli", productTypeId: "t-c", parameterId: "p-ecoli" }),
      criterion({ id: "k-d-ecoli", productTypeId: "t-d", parameterId: "p-ecoli" }),
      criterion({ id: "k-f-ecoli", productTypeId: "t-f", parameterId: "p-ecoli", active: false }),
      criterion({ id: "k-g-ecoli", productTypeId: "t-g", parameterId: "p-ecoli", active: false }),
    ],
    regulationLegacyIds: [1796],
  };
  const withRegulation = (t: LegacyType): LegacyType => ({ ...t, regulationLegacyId: 1796 });
  const types: LegacyType[] = [
    legacy(10, "FAMILLE A", 1, "2026-08-01"),
    legacy(11, "FAMILLE B MAINS", 5, "2026-08-01"),
    withRegulation(legacy(12, "FAMILLE C", 1, "2026-08-01")),
    withRegulation(legacy(13, "FAMILLE D", 1, "2026-08-01")),
    legacy(14, "FAMILLE E VIDE", 1, "2026-08-01"),
    legacy(15, "FAMILLE F INACTIVE", 1, "2026-08-01"),
    legacy(16, "FAMILLE G INACTIVE", 1, "2026-08-01"),
  ];
  const ABSENCE = { n: 5, c: null, mKind: "ABSENCE" as const, m: null, bigM: null };
  const criteria: LegacyCriterion[] = [
    legacyCriterion(10, "Salmonella", ABSENCE, "/25g"),
    legacyCriterion(10, "Listeria", ABSENCE, "/25g"),
    legacyCriterion(11, "Salmonella", ABSENCE, "/mains"),
    legacyCriterion(14, "Listeria", ABSENCE, "/25g"),
    legacyCriterion(15, "Listeria", ABSENCE, "/25g"),
    legacyCriterion(16, "Listeria", ABSENCE, "/25g"),
  ];
  const result = planLegacyCatalogue({ legacyTypes: types, legacyCriteria: criteria, snapshot, createMissing: true });
  const rowsOf = (ref: string) => result.rows.filter((r) => r.productTypeRef === ref).map((r) => r.parameterRef);

  it("does not re-insert a criterion deleted by hand", () => {
    expect(rowsOf("t-a")).toEqual([]);
    expect(result.summary.criteria.skipped).toContainEqual({ reason: SKIP_EDITED, count: 3 });
    // Its Salmonella is held: counted as present, not as left out.
    expect(result.summary.criteria.alreadyPresent).toBe(1);
  });

  it("does not add a second germ next to a criterion re-pointed by hand, even when creating unknown germs", () => {
    expect(rowsOf("t-b")).toEqual([]);
    expect(result.parameters.filter((p) => p.category === "AMBIANCE")).toEqual([]);
  });

  it("does not link again a regulation cleared by hand; links the others and journals each link", () => {
    expect(result.links).toEqual([{ typeId: "t-d", name: "Famille D", regulationLegacyId: 1796 }]);
    expect(result.summary.reprise.links).toBe(1);
    expect(result.journal.find((e) => e.typeId === "t-d")?.metadata.regulation).toEqual({ before: null, legacyId: 1796 });
    expect(result.journal.find((e) => e.typeId === "t-c")?.metadata.regulation).toBeUndefined();
  });

  it("fills a family changed by hand only when it holds no criterion row at all; Q43 unchanged otherwise", () => {
    expect(rowsOf("t-e")).toEqual(["p-list"]);
    expect(rowsOf("t-f")).toEqual([]);
    // Never touched by hand, its rows inactive: Q43 fills it.
    expect(rowsOf("t-g")).toEqual(["p-list"]);
  });

  it("lists what it leaves alone, by family", () => {
    expect(result.summary.reprise.handEdited).toEqual([
      { id: "t-a", name: "Famille A", criteria: 1, regulation: false },
      { id: "t-b", name: "Famille B mains", criteria: 1, regulation: false },
      { id: "t-c", name: "Famille C", criteria: 0, regulation: true },
      { id: "t-f", name: "Famille F inactive", criteria: 1, regulation: false },
    ]);
  });

  it("plans nothing more once written, the families changed by hand still listed", () => {
    const second = planLegacyCatalogue({ legacyTypes: types, legacyCriteria: criteria, snapshot: applyPlan(snapshot, result), createMissing: true });
    expect([second.rows, second.links, second.parameters, second.copies]).toEqual([[], [], [], []]);
    expect(second.summary.reprise.handEdited.map((f) => f.id)).toEqual(["t-a", "t-b", "t-c", "t-f"]);
  });
});

describe("planLegacyCatalogue — what the import does to the bench", () => {
  it("counts the samples in progress whose verdicts change, by status: start to be judged, or lose their criteria", () => {
    const snapshot: CatalogueSnapshot = {
      ...SNAPSHOT,
      inFlight: [
        // The hands family: its copies judge its hands samples; a food sample on it loses its rows.
        { productTypeId: "t-mains", type: "AMBIANCE", status: "EN_ANALYSE", count: 2 },
        { productTypeId: "t-mains", type: "ALIMENTAIRE", status: "PROGRAMME", count: 1 },
        // The workbook family filled (Q43): its food samples start to be judged.
        { productTypeId: "t-plats", type: "ALIMENTAIRE", status: "RECU", count: 1 },
        // A family the import leaves alone.
        { productTypeId: "t-glaces", type: "ALIMENTAIRE", status: "EN_ANALYSE", count: 4 },
      ],
    };
    expect(plan(snapshot, false).summary.reprise.inFlight).toEqual({
      startJudged: 3,
      loseCriteria: 1,
      retired: 0,
      byStatus: [
        { status: "RECU", startJudged: 1, loseCriteria: 0, retired: 0 },
        { status: "PROGRAMME", startJudged: 0, loseCriteria: 1, retired: 0 },
        { status: "EN_ANALYSE", startJudged: 2, loseCriteria: 0, retired: 0 },
      ],
    });
    expect(plan(SNAPSHOT, false).summary.reprise.inFlight).toEqual({ startJudged: 0, loseCriteria: 0, retired: 0, byStatus: [] });
  });

  it("lists the food parameters the copies leave without any active criterion (D-13)", () => {
    // Staphylococci and food coliforms had only the hands and water rows; E. coli keeps the cheeses'.
    expect(plan(SNAPSHOT, false).summary.reprise.orphanedSources).toEqual([
      { name: "Coliformes totaux", category: "ALIMENTAIRE" },
      { name: "Staphylocoques à coagulase positive", category: "ALIMENTAIRE" },
    ]);
  });
});

// ---- (f) OBSOLETE = 2: rows the old software deleted from a family's grid ----------

const deletedRow = (typeLegacyId: number, parameterName: string, norm: string): LegacyCriterion => ({
  legacyId: nextCriterion++,
  typeLegacyId,
  parameterName,
  norm,
  unit: null,
  plan: null,
  reason: REASON_DELETED,
});

describe("planLegacyCatalogue — (f) the rows the old software deleted from a family's grid (OBSOLETE = 2)", () => {
  const ABSENCE = { n: 5, c: null, mKind: "ABSENCE" as const, m: null, bigM: null };
  const VALUE = { n: 5, c: 1, mKind: "VALUE" as const, m: 100, bigM: null };
  const snapshot: CatalogueSnapshot = {
    ...SNAPSHOT,
    parameters: [
      ...PARAMETERS,
      parameter({ id: "p-list", name: "Listeria monocytogenes", category: "ALIMENTAIRE", unit: "/25 g", aliases: null, alertOnExceed: true }),
      parameter({ id: "p-amb-staph", name: "Staphylocoques à coagulase positive", category: "AMBIANCE", unit: null, aliases: null }),
      parameter({ id: "p-bl", name: "Bactéries lactiques mésophiles", category: "ALIMENTAIRE", unit: "UFC/g", aliases: null }),
      parameter({ id: "p-plomb", name: "Plomb (SA)", category: "ALIMENTAIRE", family: "CHIMIE", unit: "mg/kg", aliases: null }),
    ],
    types: [
      family({ id: "t-volaille", name: "PRODUITS CUITS VOLAILLE", legacyId: 30, natureId: "n-aliments" }),
      // A hands family the first reprise already rebound: its food row inactive, the twin active.
      family({ id: "t-mains", name: "HYGIENE MAINS", legacyId: 40, natureId: "n-surfaces" }),
      // Imported on 01/10 as food micro, its type d'analyse given by this plan's (a).
      family({ id: "t-plan", name: "PLANS DE TRAVAIL", legacyId: 41 }),
      family({ id: "t-main", name: "FAMILLE MODIFIEE", legacyId: 50, natureId: "n-aliments", criteriaEdited: true }),
      family({ id: "t-wb", name: "SALADE ET TOMATE", natureId: "n-aliments" }),
      family({ id: "t-cosm", name: "COSMETIQUES", legacyId: 70, natureId: "n-aliments" }),
    ],
    criteria: [
      // The Listeria case: the deleted 11290-2 (m = 100) next to the 11290-1 in service (absence).
      criterion({ id: "k-v-list-old", productTypeId: "t-volaille", parameterId: "p-list", normVersionId: "v1", normKey: "NM ISO 11290-2|2017", n: 5, c: 1, m: 100, bigM: null }),
      criterion({ id: "k-v-list", productTypeId: "t-volaille", parameterId: "p-list", normVersionId: "v2", normKey: "NM ISO 11290-1|2017", mKind: "ABSENCE", c: null, m: null, bigM: null }),
      // Deleted in n° 30, still in service in n° 31 (same name): kept.
      criterion({ id: "k-v-salm", productTypeId: "t-volaille", parameterId: "p-salm", normVersionId: "v3", normKey: "NM ISO 6579-1|2017", mKind: "ABSENCE", c: null, m: null, bigM: null }),
      // Deleted and in service under the same germ and norm (two spellings): kept.
      criterion({ id: "k-v-ecoli", productTypeId: "t-volaille", parameterId: "p-ecoli" }),
      // Already inactive: nothing to do.
      criterion({ id: "k-v-staph-old", productTypeId: "t-volaille", parameterId: "p-staph", normVersionId: "v4", normKey: "NM ISO 6888-1|2008", active: false }),
      criterion({ id: "k-m-staph-food", productTypeId: "t-mains", parameterId: "p-staph", normVersionId: "v4", normKey: "NM ISO 6888-1|2008", active: false }),
      criterion({ id: "k-m-staph", productTypeId: "t-mains", parameterId: "p-amb-staph", normVersionId: "v4", normKey: "NM ISO 6888-1|2008" }),
      // The surface « E. coli » has no « Escherichia coli » alias: reached through the food twin.
      criterion({ id: "k-m-ecoli-old", productTypeId: "t-mains", parameterId: "p-amb-ecoli", normVersionId: "v5", normKey: "NM ISO 16649-2|2001" }),
      criterion({ id: "k-m-ecoli", productTypeId: "t-mains", parameterId: "p-amb-ecoli", normVersionId: "v6", normKey: "NM ISO 16649-2|2020" }),
      criterion({ id: "k-p-ecoli-old", productTypeId: "t-plan", parameterId: "p-ecoli", normVersionId: "v5", normKey: "NM ISO 16649-2|2001" }),
      criterion({ id: "k-p-coli", productTypeId: "t-plan", parameterId: "p-coli", mKind: "UNSPECIFIED", c: null, m: null, bigM: null }),
      criterion({ id: "k-e-bl", productTypeId: "t-main", parameterId: "p-bl", normVersionId: "v7", normKey: "NM ISO 15214|1998" }),
      criterion({ id: "k-wb-bl", productTypeId: "t-wb", parameterId: "p-bl", normVersionId: "v7", normKey: "NM ISO 15214|1998" }),
      criterion({ id: "k-o-plomb", productTypeId: "t-cosm", parameterId: "p-plomb", mKind: "VALUE", n: 1, c: null, m: 2, bigM: null }),
    ],
    normKeys: ["NM ISO 11290-1|2017", "NM ISO 11290-2|2017", "NM ISO 15214|1998", "NM ISO 16649-2|2001", "NM ISO 16649-2|2020", "NM ISO 6579-1|2017", "NM ISO 6888-1|2008"],
    inFlight: [
      { productTypeId: "t-volaille", type: "ALIMENTAIRE", status: "EN_ANALYSE", count: 2 },
      { productTypeId: "t-mains", type: "AMBIANCE", status: "PROGRAMME", count: 1 },
      // Its copy (b) judges it first: counted once, as starting to be judged.
      { productTypeId: "t-plan", type: "AMBIANCE", status: "RECU", count: 1 },
      // Families (f) leaves alone.
      { productTypeId: "t-main", type: "ALIMENTAIRE", status: "EN_ANALYSE", count: 4 },
      { productTypeId: "t-wb", type: "ALIMENTAIRE", status: "EN_ANALYSE", count: 3 },
    ],
  };
  const types: LegacyType[] = [
    legacy(30, "PRODUITS CUITS VOLAILLE", 1, "2026-08-01"),
    legacy(31, "PRODUITS CUITS - VOLAILLE", 1, "2023-01-01"),
    legacy(40, "HYGIENE MAINS", 5, "2026-08-01"),
    legacy(41, "PLANS DE TRAVAIL", 5, "2026-08-01"),
    legacy(50, "FAMILLE MODIFIEE", 1, "2026-08-01"),
    legacy(60, "SALADE ET TOMATE", 1, "2026-08-01"),
    legacy(70, "COSMETIQUES", 1, "2026-08-01"),
  ];
  const criteria: LegacyCriterion[] = [
    deletedRow(30, "Listeria monocytogenes", "NM ISO 11290-2:2017"),
    legacyCriterion(30, "Listeria monocytogenes", ABSENCE, "/25g", "NM ISO 11290-1:2017"),
    deletedRow(30, "Salmonella", "NM ISO 6579-1:2017"),
    deletedRow(30, "Escherichia coli", ""),
    legacyCriterion(30, "E. coli", VALUE, "ufc/g"),
    deletedRow(30, "Staphylocoques à coagulase positive à 37 °C", "NM ISO 6888-1:2008"),
    legacyCriterion(31, "Recherche des Salmonella /25g", ABSENCE, "/25g", "NM ISO 6579-1:2017"),
    deletedRow(40, "Staphylocoques à coagulase positive", "NM ISO 6888-1:2008"),
    deletedRow(40, "Escherichia coli", "NM ISO 16649-2:2001"),
    legacyCriterion(40, "Escherichia coli", VALUE, "UFC/mains", "NM ISO 16649-2:2020"),
    deletedRow(41, "Escherichia coli", "NM ISO 16649-2:2001"),
    legacyCriterion(41, "Coliformes totaux", LIMITLESS),
    deletedRow(50, "Bactéries lactiques mésophiles", "NM ISO 15214:1998"),
    deletedRow(60, "Bactéries lactiques mésophiles", "NM ISO 15214:1998"),
    deletedRow(70, "Plomb (SA)", "MI LAQ 222.04"),
  ];
  const run = (s: CatalogueSnapshot) => planLegacyCatalogue({ legacyTypes: types, legacyCriteria: criteria, snapshot: s, createMissing: false });
  const result = run(snapshot);
  const retiredIds = () => result.retirements.map((r) => r.criterionId).sort();

  it("deactivates the rows only a deleted row explains — the Listeria m = 100 first, the twin of (b) included", () => {
    expect(retiredIds()).toEqual(["k-m-ecoli-old", "k-m-staph", "k-o-plomb", "k-p-ecoli-old", "k-v-list-old"]);
    expect(result.retirements.find((r) => r.criterionId === "k-v-list-old")).toEqual({
      criterionId: "k-v-list-old", productTypeId: "t-volaille", parameter: "Listeria monocytogenes", norm: "NM ISO 11290-2|2017",
    });
    expect(result.summary.reprise.retired).toMatchObject({ rows: 5, families: 4 });
  });

  it("keeps a row whose germ × norm version is still in service — in the family's own row or anywhere in its name group", () => {
    for (const kept of ["k-v-list", "k-v-salm", "k-v-ecoli", "k-m-ecoli"]) expect(retiredIds()).not.toContain(kept);
  });

  it("plans the retirement before (b): a deleted row is never copied, the rows in service still are", () => {
    expect(result.copies.map((c) => c.criterionId)).toEqual(["k-p-coli"]);
    expect(result.natureUpdates.map((u) => u.typeId)).toContain("t-plan");
  });

  it("leaves a family saved by hand alone and lists it with the rows left active", () => {
    expect(retiredIds()).not.toContain("k-e-bl");
    expect(result.summary.reprise.retired.leftActive).toEqual([{ id: "t-main", name: "FAMILLE MODIFIEE", rows: 1, origin: "main" }]);
  });

  it("leaves a workbook family with its September criteria alone — its rows are the workbook's, never listed", () => {
    expect(retiredIds()).not.toContain("k-wb-bl");
    expect(result.summary.reprise.retired.leftActive.map((f) => f.id)).not.toContain("t-wb");
  });

  it("imports no deleted row and counts them apart from the obsolete ones", () => {
    expect(result.rows).toEqual([]);
    expect(result.summary.criteria.skipped).toContainEqual({ reason: REASON_DELETED, count: 9 });
    expect(result.summary.criteria.skipped).toContainEqual({ reason: SKIP_WORKBOOK, count: 1 });
  });

  it("journals the rows of each family, lists a family left without any active row, and counts the samples in progress", () => {
    const journal = Object.fromEntries(result.journal.map((e) => [e.typeId, e.metadata]));
    expect(journal["t-volaille"]).toEqual({
      name: "PRODUITS CUITS VOLAILLE",
      retired: [{ criterionId: "k-v-list-old", parameter: "Listeria monocytogenes", norm: "NM ISO 11290-2|2017" }],
    });
    expect(journal["t-mains"].retired?.map((r) => r.criterionId)).toEqual(["k-m-ecoli-old", "k-m-staph"]);
    expect(journal["t-main"]).toBeUndefined();
    expect(result.summary.reprise.stillEmpty.active.map((f) => f.name)).toEqual(["COSMETIQUES"]);
    expect(result.summary.reprise.inFlight).toEqual({
      startJudged: 1,
      loseCriteria: 0,
      retired: 3,
      byStatus: [
        { status: "RECU", startJudged: 1, loseCriteria: 0, retired: 0 },
        { status: "PROGRAMME", startJudged: 0, loseCriteria: 0, retired: 1 },
        { status: "EN_ANALYSE", startJudged: 0, loseCriteria: 0, retired: 2 },
      ],
    });
  });

  it("plans nothing more once written: the retired rows stay, inactive, and still count as present", () => {
    const second = run(applyPlan(snapshot, result));
    expect([second.retirements, second.copies, second.rows, second.journal]).toEqual([[], [], [], []]);
    expect(second.summary.reprise.retired).toEqual({ rows: 0, families: 0, leftActive: [{ id: "t-main", name: "FAMILLE MODIFIEE", rows: 1, origin: "main" }] });
    expect(second.summary.reprise.inFlight.retired).toBe(0);
  });
});

describe("planLegacyCatalogue — (f) and « Scinder par domaine »", () => {
  // « AUTRES » (n° 549, micro) and « AUTRES_ » (n° 550, PC): one family once
  // imported, each with a deleted row next to the version in service.
  const natures = NATURES.filter((n) => n.id === "n-aliments" || n.id === "n-pc-aliments");
  const parameters = [
    parameter({ id: "p-ecoli", name: "E. coli", category: "ALIMENTAIRE", unit: "UFC/g", aliases: "Escherichia coli" }),
    parameter({ id: "p-plomb", name: "Plomb", category: "ALIMENTAIRE", family: "CHIMIE", unit: "mg/kg", aliases: null }),
    parameter({ id: "p-ph", name: "pH", category: "ALIMENTAIRE", family: "CHIMIE", unit: null, aliases: null }),
  ];
  const before: CatalogueSnapshot = {
    natures,
    parameters,
    types: [family({ id: "t-autres", name: "AUTRES", legacyId: 549, natureId: "n-aliments" })],
    criteria: [
      criterion({ id: "k-ecoli-old", productTypeId: "t-autres", parameterId: "p-ecoli", normVersionId: "v1", normKey: "NM ISO 16649-2|2001", c: null, bigM: null }),
      criterion({ id: "k-ecoli", productTypeId: "t-autres", parameterId: "p-ecoli", normVersionId: "v2", normKey: "NM ISO 16649-2|2020", c: null, bigM: null }),
      criterion({ id: "k-plomb-old", productTypeId: "t-autres", parameterId: "p-plomb", normVersionId: "v3", normKey: "NM 08.0.200|2005", c: null, bigM: null }),
      criterion({ id: "k-plomb", productTypeId: "t-autres", parameterId: "p-plomb", normVersionId: "v4", normKey: "NM 08.0.200|2019", c: null, bigM: null }),
      criterion({ id: "k-ph", productTypeId: "t-autres", parameterId: "p-ph", mKind: "UNSPECIFIED", c: null, m: null, bigM: null }),
    ],
    normKeys: ["NM 08.0.200|2005", "NM 08.0.200|2019", "NM ISO 16649-2|2001", "NM ISO 16649-2|2020"],
    regulationLegacyIds: [],
    pricedKeys: [],
    inFlight: [],
  };
  const types = [legacy(549, "AUTRES", 1, "2026-09-07"), legacy(550, "AUTRES_", 20, "2026-09-07")];
  const VALUE = { n: 1, c: null, mKind: "VALUE" as const, m: 10, bigM: null };
  const criteria: LegacyCriterion[] = [
    deletedRow(549, "E. coli", "NM ISO 16649-2:2001"),
    legacyCriterion(549, "E. coli", VALUE, "ufc/g", "NM ISO 16649-2:2020"),
    deletedRow(550, "Plomb", "NM 08.0.200:2005"),
    legacyCriterion(550, "Plomb", VALUE, "mg/kg", "NM 08.0.200:2019"),
    legacyCriterion(550, "pH", LIMITLESS),
  ];
  const run = (s: CatalogueSnapshot) => planLegacyCatalogue({ legacyTypes: types, legacyCriteria: criteria, snapshot: s, createMissing: false });

  /** The split as its route writes it — copies, deactivation, journal — and as the import's read sees it. */
  function split(s: CatalogueSnapshot, domain: Domain): CatalogueSnapshot {
    const parameterOf = new Map(s.parameters.map((p) => [p.id, p]));
    const source = s.criteria.filter((c) => c.productTypeId === "t-autres");
    const rows: SplitCriterion[] = source.map((c) => {
      const p = parameterOf.get(c.parameterId)!;
      return { ...c, parameterName: p.name, parameterFamily: p.family, parameterCategory: p.category };
    });
    const moved = movedCriteria(rows, domain);
    const created = { id: "t-new", name: "AUTRES — physico-chimie", normalizedName: "autres physico chimie", family: domain, natureId: "n-pc-aliments", clientId: null, active: true, regulationId: null };
    const activeBefore = source.filter((c) => c.active).length;
    const journal = splitJournal({ source: { id: "t-autres", name: "AUTRES" }, created, domain, moved, sourceRows: rows.length, sourceActiveBefore: activeBefore, sourceActiveAfter: activeBefore - moved.length });
    const movedIds = new Set(moved.map((r) => r.id));
    const normKeyOf = new Map(source.map((c) => [c.id, c.normKey]));
    return {
      ...s,
      types: [
        ...s.types.map((t) => (t.id === "t-autres" ? { ...t, criteriaEdited: criteriaEditedByHand(JSON.stringify(journal.sourceCriteria)) } : t)),
        family({ ...created, criteriaEdited: criteriaEditedByHand(JSON.stringify(journal.newCriteria)), splitFrom: splitOrigin(JSON.stringify(journal.newCriteria))?.from ?? null }),
      ],
      criteria: [
        ...s.criteria.map((c) => (movedIds.has(c.id) ? { ...c, active: false } : c)),
        ...moved.map((r, i) => ({ id: `k-new-${i}`, productTypeId: "t-new", normKey: normKeyOf.get(r.id) ?? null, ...copiedCriterion(r) })),
      ],
    };
  }

  it("reads the two families of a split from its journal, and nothing from any other save", () => {
    const after = split(before, "CHIMIE");
    expect(after.types.find((t) => t.id === "t-new")?.splitFrom).toBe("t-autres");
    expect(splitOrigin(JSON.stringify({ name: "X", before: 3, after: 3, changed: [], removed: [] }))).toBeNull();
    for (const unreadable of [null, "", "{", "null", JSON.stringify({ split: { from: { id: "a" }, to: { id: "a" } } })]) {
      expect(splitOrigin(unreadable)).toBeNull();
    }
  });

  it("before a split, retires the deleted rows of both domains", () => {
    expect(run(before).retirements.map((r) => r.criterionId).sort()).toEqual(["k-ecoli-old", "k-plomb-old"]);
  });

  it("after a split, leaves both families alone — the deleted rows stay active in them — and lists them", () => {
    const after = split(before, "CHIMIE");
    const result = run(after);
    expect(result.retirements).toEqual([]);
    expect(after.criteria.filter((c) => c.active && c.normKey !== null && /2001|2005/.test(c.normKey)).map((c) => c.productTypeId)).toEqual(["t-autres", "t-new"]);
    expect(result.summary.reprise.retired.leftActive).toEqual([
      { id: "t-autres", name: "AUTRES", rows: 1, origin: "main" },
      { id: "t-new", name: "AUTRES — physico-chimie", rows: 1, origin: "scission" },
    ]);
  });

  it("the reprise run before the split leaves nothing behind: the split copies only rows in service", () => {
    const retiredFirst = applyPlan(before, run(before));
    const after = split(retiredFirst, "CHIMIE");
    const result = run(after);
    expect(after.criteria.filter((c) => c.productTypeId === "t-new").map((c) => c.normKey ?? "")).toEqual(["NM 08.0.200|2019", ""]);
    expect(result.retirements).toEqual([]);
    expect(result.summary.reprise.retired.leftActive).toEqual([]);
  });
});
