import { describe, expect, it } from "vitest";
import type { Family, LineKind } from "@/generated/prisma/enums";
import {
  BIVALVE_MOLLUSC_WORDS,
  DEFAULT_THRESHOLDS,
  EXPLOITABLE_MESSAGES,
  RECEPTION_RULES,
  checklistRowLabel,
  checklistSummary,
  evaluateReception,
  isStableFood,
  justifyAcceptanceMessage,
  mentionsBivalveMolluscs,
  parameterSpellings,
  proposedConformity,
  receptionChecklist,
  receptionRuleLine,
  rowToJustify,
  requestsHistamine,
  requestsSalmonella,
  requiredKinds,
  worstLevel,
  type ChecklistRow,
  type ReceptionLine,
} from "./reception-rules";

/**
 * The eight rules of the bon de réception PG05/EN04 (version H, the
 * laboratory's answers of 12/10) as a checklist — retour du 08/10, « les
 * règles comme une checklist ». Invented analyses and products only.
 */

const food = (over: Partial<ReceptionLine> = {}): ReceptionLine => ({
  lineKind: "ALIMENT",
  family: "MICRO",
  parameterNames: ["Coliformes totaux", "E. coli"],
  quantity: 250,
  quantityUnit: "G",
  receptionTemperature: 4,
  unitCount: 1,
  storageClass: null,
  productNames: ["Salade composée", "Plat cuisiné", "Microbiologie des aliments"],
  ...over,
});

/** A food the bivalve molluscs' rule (8) concerns. */
const oysters = (over: Partial<ReceptionLine> = {}): ReceptionLine =>
  food({ productNames: ["Huîtres creuses", null, "Microbiologie des aliments"], quantity: 120, ...over });

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

  it("requires the temperature at arrival; the cold chain is C2's, not rule (6)'s", () => {
    const missing = evaluateReception(food({ receptionTemperature: null }));
    expect(missing.find((c) => c.rule === "TEMPERATURE_ARRIVEE")).toMatchObject({
      level: "BLOQUANT",
      reason: "TEMPERATURE_MANQUANTE",
    });
    // A warm food line passes rule (6): C2 judges the range (reception-complementary.ts).
    const warm = evaluateReception(food({ receptionTemperature: 12.5 }));
    expect(warm.map((c) => [c.rule, c.level])).toEqual([
      ["ALIMENT_MICRO_POIDS", "OK"],
      ["TEMPERATURE_ARRIVEE", "OK"],
    ]);
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

    // Fewer units than 9 is the client's choice, not a non-conformity
    // (laboratory, 13/10 — Q62): analysed, reported without interpretation.
    const short = evaluateReception(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 5, quantity: 500 }));
    expect(short.find((c) => c.rule === "HISTAMINE_UNITES")).toEqual({
      rule: "HISTAMINE_UNITES",
      level: "OK",
      message: "Histamine : 5 unités sur 9 — analysées telles que demandé, résultats sans interprétation sur le rapport.",
    });
    expect(short.find((c) => c.rule === "HISTAMINE_POIDS")?.level).toBe("OK");
    const single = evaluateReception(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 1, quantity: 300 }));
    expect(single.find((c) => c.rule === "HISTAMINE_UNITES")?.message).toBe(
      "Histamine : 1 unité sur 9 — analysée telle que demandé, résultats sans interprétation sur le rapport."
    );
    expect(single.every((c) => c.rule !== "HISTAMINE_UNITES" || c.level === "OK")).toBe(true);

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

  it("never raises the cold chain itself, whatever the kind", () => {
    for (const line of [water({ receptionTemperature: 20 }), food({ receptionTemperature: 40 })]) {
      expect(evaluateReception(line).some((c) => c.rule === "CHAINE_FROID")).toBe(false);
    }
  });
});

