import { describe, expect, it } from "vitest";
import type { Family, LineKind } from "@/generated/prisma/enums";
import {
  DEFAULT_THRESHOLDS,
  EXPLOITABLE_MESSAGES,
  RECEPTION_RULES,
  checklistRowLabel,
  checklistSummary,
  evaluateReception,
  parameterSpellings,
  proposedConformity,
  receptionChecklist,
  requestsHistamine,
  requestsSalmonella,
  requiredKinds,
  worstLevel,
  type ChecklistRow,
  type ReceptionLine,
} from "./reception-rules";

/**
 * The seven rules of the bon de réception PG05/EN04 (version G) as a
 * checklist — retour du 08/10, « les règles comme une checklist ». Invented
 * analyses only.
 */

const food = (over: Partial<ReceptionLine> = {}): ReceptionLine => ({
  lineKind: "ALIMENT",
  family: "MICRO",
  parameterNames: ["Coliformes totaux", "E. coli"],
  quantity: 250,
  quantityUnit: "G",
  receptionTemperature: 4,
  unitCount: 1,
  ...over,
});

const water = (over: Partial<ReceptionLine> = {}): ReceptionLine =>
  food({ lineKind: "EAU", parameterNames: ["Coliformes totaux"], quantity: 1.5, quantityUnit: "L", ...over });

const checklist = (line: ReceptionLine, exploitable: boolean | null = true, thresholds = DEFAULT_THRESHOLDS) =>
  receptionChecklist(line, thresholds, { exploitable });

const row = (rows: ChecklistRow[], n: number) => rows.find((r) => r.n === n)!;

describe("evaluateReception — food", () => {
  it("passes a 250 g microbiology line at 4 °C", () => {
    const checks = evaluateReception(food());
    expect(checks.map((c) => [c.rule, c.level])).toEqual([
      ["ALIMENT_MICRO_POIDS", "OK"],
      ["TEMPERATURE_ARRIVEE", "OK"],
    ]);
    expect(worstLevel(checks)).toBe("OK");
  });

  it("blocks under 100 g with the coded motif", () => {
    const rule = evaluateReception(food({ quantity: 80 })).find((c) => c.rule === "ALIMENT_MICRO_POIDS");
    expect(rule).toMatchObject({ level: "BLOQUANT", reason: "QUANTITE_INSUFFISANTE" });
    expect(rule?.message).toContain("80 g < 100 g");
  });

  it("warns, not blocks, when the quantity was never weighed (« 01 unité »)", () => {
    const rule = evaluateReception(food({ quantity: 1, quantityUnit: "UNITE" })).find((c) => c.rule === "ALIMENT_MICRO_POIDS");
    expect(rule?.level).toBe("AVERTISSEMENT");
    expect(rule?.message).toBe("Quantité déclarée en unités, non pesée — minimum 100 g.");
    expect(evaluateReception(food({ quantity: null, quantityUnit: null }))[0].message).toBe("Quantité non renseignée — minimum 100 g.");
    // The words agree with what is measured: a volume, a weight per unit.
    expect(evaluateReception(water({ quantity: 1, quantityUnit: "UNITE" }))[0].message).toBe(
      "Volume déclaré en unités, non pesé — minimum 1 L."
    );
    const perUnit = evaluateReception(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 9, quantity: null, quantityUnit: null }));
    expect(perUnit.find((c) => c.rule === "HISTAMINE_POIDS")?.message).toBe("Poids par unité non renseigné — minimum 100 g.");
  });

  it("requires the temperature at arrival and flags the cold chain beside it", () => {
    const missing = evaluateReception(food({ receptionTemperature: null }));
    expect(missing.find((c) => c.rule === "TEMPERATURE_ARRIVEE")).toMatchObject({
      level: "BLOQUANT",
      reason: "TEMPERATURE_MANQUANTE",
    });
    const warm = evaluateReception(food({ receptionTemperature: 12.5 }));
    expect(warm.map((c) => c.rule)).toEqual(["ALIMENT_MICRO_POIDS", "TEMPERATURE_ARRIVEE", "CHAINE_FROID"]);
    expect(warm[2]).toMatchObject({ level: "AVERTISSEMENT", reason: "CHAINE_FROID" });
    expect(warm[2].message).toContain("12,5 °C");
  });

  it("uses the chemistry minimum for a physico-chemistry line", () => {
    const checks = evaluateReception(food({ family: "CHIMIE", quantity: 200 }));
    expect(checks[0]).toMatchObject({ rule: "ALIMENT_CHIMIE_POIDS", level: "BLOQUANT" });
    expect(checks[0].message).toContain("300 g");
  });

  it("histamine follows the analysis, whatever the sample's family, beside rule (2) or (3)", () => {
    // Histamine is a physico-chemical assay: on the « P » sample it used to
    // vanish behind the 300 g rule (bug fixed on 08/10).
    const chimie = evaluateReception(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 9, quantity: 900 }));
    expect(chimie.map((c) => [c.rule, c.level])).toEqual([
      ["ALIMENT_CHIMIE_POIDS", "OK"],
      ["TEMPERATURE_ARRIVEE", "OK"],
      ["HISTAMINE_UNITES", "OK"],
      ["HISTAMINE_POIDS", "OK"],
    ]);
    const micro = evaluateReception(food({ parameterNames: ["Histamine"], unitCount: 9, quantity: 900 }));
    expect(micro.map((c) => c.rule)).toEqual(["ALIMENT_MICRO_POIDS", "TEMPERATURE_ARRIVEE", "HISTAMINE_UNITES", "HISTAMINE_POIDS"]);

    const short = evaluateReception(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 5, quantity: 500 }));
    expect(short.find((c) => c.rule === "HISTAMINE_UNITES")?.level).toBe("AVERTISSEMENT");
    expect(short.find((c) => c.rule === "HISTAMINE_POIDS")?.level).toBe("OK");

    // 9 × 50 g: 450 g meets the 300 g of rule (3), not the 100 g per unit of rule (7).
    const light = evaluateReception(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 9, quantity: 450 }));
    expect(light.find((c) => c.rule === "ALIMENT_CHIMIE_POIDS")?.level).toBe("OK");
    expect(light.find((c) => c.rule === "HISTAMINE_POIDS")?.level).toBe("BLOQUANT");
  });

  it("has no histamine rule on water", () => {
    expect(evaluateReception(water({ parameterNames: ["Histamine"] })).some((c) => c.rule.startsWith("HISTAMINE"))).toBe(false);
  });
});

