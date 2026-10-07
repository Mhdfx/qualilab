import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS } from "@/lib/reception-rules";
import {
  countLabel,
  depositLineChecks,
  errorConcernsSample,
  familiesSummary,
  lineSampleRefs,
  mergeFamilyChecks,
  missingFamilies,
  receptionDesignation,
  sampleCount,
  sampleHeading,
} from "./reception-logic";

/**
 * RETOUR-LABO-06-10.md §5 — what the reception screens say and check:
 * « Échantillon N » (V2), the two samples of a two-family line with their
 * own acceptance rules (V3), the surface's state and the air's method
 * (V2, V4). Invented designations and analyses only.
 */

describe("wording", () => {
  it("counts in French, singular and plural", () => {
    expect(countLabel(1, "échantillon")).toBe("1 échantillon");
    expect(countLabel(3, "échantillon")).toBe("3 échantillons");
    expect(countLabel(0, "échantillon")).toBe("0 échantillon");
    expect(countLabel(2, "échantillon numéroté", "échantillons numérotés")).toBe("2 échantillons numérotés");
  });

  it("summarises the ticked families", () => {
    expect(familiesSummary(["MICRO"])).toBe("Analyses microbiologiques");
    expect(familiesSummary(["CHIMIE"])).toBe("Analyses physico-chimiques");
    expect(familiesSummary(["CHIMIE", "MICRO"])).toBe("Analyses microbiologiques et physico-chimiques");
    expect(familiesSummary([])).toBe("Aucune famille d'analyses cochée");
  });

  it("names the samples a line becomes", () => {
    expect(lineSampleRefs(2, ["MICRO"])).toEqual(["2"]);
    expect(lineSampleRefs(2, ["CHIMIE", "MICRO"])).toEqual(["2M", "2P"]);
    expect(sampleCount([
      { analysesMicro: true, analysesChimie: false },
      { analysesMicro: true, analysesChimie: true },
      { analysesMicro: false, analysesChimie: false },
    ])).toBe(4);
  });

  it("heads a card with the sample's ref, its letter read from the code", () => {
    expect(sampleHeading({ lineNumber: 2, code: "5/26-2P" }, "Nature test")).toBe("Échantillon 2P · Nature test");
    expect(sampleHeading({ lineNumber: 2, code: "5/26-2" }, "Nature test")).toBe("Échantillon 2 · Nature test");
    expect(sampleHeading({ lineNumber: 3, code: "QL-OLD-1" })).toBe("Échantillon 3");
  });
});

describe("receptionDesignation", () => {
  const base = { produit: null, surfaceLabel: null, personName: null };

  it("adds the surface's state and area, old rows unchanged", () => {
    expect(
      receptionDesignation({ ...base, lineKind: "SURFACE", surfaceLabel: "Planche verte", surfaceState: "NETTOYE", surfaceAreaCm2: 100 })
    ).toBe("Planche verte — surface nettoyée · 100 cm²");
    expect(receptionDesignation({ ...base, lineKind: "SURFACE", surfaceLabel: "Plan de travail", surfaceAreaCm2: 100 })).toBe(
      "Plan de travail · 100 cm²"
    );
  });

  it("adds the air's method when there is one", () => {
    expect(receptionDesignation({ ...base, lineKind: "AIR", produit: "Salle test", airMethod: "BIOCOLLECTEUR" })).toBe(
      "Salle test — Biocollecteur"
    );
    expect(receptionDesignation({ ...base, lineKind: "AIR", airMethod: "BOITE_EXPOSEE_30MIN" })).toBe(
      "Air — Boîte exposée 30 min"
    );
    expect(receptionDesignation({ ...base, lineKind: "AIR", produit: "Salle test" })).toBe("Salle test");
  });

  it("keeps hands and products as before", () => {
    expect(
      receptionDesignation({ ...base, lineKind: "MAINS", personName: "Personne Test", personRole: "Cuisine", handsState: "LAVEES" })
    ).toBe("Personne Test — Cuisine · mains lavées");
    expect(receptionDesignation({ ...base, lineKind: "ALIMENT", produit: "Plat test" })).toBe("Plat test");
    expect(receptionDesignation({ ...base, lineKind: "ALIMENT" })).toBe("—");
  });
});

