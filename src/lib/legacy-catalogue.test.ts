import { describe, expect, it } from "vitest";
import { derivePlan, parseLegacyCriteria, parseLegacyRegulations, parseLegacyTypes, regulationTitle, usableNorm } from "./legacy-catalogue";

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

  it("falls back to VALEUR_PM × 10^EXPM when no interval line exists", () => {
    expect(derivePlan(row({ type_pm: "3", type_resultat: "11", obsolete: "0", valeur_pm: "1.5000", exp_pm: "2" })).plan).toMatchObject({ mKind: "VALUE", m: 150, bigM: null });
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
    expect(types.items.map((t) => [t.name, t.active, t.regulationLegacyId])).toEqual([
      ["SALADES AVEC SOURCE PROTEIQUE", true, 1796],
      ["ANCIEN TYPE", false, null],
      ["TYPE OBSOLÈTE", false, null],
    ]);
  });

  it("names a missing column", () => {
    expect(parseLegacyTypes([["id", "nom"]]).error).toContain("Colonnes manquantes");
  });

  it("cuts a title from a regulation text", () => {
    expect(regulationTitle("Arrêté conjoint du ministre de l'agriculture N° 624-04 du 08/04/2004 (Bulletin officiel N° 5214).", "x")).toBe("Arrêté conjoint du ministre de l'agriculture N° 624-04 du 08/04/2004");
    expect(regulationTitle("FCD 2010", "x")).toBe("FCD 2010");
  });
});