describe("evaluateReception — water", () => {
  it("needs one litre for microbiology, six with Salmonella", () => {
    expect(evaluateReception(water())[0]).toMatchObject({ rule: "EAU_MICRO_VOLUME", level: "OK" });
    const salmonella = evaluateReception(water({ parameterNames: ["Recherche de Salmonella"] }));
    expect(salmonella[0]).toMatchObject({ rule: "EAU_SALMONELLA_VOLUME", level: "BLOQUANT" });
    expect(salmonella[0].message).toContain("6 L");
  });

  it("converts millilitres and applies the chemistry volume", () => {
    expect(evaluateReception(water({ quantity: 500, quantityUnit: "ML" }))[0].level).toBe("BLOQUANT");
    expect(evaluateReception(water({ family: "CHIMIE", quantity: 2, quantityUnit: "L" }))[0]).toMatchObject({
      rule: "EAU_CHIMIE_VOLUME",
      level: "OK",
    });
  });

  it("does not raise the cold-chain warning on water", () => {
    expect(evaluateReception(water({ receptionTemperature: 20 })).some((c) => c.rule === "CHAINE_FROID")).toBe(false);
  });
});

describe("evaluateReception — surfaces, hands, thresholds", () => {
  it("has no quantity or temperature rule for a surface or hands by default", () => {
    expect(evaluateReception(food({ lineKind: "SURFACE", quantity: null, quantityUnit: null, receptionTemperature: null }))).toEqual([]);
    expect(evaluateReception(food({ lineKind: "MAINS", quantity: null, quantityUnit: null, receptionTemperature: null }))).toEqual([]);
  });

  it("follows the configured thresholds and required kinds", () => {
    const thresholds = { ...DEFAULT_THRESHOLDS, minFoodMicroG: 50, temperatureRequiredKinds: "ALIMENT, SURFACE" };
    expect(requiredKinds(thresholds)).toEqual(["ALIMENT", "SURFACE"]);
    expect(evaluateReception(food({ quantity: 60 }), thresholds)[0].level).toBe("OK");
    expect(
      evaluateReception(food({ lineKind: "SURFACE", quantity: null, quantityUnit: null, receptionTemperature: null }), thresholds)
    ).toEqual([expect.objectContaining({ rule: "TEMPERATURE_ARRIVEE", level: "BLOQUANT" })]);
  });
});