describe("evaluateReception — surfaces, hands, thresholds", () => {
  it("has no quantity rule for a surface, air or hands; by default the temperature is required for surface and air (12/10), never for hands", () => {
    expect(evaluateReception(food({ lineKind: "MAINS", quantity: null, quantityUnit: null, receptionTemperature: null }))).toEqual([]);
    for (const lineKind of ["SURFACE", "AIR"] as const) {
      expect(evaluateReception(food({ lineKind, quantity: null, quantityUnit: null, receptionTemperature: null }))).toEqual([
        expect.objectContaining({ rule: "TEMPERATURE_ARRIVEE", level: "BLOQUANT", reason: "TEMPERATURE_MANQUANTE" }),
      ]);
      expect(evaluateReception(food({ lineKind, quantity: null, quantityUnit: null, receptionTemperature: 5 }))).toEqual([
        expect.objectContaining({ rule: "TEMPERATURE_ARRIVEE", level: "OK" }),
      ]);
    }
  });

  it("requires the temperature of food, water, air and surface by default (the laboratory's answer of 12/10)", () => {
    expect(requiredKinds(DEFAULT_THRESHOLDS)).toEqual(["ALIMENT", "EAU", "AIR", "SURFACE"]);
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

describe("receptionChecklist — always the eight rules of the paper", () => {
  const KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];
  const FAMILIES: Family[] = ["MICRO", "CHIMIE"];

  it("lists the eight rules in the paper's order and wording, whatever the sample", () => {
    for (const lineKind of KINDS) {
      for (const family of FAMILIES) {
        const rows = checklist(food({ lineKind, family }), null);
        expect(rows.map((r) => r.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
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
    const rows = receptionChecklist(food(), DEFAULT_THRESHOLDS, { exploitable: true, temperatureSource: "GLACIERE" });
    expect(rows.map((r) => [r.n, r.status, r.detail])).toEqual([
      [1, "CONFORME", "Déclaré exploitable"],
      [2, "CONFORME", "Quantité 250 g ≥ 100 g"],
      [3, "SANS_OBJET", "Sans objet : microbiologie"],
      [4, "SANS_OBJET", "Sans objet : aliment"],
      [5, "SANS_OBJET", "Sans objet : aliment"],
      [6, "CONFORME", "4 °C (glacière)"],
      [7, "SANS_OBJET", "Histamine non demandée"],
      [8, "SANS_OBJET", "Sans objet : pas de mollusques bivalves dans la désignation, le type ou la nature"],
    ]);
    expect(row(rows, 2).rules).toEqual(["ALIMENT_MICRO_POIDS"]);
    expect(checklistSummary(rows)).toBe("3 conformes · 5 sans objet");
  });

  it("names the kind of a sample the rules do not concern", () => {
    const rows = checklist(food({ lineKind: "MAINS", quantity: null, quantityUnit: null, receptionTemperature: null }), null);
    expect(rows.map((r) => r.status)).toEqual([
      "A_CONFIRMER",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
      "SANS_OBJET",
    ]);
    expect(rows.slice(1).every((r) => r.detail === "Sans objet : mains")).toBe(true);
    expect(checklistSummary(rows)).toBe("1 à confirmer · 7 sans objet");
    expect(row(checklist(food({ lineKind: "SURFACE" })), 2).detail).toBe("Sans objet : surface");
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
    const from = (temperatureSource: "GLACIERE" | "ECHANTILLON" | "FLACON_TEMOIN") =>
      row(receptionChecklist(food(), DEFAULT_THRESHOLDS, { exploitable: true, temperatureSource }), 6).detail;
    expect(from("ECHANTILLON")).toBe("4 °C (mesurée sur l'échantillon)");
    expect(from("GLACIERE")).toBe("4 °C (glacière)");
    expect(from("FLACON_TEMOIN")).toBe("4 °C (flacon témoin)");
    // Unknown (an older page): the value alone.
    expect(row(checklist(food()), 6).detail).toBe("4 °C");
  });

  it("leaves the cold chain to C2: a warm sample meets rule (6)", () => {
    const rows = receptionChecklist(food({ receptionTemperature: 12.5 }), DEFAULT_THRESHOLDS, { exploitable: true, temperatureSource: "GLACIERE" });
    expect(row(rows, 6)).toMatchObject({ status: "CONFORME", detail: "12,5 °C (glacière)", rules: ["TEMPERATURE_ARRIVEE"] });
    // Rule (6) not required for food in the settings: « sans objet ».
    const optional = receptionChecklist(food({ receptionTemperature: 12.5 }), { ...DEFAULT_THRESHOLDS, temperatureRequiredKinds: "EAU" }, { exploitable: true });
    expect(row(optional, 6)).toMatchObject({ status: "SANS_OBJET", rules: [] });
    expect(proposedConformity(rows)).toEqual({ conformity: true, reason: null, forced: false, rule: null, code: null, pending: false });
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

    // 5 units out of 9: conforme — nothing to justify at reception (Q62, 13/10).
    const few = checklist(food({ family: "CHIMIE", parameterNames: ["Histamine"], unitCount: 5, quantity: 500 }));
    expect(row(few, 7)).toMatchObject({ status: "CONFORME" });
    expect(row(few, 7).detail).toContain("résultats sans interprétation sur le rapport");
    expect(proposedConformity(few)).toMatchObject({ conformity: true, forced: false, pending: false });
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
      code: null,
      pending: false,
    });
  });
});

describe("rule (1) and the proposal", () => {
  it("waits for the answer: « à confirmer », nothing can be sent", () => {
    const rows = checklist(food(), null);
    expect(row(rows, 1)).toMatchObject({ status: "A_CONFIRMER", rules: [] });
    expect(proposedConformity(rows)).toEqual({ conformity: true, reason: null, forced: false, rule: null, code: null, pending: true });
  });

  it("« non exploitable » forces « non conforme » with its own motif — first in the paper's order", () => {
    // The temperature is missing too: rule (1) comes first.
    const rows = checklist(food({ receptionTemperature: null }), false);
    expect(row(rows, 1)).toMatchObject({ status: "NON_CONFORME", reason: "NON_EXPLOITABLE", detail: "Déclaré non exploitable" });
    expect(proposedConformity(rows)).toEqual({ conformity: false, reason: "NON_EXPLOITABLE", forced: true, rule: 1, code: null, pending: false });
  });

  it("a measured rule forces « non conforme » with its motif once rule (1) is met", () => {
    const rows = checklist(food({ receptionTemperature: null }), true);
    expect(proposedConformity(rows)).toEqual({
      conformity: false,
      reason: "TEMPERATURE_MANQUANTE",
      forced: true,
      rule: 6,
      code: null,
      pending: false,
    });
    expect(proposedConformity(checklist(food(), true))).toEqual({ conformity: true, reason: null, forced: false, rule: null, code: null, pending: false });
  });

  it("a contrôle complémentaire forces « non conforme » after the paper's rules, by its code", () => {
    const control: ChecklistRow = {
      n: 3,
      key: "EMBALLAGE",
      code: "C3",
      text: "emballage / contenant intact, fermé et adapté",
      status: "NON_CONFORME",
      reason: "EMBALLAGE",
      rules: ["EMBALLAGE"],
    };
    expect(proposedConformity([...checklist(food(), true), control])).toEqual({
      conformity: false,
      reason: "EMBALLAGE",
      forced: true,
      rule: null,
      code: "C3",
      pending: false,
    });
    // A paper rule listed first keeps the priority.
    expect(proposedConformity([...checklist(food({ receptionTemperature: null }), true), control])).toMatchObject({
      rule: 6,
      code: null,
      reason: "TEMPERATURE_MANQUANTE",
    });
    // The label names a coded row by its code, a paper row by its number.
    expect(checklistRowLabel(control)).toBe("C3 Emballage / contenant intact, fermé et adapté");
    expect(checklistRowLabel({ n: 6, text: "la température doit être précisée" })).toBe("(6) La température doit être précisée");
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

describe("rowToJustify / justifyAcceptanceMessage — an accepted doubt is justified (A7)", () => {
  const rows = [
    { n: 2, text: "poids minimal", status: "CONFORME" as const },
    { n: 2, code: "C2", text: "température de transport", status: "A_VERIFIER" as const },
    { n: 7, code: "C7", text: "DLC", status: "A_VERIFIER" as const },
  ];

  it("returns the first « à vérifier » row of a conform sample without observation", () => {
    expect(rowToJustify(rows, true, "")).toBe(rows[1]);
    expect(rowToJustify(rows, true, "   ")).toBe(rows[1]);
    expect(rowToJustify(rows, true, null)).toBe(rows[1]);
    expect(justifyAcceptanceMessage(rows[1])).toBe("Justifiez l'acceptation (C2 Température de transport à vérifier).");
    expect(justifyAcceptanceMessage(rows[0])).toBe("Justifiez l'acceptation (règle 2 à vérifier).");
  });

  it("asks nothing once written, of a non-conform sample, or without doubt", () => {
    expect(rowToJustify(rows, true, "Vu avec le responsable")).toBeNull();
    expect(rowToJustify(rows, false, "")).toBeNull();
    expect(rowToJustify([rows[0]], true, "")).toBeNull();
  });
});

describe("rule (6) — the temperature, stable foods excepted (12/10)", () => {
  it("a food received « Ambiant » is a stable food: no temperature required, « sans objet » with the reason", () => {
    const stable = food({ storageClass: "AMBIANT", receptionTemperature: null });
    expect(isStableFood(stable)).toBe(true);
    expect(evaluateReception(stable).some((c) => c.rule === "TEMPERATURE_ARRIVEE")).toBe(false);
    const rows = checklist(stable);
    expect(row(rows, 6)).toMatchObject({
      status: "SANS_OBJET",
      detail: "Sans objet : aliment stable (conservé à température ambiante)",
      rules: [],
    });
    expect(proposedConformity(rows)).toMatchObject({ conformity: true, forced: false });
    // A temperature typed anyway is said, never judged.
    expect(row(checklist(food({ storageClass: "AMBIANT", receptionTemperature: 21 })), 6).detail).toBe(
      "Sans objet : aliment stable (conservé à température ambiante) · 21 °C relevée"
    );
  });

  it("a food left on its default class, or chilled, frozen or hot, still needs its temperature", () => {
    for (const storageClass of [null, "REFRIGERE", "CONGELE", "CHAUD"] as const) {
      const line = food({ storageClass, receptionTemperature: null });
      expect(isStableFood(line)).toBe(false);
      expect(row(checklist(line), 6)).toMatchObject({ status: "NON_CONFORME", reason: "TEMPERATURE_MANQUANTE" });
    }
  });

  it("« Ambiant » stabilises a food only: water, air and surfaces still need their temperature", () => {
    for (const lineKind of ["EAU", "AIR", "SURFACE"] as const) {
      const line = food({ lineKind, storageClass: "AMBIANT", receptionTemperature: null, quantity: null, quantityUnit: null });
      expect(isStableFood(line)).toBe(false);
      expect(row(checklist(line), 6)).toMatchObject({ status: "NON_CONFORME", reason: "TEMPERATURE_MANQUANTE" });
    }
  });
});

describe("rule (8) — live bivalve molluscs (note (8) of the bon version H, 12/10)", () => {
  it("replaces the 100 g of rule (2) for the microbiology of live bivalves (a 60 g sample is not refused)", () => {
    const checks = evaluateReception(oysters({ quantity: 60 }));
    expect(checks.find((c) => c.rule === "ALIMENT_MICRO_POIDS")).toBeUndefined();
    expect(checks.find((c) => c.rule === "MOLLUSQUES_POIDS")?.level).toBe("OK");
    const rows = checklist(oysters({ quantity: 60 }));
    expect(row(rows, 2)).toMatchObject({ status: "SANS_OBJET" });
    expect(row(rows, 2).detail).toMatch(/note \(8\)/);
    expect(row(rows, 8).status).toBe("CONFORME");
    // Physico-chemistry keeps its 300 g (the note does not say otherwise).
    expect(evaluateReception(oysters({ family: "CHIMIE", quantity: 60 })).find((c) => c.rule === "ALIMENT_CHIMIE_POIDS")?.level).toBe("BLOQUANT");
  });

  it("prints the laboratory's wording, figures from the thresholds", () => {
    const rule = RECEPTION_RULES.find((r) => r.key === "MOLLUSQUES")!;
    expect(rule.n).toBe(8);
    expect(receptionRuleLine(rule, DEFAULT_THRESHOLDS)).toBe(
      "(8) pour le cas des mollusques bivalves vivants, un échantillon représentatif doit contenir au moins 10 individus et peser au moins 50 g (25 g pour les animaux de petite taille)"
    );
    expect(
      rule.text({ ...DEFAULT_THRESHOLDS, molluscMinIndividuals: 12, molluscMinG: 60, molluscSmallMinG: 30 })
    ).toContain("au moins 12 individus et peser au moins 60 g (30 g pour les animaux de petite taille)");
  });

  it("recognises the molluscs on the désignation, the product type or the nature — accents, case and plural ignored", () => {
    for (const name of [
      "Huîtres creuses",
      "HUITRE",
      "Moules de bouchot",
      "Palourdes",
      "coques",
      "Praires",
      "Clams",
      "Pétoncles",
      "Coquilles Saint-Jacques",
      "Mollusques bivalves vivants",
      "Bivalves",
    ]) {
      expect(mentionsBivalveMolluscs([name]), name).toBe(true);
    }
    // Any of the three names will do.
    expect(mentionsBivalveMolluscs([null, "Mollusques bivalves", undefined])).toBe(true);
    expect(mentionsBivalveMolluscs(["Plat test", null, "Produits de la mer — huîtres"])).toBe(true);
    // One list, in one place.
    expect(BIVALVE_MOLLUSC_WORDS).toContain("palourde");
  });

  it("does not take an egg, a pasta, a squid or a word containing a keyword for a bivalve", () => {
    for (const name of [
      "Œuf à la coque",
      "Oeufs coque",
      "Coquillettes au beurre",
      "Moulage chocolat",
      "Calmar frit",
      "Mollusques céphalopodes",
      "Mollusque gastéropode (escargot)",
      "Salade composée",
      // « moulé » is no « moule »: read before the accents are folded.
      "Camembert moulé à la louche",
      "CHOCOLAT MOULÉ",
      "Pâtes moulées",
      "",
    ]) {
      expect(mentionsBivalveMolluscs([name]), name).toBe(false);
    }
    // A participle beside a bivalve word leaves the bivalve recognised.
    expect(mentionsBivalveMolluscs(["Moules fumées"])).toBe(true);
    expect(mentionsBivalveMolluscs(["Pétoncles décortiqués"])).toBe(true);
    expect(mentionsBivalveMolluscs([null, undefined])).toBe(false);
    expect(mentionsBivalveMolluscs([])).toBe(false);
  });

  it("under the small animals' minimum: non conforme, quantity motif, forced", () => {
    // Rule (2) lowered for the case: rule (8) alone refuses.
    const rows = checklist(oysters({ quantity: 20 }), true, { ...DEFAULT_THRESHOLDS, minFoodMicroG: 10 });
    expect(row(rows, 8)).toMatchObject({
      status: "NON_CONFORME",
      reason: "QUANTITE_INSUFFISANTE",
      rules: ["MOLLUSQUES_POIDS"],
      detail: "Poids 20 g < 25 g requis, même pour des animaux de petite taille · au moins 10 individus : à vérifier",
    });
    expect(proposedConformity(rows)).toMatchObject({ conformity: false, forced: true, rule: 8, reason: "QUANTITE_INSUFFISANTE" });
    expect(evaluateReception(oysters({ quantity: 20 })).find((c) => c.rule === "MOLLUSQUES_POIDS")?.level).toBe("BLOQUANT");
  });

  it("between the two minimums: « à vérifier » — 50 g, 25 g for small animals; the acceptance is justified (A7)", () => {
    // Rule (2) is met by a 100 g threshold lowered for the case; rule (8) alone doubts.
    const thresholds = { ...DEFAULT_THRESHOLDS, minFoodMicroG: 25 };
    const rows = checklist(oysters({ quantity: 40 }), true, thresholds);
    expect(row(rows, 8)).toMatchObject({
      status: "A_VERIFIER",
      reason: "QUANTITE_INSUFFISANTE",
      detail: "Poids 40 g : au moins 50 g, 25 g pour les animaux de petite taille · au moins 10 individus : à vérifier",
    });
    expect(proposedConformity(rows)).toMatchObject({ conformity: true, forced: false, reason: "QUANTITE_INSUFFISANTE" });
    expect(rowToJustify(rows, true, "")).toMatchObject({ n: 8 });
    expect(justifyAcceptanceMessage(row(rows, 8))).toBe("Justifiez l'acceptation (règle 8 à vérifier).");
    // The boundaries: 25 g is « à vérifier », 50 g conforme.
    expect(row(checklist(oysters({ quantity: 25 }), true, thresholds), 8).status).toBe("A_VERIFIER");
    expect(row(checklist(oysters({ quantity: 50 }), true, thresholds), 8).status).toBe("CONFORME");
  });

  it("from the minimum on: conforme — the individuals stay « à vérifier » in the detail, never counted", () => {
    const rows = checklist(oysters({ quantity: 120, unitCount: 1 }));
    expect(row(rows, 8)).toMatchObject({
      status: "CONFORME",
      detail: "Poids 120 g ≥ 50 g · au moins 10 individus : à vérifier",
      rules: ["MOLLUSQUES_POIDS"],
    });
    expect(row(rows, 8).reason).toBeUndefined();
    // A litre counts as a kilogram, like every weight rule.
    expect(row(checklist(oysters({ quantity: 0.5, quantityUnit: "L" })), 8).status).toBe("CONFORME");
  });

  it("a weight not given or declared in units is « à vérifier »", () => {
    expect(row(checklist(oysters({ quantity: null, quantityUnit: null })), 8)).toMatchObject({
      status: "A_VERIFIER",
      detail: "Poids non renseigné — au moins 50 g, 25 g pour les animaux de petite taille · au moins 10 individus : à vérifier",
    });
    expect(row(checklist(oysters({ quantity: 24, quantityUnit: "UNITE" })), 8).detail).toMatch(/^Poids déclaré en unités, non pesé/);
  });

  it("follows the thresholds set in /admin/reglages", () => {
    const thresholds = { ...DEFAULT_THRESHOLDS, molluscMinG: 80, molluscSmallMinG: 40, molluscMinIndividuals: 12 };
    expect(row(checklist(oysters({ quantity: 60 }), true, thresholds), 8)).toMatchObject({
      status: "A_VERIFIER",
      detail: "Poids 60 g : au moins 80 g, 40 g pour les animaux de petite taille · au moins 12 individus : à vérifier",
    });
    expect(row(checklist(oysters({ quantity: 39 }), true, thresholds), 8).status).toBe("NON_CONFORME");
  });

  it("applies on either family, beside rule (2) or (3), and never off a food", () => {
    const chemistry = checklist(oysters({ family: "CHIMIE", quantity: 350 }));
    expect(row(chemistry, 3).status).toBe("CONFORME");
    expect(row(chemistry, 8).status).toBe("CONFORME");
    for (const lineKind of ["EAU", "SURFACE", "MAINS", "AIR", "AUTRE"] as const) {
      const rows = checklist(oysters({ lineKind }));
      expect(row(rows, 8)).toMatchObject({ status: "SANS_OBJET" });
      expect(row(rows, 8).detail).toMatch(/^Sans objet : /);
      expect(row(rows, 8).detail).not.toContain("mollusques");
    }
  });
});