describe("errorConcernsSample", () => {
  const micro = { lineNumber: 2, code: "5/26-2M" };
  const chimie = { lineNumber: 2, code: "5/26-2P" };
  const other = { lineNumber: 3, code: "5/26-3" };

  it("flags only the twin the message names", () => {
    const error = { message: "Échantillon 2P : quantité insuffisante.", lineNumber: 2 };
    expect(errorConcernsSample(error, chimie)).toBe(true);
    expect(errorConcernsSample(error, micro)).toBe(false);
    expect(errorConcernsSample(error, other)).toBe(false);
  });

  it("trusts the ref the API returns over the message", () => {
    const error = { message: "L'échantillon est envoyé deux fois.", lineNumber: 2, ref: "2M" };
    expect(errorConcernsSample(error, micro)).toBe(true);
    expect(errorConcernsSample(error, chimie)).toBe(false);
    expect(errorConcernsSample(error, other)).toBe(false);
  });

  it("flags the whole line when the message has no letter", () => {
    const error = { message: "Échantillon 2 : choisissez le motif.", lineNumber: 2 };
    expect(errorConcernsSample(error, micro)).toBe(true);
    expect(errorConcernsSample(error, chimie)).toBe(true);
  });

  it("does not read « Échantillon 12 » as line 1", () => {
    const error = { message: "Échantillon 12M : quantité insuffisante.", lineNumber: 12 };
    expect(errorConcernsSample(error, { lineNumber: 12, code: "5/26-12M" })).toBe(true);
    expect(errorConcernsSample(error, { lineNumber: 12, code: "5/26-12P" })).toBe(false);
  });

  it("flags nothing without an error", () => {
    expect(errorConcernsSample(null, micro)).toBe(false);
    expect(errorConcernsSample({ message: "Technicien invalide.", lineNumber: null }, micro)).toBe(false);
  });
});

describe("missingFamilies", () => {
  it("names a ticked box no sample to analyse answers", () => {
    expect(
      missingFamilies({
        analysesMicro: true,
        analysesChimie: true,
        samples: [
          { status: "PRELEVE", nature: { family: "MICRO" } },
          { status: "ANNULE", nature: { family: "CHIMIE" } },
        ],
      })
    ).toEqual(["analyses physico-chimiques"]);
  });

  it("is empty when the boxes match the samples (computed boxes)", () => {
    expect(
      missingFamilies({
        analysesMicro: true,
        analysesChimie: false,
        samples: [{ status: "PRELEVE", nature: { family: "MICRO" } }],
      })
    ).toEqual([]);
  });
});

describe("depositLineChecks", () => {
  const food = {
    lineKind: "ALIMENT" as const,
    parameters: [],
    quantityUnit: "G" as const,
    receptionTemperature: 4,
    unitCount: 1,
  };

  it("runs the micro rule alone on a one-family line", () => {
    const { checks, familyBlocking, proposal } = depositLineChecks({ ...food, families: ["MICRO"], quantity: 150 }, DEFAULT_THRESHOLDS);
    expect(checks.map((c) => c.rule)).toEqual(["ALIMENT_MICRO_POIDS", "TEMPERATURE_ARRIVEE"]);
    expect(checks[0].message).not.toMatch(/^Microbiologie/);
    expect(familyBlocking).toBe(false);
    expect(proposal).toEqual({ conformity: true, reason: null, forced: false });
  });

  it("checks each sample of a two-family line, the shared rule once", () => {
    const { checks, familyBlocking, proposal } = depositLineChecks(
      { ...food, families: ["MICRO", "CHIMIE"], quantity: 150 },
      DEFAULT_THRESHOLDS
    );
    expect(checks.map((c) => c.message)).toEqual([
      "Microbiologie : Quantité 150 g ≥ 100 g.",
      "Température à l'arrivée relevée : 4 °C.",
      "Physico-chimie : Quantité 150 g < 300 g requis.",
    ]);
    expect(new Set(checks.map((c) => c.rule)).size).toBe(checks.length);
    expect(familyBlocking).toBe(true);
    expect(proposal).toMatchObject({ conformity: false, forced: true, reason: "QUANTITE_INSUFFISANTE" });
  });

  it("does not call a shared blocking rule a family's", () => {
    const { familyBlocking, proposal } = depositLineChecks(
      { ...food, families: ["MICRO", "CHIMIE"], quantity: 500, receptionTemperature: null },
      DEFAULT_THRESHOLDS
    );
    expect(familyBlocking).toBe(false);
    expect(proposal).toMatchObject({ forced: true, reason: "TEMPERATURE_MANQUANTE" });
  });

  it("gives each sample its own analyses (histamine is a micro rule)", () => {
    const { checks } = depositLineChecks(
      {
        ...food,
        families: ["MICRO", "CHIMIE"],
        quantity: 900,
        unitCount: 9,
        parameters: [
          { name: "Histamine test", family: "MICRO" },
          { name: "Paramètre chimie test", family: "CHIMIE" },
        ],
      },
      DEFAULT_THRESHOLDS
    );
    expect(checks.map((c) => c.rule)).toEqual([
      "MICRO:HISTAMINE_UNITES",
      "MICRO:HISTAMINE_POIDS",
      "TEMPERATURE_ARRIVEE",
      "CHIMIE:ALIMENT_CHIMIE_POIDS",
    ]);
  });

  it("still checks the temperature when no family is ticked", () => {
    const { checks } = depositLineChecks({ ...food, families: [], quantity: 150, receptionTemperature: null }, DEFAULT_THRESHOLDS);
    expect(checks.map((c) => c.rule)).toEqual(["TEMPERATURE_ARRIVEE"]);
  });

  it("merges nothing for a single list", () => {
    expect(mergeFamilyChecks([])).toEqual({ checks: [], familyBlocking: false });
  });
});