describe("analyses recognised on their name and their aliases", () => {
  it("reads the aliases, one per line, after the name", () => {
    expect(parameterSpellings({ name: "Amine test", aliases: " Histamine (HPLC) \n\nHistamine libre " })).toEqual([
      "Amine test",
      "Histamine (HPLC)",
      "Histamine libre",
    ]);
    expect(parameterSpellings({ name: "Germe test" })).toEqual(["Germe test"]);
    expect(parameterSpellings({ name: "Germe test", aliases: null })).toEqual(["Germe test"]);
  });

  it("finds histamine and Salmonella under an alias", () => {
    const amine = parameterSpellings({ name: "Amine biogène test", aliases: "Histamine HPLC" });
    const pathogen = parameterSpellings({ name: "Pathogène test", aliases: "Salmonella spp" });
    expect(requestsHistamine(amine)).toBe(true);
    expect(requestsSalmonella(pathogen)).toBe(true);
    expect(requestsHistamine(["Amine biogène test"])).toBe(false);

    expect(evaluateReception(food({ family: "CHIMIE", parameterNames: amine, unitCount: 9, quantity: 900 })).map((c) => c.rule)).toContain(
      "HISTAMINE_UNITES"
    );
    expect(evaluateReception(water({ parameterNames: pathogen }))[0].rule).toBe("EAU_SALMONELLA_VOLUME");
  });
});

