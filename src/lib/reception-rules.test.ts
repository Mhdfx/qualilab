import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  evaluateReception,
  proposedConformity,
  requiredKinds,
  worstLevel,
  type ReceptionLine,
} from "./reception-rules";

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

describe("evaluateReception — food, microbiology", () => {
  it("passes a 250 g line at 4 °C", () => {
    const checks = evaluateReception(food());
    expect(checks.map((c) => [c.rule, c.level])).toEqual([
      ["ALIMENT_MICRO_POIDS", "OK"],
      ["TEMPERATURE_ARRIVEE", "OK"],
    ]);
    expect(worstLevel(checks)).toBe("OK");
    expect(proposedConformity(checks)).toEqual({ conformity: true, reason: null, forced: false });
  });

  it("blocks under 100 g and proposes the coded motif", () => {
    const checks = evaluateReception(food({ quantity: 80 }));
    const rule = checks.find((c) => c.rule === "ALIMENT_MICRO_POIDS");
    expect(rule?.level).toBe("BLOQUANT");
    expect(rule?.message).toContain("80 g < 100 g");
    expect(proposedConformity(checks)).toEqual({
      conformity: false,
      reason: "QUANTITE_INSUFFISANTE",
      forced: true,
    });
  });

  it("warns, not blocks, when the quantity was never weighed (« 01 unité »)", () => {
    const checks = evaluateReception(food({ quantity: 1, quantityUnit: "UNITE" }));
    const rule = checks.find((c) => c.rule === "ALIMENT_MICRO_POIDS");
    expect(rule?.level).toBe("AVERTISSEMENT");
    expect(rule?.message).toContain("déclarée en unités");
    expect(evaluateReception(food({ quantity: null, quantityUnit: null }))[0].message).toContain("non renseignée");
    expect(proposedConformity(checks).conformity).toBe(true);
  });

  it("requires the temperature at arrival and flags the cold chain", () => {
    const missing = evaluateReception(food({ receptionTemperature: null }));
    expect(missing.find((c) => c.rule === "TEMPERATURE_ARRIVEE")?.level).toBe("BLOQUANT");
    expect(proposedConformity(missing).reason).toBe("TEMPERATURE_MANQUANTE");

    const warm = evaluateReception(food({ receptionTemperature: 12.5 }));
    const cold = warm.find((c) => c.rule === "CHAINE_FROID");
    expect(cold?.level).toBe("AVERTISSEMENT");
    expect(cold?.message).toContain("12,5 °C");
    expect(proposedConformity(warm)).toEqual({ conformity: true, reason: "CHAINE_FROID", forced: false });
  });

  it("uses the chemistry minimum for a physico-chemistry line", () => {
    const checks = evaluateReception(food({ family: "CHIMIE", quantity: 200 }));
    expect(checks[0]).toMatchObject({ rule: "ALIMENT_CHIMIE_POIDS", level: "BLOQUANT" });
    expect(checks[0].message).toContain("300 g");
  });

  it("histamine: nine units of 100 g each", () => {
    const line = food({ parameterNames: ["Histamine"], unitCount: 9, quantity: 900 });
    expect(evaluateReception(line).map((c) => c.level)).toEqual(["OK", "OK", "OK"]);

    const short = evaluateReception(food({ parameterNames: ["Histamine"], unitCount: 5, quantity: 500 }));
    expect(short.find((c) => c.rule === "HISTAMINE_UNITES")?.level).toBe("AVERTISSEMENT");
    expect(short.find((c) => c.rule === "HISTAMINE_POIDS")?.level).toBe("OK");

    const light = evaluateReception(food({ parameterNames: ["Histamine"], unitCount: 9, quantity: 450 }));
    expect(light.find((c) => c.rule === "HISTAMINE_POIDS")?.level).toBe("BLOQUANT");
  });
});

describe("evaluateReception — water", () => {
  const water = (over: Partial<ReceptionLine> = {}): ReceptionLine =>
    food({ lineKind: "EAU", parameterNames: ["Coliformes totaux"], quantity: 1.5, quantityUnit: "L", ...over });

  it("needs one litre for microbiology, six with Salmonella", () => {
    expect(evaluateReception(water())[0]).toMatchObject({ rule: "EAU_MICRO_VOLUME", level: "OK" });
    const salmonella = evaluateReception(water({ parameterNames: ["Recherche de Salmonella"] }));
    expect(salmonella[0]).toMatchObject({ rule: "EAU_SALMONELLA_VOLUME", level: "BLOQUANT" });
    expect(salmonella[0].message).toContain("6 L");
  });

  it("converts millilitres and applies the chemistry volume", () => {
    const ml = evaluateReception(water({ quantity: 500, quantityUnit: "ML" }));
    expect(ml[0].level).toBe("BLOQUANT");
    const chem = evaluateReception(water({ family: "CHIMIE", quantity: 2, quantityUnit: "L" }));
    expect(chem[0]).toMatchObject({ rule: "EAU_CHIMIE_VOLUME", level: "OK" });
  });

  it("does not raise the cold-chain warning on water", () => {
    const checks = evaluateReception(water({ receptionTemperature: 20 }));
    expect(checks.some((c) => c.rule === "CHAINE_FROID")).toBe(false);
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
    const surface = evaluateReception(
      food({ lineKind: "SURFACE", quantity: null, quantityUnit: null, receptionTemperature: null }),
      thresholds
    );
    expect(surface).toEqual([
      expect.objectContaining({ rule: "TEMPERATURE_ARRIVEE", level: "BLOQUANT" }),
    ]);
  });
});
