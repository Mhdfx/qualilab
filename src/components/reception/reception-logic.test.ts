import { describe, expect, it } from "vitest";
import { DEFAULT_THRESHOLDS, type ChecklistRow } from "@/lib/reception-rules";
import {
  countLabel,
  depositLineChecklist,
  errorConcernsSample,
  familiesSummary,
  lineSampleRefs,
  coolerOutOfRange,
  mergeFamilyRows,
  missingFamilies,
  receptionTemperatureSource,
  storageDefaultLabel,
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

describe("depositLineChecklist — the seven rules of a deposit line", () => {
  const food = {
    lineKind: "ALIMENT" as const,
    parameters: [],
    quantityUnit: "G" as const,
    receptionTemperature: 4,
    unitCount: 1,
    exploitable: true,
    packagingOk: true,
    identificationOk: true,
    storageClass: null,
    temperatureSource: null,
    expiryDate: null,
    // Sampled at 08:00, at the counter at 10:00: C1 within 24 h.
    serie: {
      startedAt: new Date("2026-10-10T08:00:00.000Z"),
      endedAt: null,
      arrivedAt: new Date("2026-10-10T10:00:00.000Z"),
      samplingTimeDeclared: true,
      receivedAt: new Date("2026-10-10T10:00:00.000Z"),
    },
  };
  /** A paper row by its number — the coded rows (C1 … C7) follow the seven. */
  const row = (rows: ChecklistRow[], n: number) => rows.find((r) => r.n === n && !r.code)!;
  const paper = (rows: ChecklistRow[]) => rows.filter((r) => !r.code);
  const coded = (rows: ChecklistRow[], code: string) => rows.find((r) => r.code === code)!;

  it("lists the seven rules of a one-family line, unprefixed", () => {
    const { rows, familyBlocking, proposal } = depositLineChecklist({ ...food, families: ["MICRO"], quantity: 150 }, DEFAULT_THRESHOLDS);
    expect(paper(rows).map((r) => [r.n, r.status])).toEqual([
      [1, "CONFORME"],
      [2, "CONFORME"],
      [3, "SANS_OBJET"],
      [4, "SANS_OBJET"],
      [5, "SANS_OBJET"],
      [6, "CONFORME"],
      [7, "SANS_OBJET"],
    ]);
    expect(row(rows, 2)).toMatchObject({ detail: "Quantité 150 g ≥ 100 g", rules: ["ALIMENT_MICRO_POIDS"] });
    // No analysis ticked: histamine is checked at the programme.
    expect(row(rows, 7)).toMatchObject({ detail: "Si l'histamine est demandée : 9 × 100 g — vérifié au programme" });
    expect(familyBlocking).toBe(false);
    expect(proposal).toEqual({ conformity: true, reason: null, forced: false, rule: null, code: null, pending: false });
  });

  it("merges the two samples of a two-family line: each family's row headed, the shared ones once", () => {
    const { rows, familyBlocking, proposal } = depositLineChecklist(
      { ...food, families: ["MICRO", "CHIMIE"], quantity: 150 },
      DEFAULT_THRESHOLDS
    );
    expect(paper(rows)).toHaveLength(7);
    expect(row(rows, 2)).toMatchObject({
      status: "CONFORME",
      detail: "Microbiologie : quantité 150 g ≥ 100 g",
      rules: ["MICRO:ALIMENT_MICRO_POIDS"],
    });
    expect(row(rows, 3)).toMatchObject({
      status: "NON_CONFORME",
      detail: "Physico-chimie : quantité 150 g < 300 g requis",
      reason: "QUANTITE_INSUFFISANTE",
      rules: ["CHIMIE:ALIMENT_CHIMIE_POIDS"],
    });
    expect(row(rows, 6)).toMatchObject({ status: "CONFORME", detail: "4 °C", rules: ["TEMPERATURE_ARRIVEE"] });
    expect(row(rows, 1)).toMatchObject({ status: "CONFORME" });
    // 2M could be conform on its own: today's quantity logic is kept (lab question).
    expect(familyBlocking).toBe(true);
    expect(proposal).toMatchObject({ conformity: false, forced: true, rule: 3, reason: "QUANTITE_INSUFFISANTE" });
  });

  it("does not call a shared refusal a family's", () => {
    const { familyBlocking, proposal } = depositLineChecklist(
      { ...food, families: ["MICRO", "CHIMIE"], quantity: 500, receptionTemperature: null },
      DEFAULT_THRESHOLDS
    );
    expect(familyBlocking).toBe(false);
    expect(proposal).toMatchObject({ forced: true, rule: 6, reason: "TEMPERATURE_MANQUANTE" });
  });

  it("puts histamine on the physico-chemistry sample, rule (7) beside rules (2) and (3)", () => {
    const { rows, proposal } = depositLineChecklist(
      {
        ...food,
        families: ["MICRO", "CHIMIE"],
        quantity: 900,
        unitCount: 9,
        parameters: [
          { name: "Germe test", family: "MICRO" },
          // Recognised on its alias.
          { name: "Amine biogène test", aliases: "Histamine HPLC", family: "CHIMIE" },
        ],
      },
      DEFAULT_THRESHOLDS
    );
    expect(row(rows, 2)).toMatchObject({ status: "CONFORME", rules: ["MICRO:ALIMENT_MICRO_POIDS"] });
    expect(row(rows, 3)).toMatchObject({ status: "CONFORME", rules: ["CHIMIE:ALIMENT_CHIMIE_POIDS"] });
    expect(row(rows, 7)).toMatchObject({
      status: "CONFORME",
      detail: "Physico-chimie : histamine : 9 unités (9 attendues) · poids par unité 100 g ≥ 100 g",
      rules: ["CHIMIE:HISTAMINE_UNITES", "CHIMIE:HISTAMINE_POIDS"],
    });
    expect(proposal).toMatchObject({ conformity: true, forced: false });
  });

  it("applies one answer to rule (1) to both samples of the line", () => {
    const refused = depositLineChecklist({ ...food, families: ["MICRO", "CHIMIE"], quantity: 500, exploitable: false }, DEFAULT_THRESHOLDS);
    expect(row(refused.rows, 1)).toMatchObject({ status: "NON_CONFORME", reason: "NON_EXPLOITABLE" });
    // Both samples fail: neither could be conform on its own.
    expect(refused.familyBlocking).toBe(false);
    expect(refused.proposal).toMatchObject({ conformity: false, forced: true, rule: 1, reason: "NON_EXPLOITABLE" });

    const unanswered = depositLineChecklist({ ...food, families: ["MICRO", "CHIMIE"], quantity: 500, exploitable: null }, DEFAULT_THRESHOLDS);
    expect(row(unanswered.rows, 1).status).toBe("A_CONFIRMER");
    expect(unanswered.proposal.pending).toBe(true);
  });

  it("still checks the temperature when no family is ticked", () => {
    const { rows } = depositLineChecklist({ ...food, families: [], quantity: 150, receptionTemperature: null }, DEFAULT_THRESHOLDS);
    expect(row(rows, 6)).toMatchObject({ status: "NON_CONFORME", rules: ["TEMPERATURE_ARRIVEE"] });
    expect(row(rows, 2)).toMatchObject({ status: "SANS_OBJET", detail: "Sans objet : autre famille d'analyses" });
  });

  it("lists the contrôles complémentaires after the seven rules, one answer for both samples", () => {
    const { rows, proposal } = depositLineChecklist(
      { ...food, families: ["MICRO", "CHIMIE"], quantity: 500, packagingOk: false },
      DEFAULT_THRESHOLDS
    );
    // The merged row keeps its code: the widget lists it in its own group.
    expect(coded(rows, "C3")).toMatchObject({ key: "EMBALLAGE", status: "NON_CONFORME", reason: "EMBALLAGE" });
    expect(coded(rows, "C5")).toMatchObject({ key: "IDENTIFICATION", status: "CONFORME" });
    expect(proposal).toMatchObject({ conformity: false, forced: true, rule: null, code: "C3", reason: "EMBALLAGE" });

    // A paper rule keeps the priority over a control.
    const both = depositLineChecklist(
      { ...food, families: ["MICRO"], quantity: 500, receptionTemperature: null, identificationOk: false },
      DEFAULT_THRESHOLDS
    );
    expect(both.proposal).toMatchObject({ forced: true, rule: 6, code: null, reason: "TEMPERATURE_MANQUANTE" });

    const unticked = depositLineChecklist({ ...food, families: ["MICRO"], quantity: 500, packagingOk: null }, DEFAULT_THRESHOLDS);
    expect(coded(unticked.rows, "C3").status).toBe("A_CONFIRMER");
    expect(unticked.proposal.pending).toBe(true);
  });

  it("computes C1 per family: an undeclared sampling time is « à vérifier », chemistry without a limit is « sans objet »", () => {
    const declared = depositLineChecklist({ ...food, families: ["MICRO", "CHIMIE"], quantity: 500 }, DEFAULT_THRESHOLDS);
    expect(coded(declared.rows, "C1")).toMatchObject({
      status: "CONFORME",
      // Physico-chemistry has no limit: only the family that has one is shown.
      detail: "Microbiologie : délai 2 h",
      rules: ["MICRO:DELAI"],
    });
    const undeclared = depositLineChecklist(
      { ...food, families: ["MICRO"], quantity: 500, serie: { ...food.serie, samplingTimeDeclared: false } },
      DEFAULT_THRESHOLDS
    );
    expect(coded(undeclared.rows, "C1")).toMatchObject({ status: "A_VERIFIER", reason: "DELAI", detail: "Heure de prélèvement non déclarée" });
    expect(undeclared.proposal).toMatchObject({ conformity: true, forced: false, reason: "DELAI" });
    // Before the screen's clock, nothing is computed.
    expect(coded(depositLineChecklist({ ...food, families: ["MICRO"], quantity: 500, serie: null }, DEFAULT_THRESHOLDS).rows, "C1")).toMatchObject({
      status: "SANS_OBJET",
    });
  });

  it("judges C2 per family with the line's class: water chilled in microbiology, « sans objet » in chemistry", () => {
    const water = {
      ...food,
      lineKind: "EAU" as const,
      quantityUnit: "L" as const,
      quantity: 2,
      receptionTemperature: 12,
      temperatureSource: "ECHANTILLON" as const,
    };
    const { rows, proposal } = depositLineChecklist({ ...water, families: ["MICRO", "CHIMIE"] }, DEFAULT_THRESHOLDS);
    expect(coded(rows, "C2")).toMatchObject({
      status: "A_VERIFIER",
      reason: "CHAINE_FROID",
      detail: "Microbiologie : 12 °C, hors de la plage réfrigérée 0 à 8 °C — vérifier la chaîne du froid (mesurée sur l'échantillon)",
    });
    expect(proposal).toMatchObject({ conformity: true, forced: false });
    // A class chosen for the line applies to both samples.
    expect(coded(depositLineChecklist({ ...water, families: ["MICRO", "CHIMIE"], storageClass: "AMBIANT" }, DEFAULT_THRESHOLDS).rows, "C2")).toMatchObject({
      status: "SANS_OBJET",
      detail: "Transporté à température ambiante",
    });
  });

  it("reads C7 on a food line from the DLC typed, the counter's day as reception", () => {
    const passed = depositLineChecklist({ ...food, families: ["MICRO"], quantity: 500, expiryDate: new Date("2026-10-09T00:00:00.000Z") }, DEFAULT_THRESHOLDS);
    expect(coded(passed.rows, "C7")).toMatchObject({ status: "A_VERIFIER", reason: "AUTRE", detail: "DLC dépassée le 09/10/2026" });
    // Never a refusal: conform stays possible (end-of-shelf-life tests).
    expect(passed.proposal).toMatchObject({ conformity: true, forced: false, reason: "AUTRE" });
    const fresh = depositLineChecklist({ ...food, families: ["MICRO"], quantity: 500, expiryDate: new Date("2026-10-10T00:00:00.000Z") }, DEFAULT_THRESHOLDS);
    expect(coded(fresh.rows, "C7")).toMatchObject({ status: "CONFORME", detail: "DLC 10/10/2026" });
    // Not a food line: no C7 row at all.
    const swab = depositLineChecklist({ ...food, lineKind: "SURFACE", families: ["MICRO"], quantity: null }, DEFAULT_THRESHOLDS);
    expect(swab.rows.some((row) => row.code === "C7")).toBe(false);
  });

  it("names the default of « Conservation » for the line's families", () => {
    expect(storageDefaultLabel("ALIMENT", ["MICRO"])).toBe("Réfrigéré (par défaut)");
    expect(storageDefaultLabel("AIR", ["MICRO"])).toBe("Sans objet (par défaut)");
    expect(storageDefaultLabel("EAU", ["MICRO", "CHIMIE"])).toBe("Selon la famille (par défaut)");
    expect(storageDefaultLabel("EAU", [])).toBe("Sans objet (par défaut)");
  });

  it("merges nothing for a single list", () => {
    expect(mergeFamilyRows([])).toEqual({ rows: [], familyBlocking: false });
  });
});

describe("the temperature at reception (C2)", () => {
  it("reads where it comes from: the card's choice, the sample once typed, else the cooler", () => {
    expect(receptionTemperatureSource({ temperature: "", temperatureTouched: false, sourceChoice: null })).toBeNull();
    expect(receptionTemperatureSource({ temperature: "3", temperatureTouched: false, sourceChoice: null })).toBe("GLACIERE");
    expect(receptionTemperatureSource({ temperature: "5", temperatureTouched: true, sourceChoice: null })).toBe("ECHANTILLON");
    expect(receptionTemperatureSource({ temperature: "5", temperatureTouched: true, sourceChoice: "FLACON_TEMOIN" })).toBe("FLACON_TEMOIN");
    // A choice without a value is no source.
    expect(receptionTemperatureSource({ temperature: " ", temperatureTouched: true, sourceChoice: "FLACON_TEMOIN" })).toBeNull();
  });

  it("flags a cooler outside the chilled range, the bounds included in it", () => {
    expect(coolerOutOfRange(null, DEFAULT_THRESHOLDS)).toBe(false);
    expect(coolerOutOfRange(0, DEFAULT_THRESHOLDS)).toBe(false);
    expect(coolerOutOfRange(8, DEFAULT_THRESHOLDS)).toBe(false);
    expect(coolerOutOfRange(8.5, DEFAULT_THRESHOLDS)).toBe(true);
    expect(coolerOutOfRange(-1, DEFAULT_THRESHOLDS)).toBe(true);
  });
});