describe("receptionChecklist — always the seven rules of the paper", () => {
  const KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];
  const FAMILIES: Family[] = ["MICRO", "CHIMIE"];

  it("lists the seven rules in the paper's order and wording, whatever the sample", () => {
    for (const lineKind of KINDS) {
      for (const family of FAMILIES) {
        const rows = checklist(food({ lineKind, family }), null);
        expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        expect(rows.map((r) => r.key)).toEqual(RECEPTION_RULES.map((rule) => rule.key));
        expect(rows.map((r) => r.text)).toEqual(RECEPTION_RULES.map((rule) => rule.text(DEFAULT_THRESHOLDS)));
      }
    }
  });

  it("takes its figures from the thresholds", () => {
    const rows = checklist(food(), true, { ...DEFAULT_THRESHOLDS, minFoodMicroG: 50 });
    expect(row(rows, 2).text).toBe("poids minimal est de 50 g pour les aliments (analyses microbiologiques)");
    expect(checklistRowLabel(row(rows, 1))).toBe(
      "(1) Critères : ne pas accepter des échantillons non exploitables lors de l'analyse (exemple : tête de poisson, os, etc.)"
    );
  });

  it("food in microbiology: rules (2) and (6) apply, the others are « sans objet » with a reason", () => {
    const rows = receptionChecklist(food(), DEFAULT_THRESHOLDS, { exploitable: true, fromCooler: true });
    expect(rows.map((r) => [r.n, r.status, r.detail])).toEqual([
      [1, "CONFORME", "Déclaré exploitable"],
      [2, "CONFORME", "Quantité 250 g ≥ 100 g"],
      [3, "SANS_OBJET", "Sans objet : microbiologie"],
      [4, "SANS_OBJET", "Sans objet : aliment"],
      [5, "SANS_OBJET", "Sans objet : aliment"],
      [6, "CONFORME", "4 °C (glacière)"],
      [7, "SANS_OBJET", "Histamine non demandée"],
    ]);
    expect(row(rows, 2).rules).toEqual(["ALIMENT_MICRO_POIDS"]);
    expect(checklistSummary(rows)).toBe("3 conformes · 4 sans objet");
  });

  it("names the kind of a sample the rules do not concern", () => {
    const rows = checklist(food({ lineKind: "SURFACE", quantity: null, quantityUnit: null, receptionTemperature: null }), null);
    expect(rows.map((r) => r.status)).toEqual([
      "A_CONFIRMER",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
    ]);
    expect(rows.slice(1).every((r) => r.detail === "Sans objet : surface")).toBe(true);
    expect(checklistSummary(rows)).toBe("1 à confirmer · 6 sans objet");
    expect(row(checklist(food({ lineKind: "MAINS" })), 6).detail).toBe("Sans objet : mains");
    expect(row(checklist(water({ family: "CHIMIE" })), 4).detail).toBe("Sans objet : physico-chimie");
  });

  it("applies rule (6) to the kinds the settings require", () => {
    const thresholds = { ...DEFAULT_THRESHOLDS, temperatureRequiredKinds: "ALIMENT,EAU,SURFACE" };
    expect(row(checklist(food({ lineKind: "SURFACE", receptionTemperature: null }), true, thresholds), 6)).toMatchObject({
      status: "NON_CONFORME",
      reason: "TEMPERATURE_MANQUANTE",
    });
  });

  it("says where the temperature comes from", () => {
    expect(row(receptionChecklist(food(), DEFAULT_THRESHOLDS, { exploitable: true, fromCooler: false }), 6).detail).toBe(
      "4 °C (mesurée sur l'échantillon)"
    );
    expect(row(checklist(food()), 6).detail).toBe("4 °C");
  });

  it("shows the cold chain as a complementary check under rule (6), never a refusal", () => {
    const rows = receptionChecklist(food({ receptionTemperature: 12.5 }), DEFAULT_THRESHOLDS, { exploitable: true, fromCooler: true });
    expect(row(rows, 6)).toMatchObject({ status: "A_VERIFIER", reason: "CHAINE_FROID", rules: ["TEMPERATURE_ARRIVEE", "CHAINE_FROID"] });
    expect(row(rows, 6).detail).toBe(
      "12,5 °C (glacière) · contrôle complémentaire (hors bon) : > 8 °C — vérifier la chaîne du froid (produit servi chaud ?)"
    );
    // Rule (6) not required for food in the settings: the note keeps the value.
    const optional = receptionChecklist(food({ receptionTemperature: 12.5 }), { ...DEFAULT_THRESHOLDS, temperatureRequiredKinds: "EAU" }, { exploitable: true });
    expect(row(optional, 6)).toMatchObject({
      status: "A_VERIFIER",
      detail: "Contrôle complémentaire (hors bon) : 12,5 °C à l'arrivée > 8 °C — vérifier la chaîne du froid (produit servi chaud ?)",
      rules: ["CHAINE_FROID"],
    });
    expect(proposedConformity(rows)).toEqual({ conformity: true, reason: "CHAINE_FROID", forced: false, rule: null, pending: false });
  });

  it("histamine on a physico-chemistry sample: rule (7) beside rule (3)", () => {
    const rows = checklist(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 9, quantity: 900 }));
    expect(row(rows, 2)).toMatchObject({ status: "SANS_OBJET", detail: "Sans objet : physico-chimie" });
    expect(row(rows, 3)).toMatchObject({ status: "CONFORME", rules: ["ALIMENT_CHIMIE_POIDS"] });
    expect(row(rows, 7)).toMatchObject({
      status: "CONFORME",
      detail: "Histamine : 9 unités (9 attendues) · poids par unité 100 g ≥ 100 g",
      rules: ["HISTAMINE_UNITES", "HISTAMINE_POIDS"],
    });

    const light = checklist(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 9, quantity: 450 }));
    expect(row(light, 3).status).toBe("CONFORME");
    expect(row(light, 7)).toMatchObject({ status: "NON_CONFORME", reason: "QUANTITE_INSUFFISANTE" });
    expect(proposedConformity(light)).toMatchObject({ forced: true, rule: 7, reason: "QUANTITE_INSUFFISANTE" });

    const few = checklist(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 5, quantity: 500 }));
    expect(row(few, 7)).toMatchObject({ status: "A_VERIFIER", reason: "QUANTITE_INSUFFISANTE" });
  });

  it("histamine and Salmonella not fixed yet: checked at the programme, said on the row", () => {
    const pendingFood = checklist(food({ parameterNames: [] }));
    expect(row(pendingFood, 7)).toMatchObject({
      status: "SANS_OBJET",
      detail: "Si l'histamine est demandée : 9 × 100 g — vérifié au programme",
    });
    const pendingWater = checklist(water({ parameterNames: [] }));
    expect(row(pendingWater, 4)).toMatchObject({
      status: "CONFORME",
      detail: "Volume 1,5 L ≥ 1 L · 6 L si Salmonella — vérifié au programme",
      rules: ["EAU_MICRO_VOLUME"],
    });
    // Analyses fixed without Salmonella: no note; with it (here under an alias), 6 L.
    expect(row(checklist(water()), 4).detail).toBe("Volume 1,5 L ≥ 1 L");
    const salmonella = checklist(water({ parameterNames: parameterSpellings({ name: "Pathogène test", aliases: "Salmonella spp" }) }));
    expect(row(salmonella, 4)).toMatchObject({ status: "NON_CONFORME", rules: ["EAU_SALMONELLA_VOLUME"] });
  });

  it("an unweighed quantity is « à vérifier », the motif ready", () => {
    const rows = checklist(food({ quantity: 1, quantityUnit: "UNITE" }));
    expect(row(rows, 2)).toMatchObject({ status: "A_VERIFIER", reason: "QUANTITE_INSUFFISANTE" });
    expect(proposedConformity(rows)).toEqual({
      conformity: true,
      reason: "QUANTITE_INSUFFISANTE",
      forced: false,
      rule: null,
      pending: false,
    });
  });
});

describe("rule (1) and the proposal", () => {
  it("waits for the answer: « à confirmer », nothing can be sent", () => {
    const rows = checklist(food(), null);
    expect(row(rows, 1)).toMatchObject({ status: "A_CONFIRMER", rules: [] });
    expect(proposedConformity(rows)).toEqual({ conformity: true, reason: null, forced: false, rule: null, pending: true });
  });

  it("« non exploitable » forces « non conforme » with its own motif — first in the paper's order", () => {
    // The temperature is missing too: rule (1) comes first.
    const rows = checklist(food({ receptionTemperature: null }), false);
    expect(row(rows, 1)).toMatchObject({ status: "NON_CONFORME", reason: "NON_EXPLOITABLE", detail: "Déclaré non exploitable" });
    expect(proposedConformity(rows)).toEqual({ conformity: false, reason: "NON_EXPLOITABLE", forced: true, rule: 1, pending: false });
  });

  it("a measured rule forces « non conforme » with its motif once rule (1) is met", () => {
    const rows = checklist(food({ receptionTemperature: null }), true);
    expect(proposedConformity(rows)).toEqual({
      conformity: false,
      reason: "TEMPERATURE_MANQUANTE",
      forced: true,
      rule: 6,
      pending: false,
    });
    expect(proposedConformity(checklist(food(), true))).toEqual({ conformity: true, reason: null, forced: false, rule: null, pending: false });
  });

  it("words its refusals once", () => {
    expect(EXPLOITABLE_MESSAGES.missing).toBe("Indiquez s'il est exploitable (règle 1). Si les boutons « Exploitable » / « Non exploitable » n'apparaissent pas, rechargez la page.");
  });
});

describe("checklistSummary", () => {
  it("counts each status in French, singular and plural, conformes first", () => {
    const rows = (statuses: ChecklistRow["status"][]) => statuses.map((status) => ({ status }));
    expect(checklistSummary(rows(["A_CONFIRMER", "CONFORME", "CONFORME", "SANS_OBJET", "CONFORME", "CONFORME", "SANS_OBJET"]))).toBe(
      "4 conformes · 1 à confirmer · 2 sans objet"
    );
    expect(checklistSummary(rows(["NON_CONFORME", "A_VERIFIER", "A_VERIFIER", "CONFORME"]))).toBe(
      "1 conforme · 1 non conforme · 2 à vérifier"
    );
    expect(checklistSummary([])).toBe("");
  });
});
