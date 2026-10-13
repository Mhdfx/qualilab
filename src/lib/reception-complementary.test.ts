import { describe, expect, it } from "vitest";
import type { Family, LineKind } from "@/generated/prisma/enums";
import {
  COMPLEMENTARY_CHECKS,
  COMPLEMENTARY_MESSAGES,
  DEFAULT_COMPLEMENTARY_THRESHOLDS,
  complementaryChecklist,
  complementaryRefusal,
  defaultStorageClass,
  delayMinutes,
  expiredDlcNote,
  formatDelay,
  labDayOf,
  packagingHint,
  parseChoice,
  STABLE_FOOD_STORAGE_LABEL,
  STORAGE_CLASSES,
  TEMPERATURE_SOURCES,
  serieDelayMinutes,
  signedProtocolRow,
  storageClassOptionLabel,
  storedSignedProtocolAnswer,
  type ComplementaryAnswers,
  type ComplementaryLine,
  type ComplementarySerie,
} from "./reception-complementary";
import { DEFAULT_THRESHOLDS, checklistRowLabel, proposedConformity, receptionChecklist, type ChecklistRow } from "./reception-rules";

/**
 * The contrôles complémentaires of the reception (hors bon), C1 … C7 —
 * invented samples only.
 */

const line = (over: Partial<ComplementaryLine> = {}): ComplementaryLine => ({
  lineKind: "ALIMENT",
  family: "MICRO",
  ...over,
});

const ticked: ComplementaryAnswers = { packagingOk: true, identificationOk: true };

/** Sampled 08:00 → 09:00, arrived 12:30 (UTC, after Morocco's return to GMT). */
const timing: ComplementarySerie = {
  startedAt: new Date("2026-10-10T08:00:00.000Z"),
  endedAt: new Date("2026-10-10T09:00:00.000Z"),
  arrivedAt: new Date("2026-10-10T12:30:00.000Z"),
  receivedAt: new Date("2026-10-10T13:00:00.000Z"),
};

const rows = (
  over: Partial<ComplementaryLine> = {},
  answers: Partial<ComplementaryAnswers> = {},
  serie: Partial<ComplementarySerie> = {},
  thresholds = DEFAULT_THRESHOLDS
) => complementaryChecklist(line(over), { ...timing, ...serie }, thresholds, { ...ticked, ...answers });

const byCode = (list: ChecklistRow[], code: string) => list.find((row) => row.code === code)!;

describe("the registry", () => {
  it("codes each check, in code order, so it never reads as a rule of the paper", () => {
    expect(COMPLEMENTARY_CHECKS.map((check) => [check.code, check.key, check.mode])).toEqual([
      ["C1", "DELAI", "COMPUTED"],
      ["C2", "TRANSPORT_TEMP", "COMPUTED"],
      ["C3", "EMBALLAGE", "TICK"],
      ["C5", "IDENTIFICATION", "TICK"],
      ["C7", "DLC", "COMPUTED"],
    ]);
    // C7 concerns food only; the others every kind.
    expect(COMPLEMENTARY_CHECKS.find((check) => check.code === "C7")?.kinds).toEqual(["ALIMENT"]);
  });
});

describe("C1 — délai prélèvement → laboratoire", () => {
  const at = (iso: string) => new Date(iso);

  it("counts whole minutes from the end of the sampling, never below zero, and words them", () => {
    expect(delayMinutes(at("2026-10-10T09:00:00Z"), at("2026-10-10T12:30:59Z"))).toBe(210);
    expect(delayMinutes(at("2026-10-10T09:00:00Z"), at("2026-10-10T08:58:00Z"))).toBe(0);
    expect(formatDelay(210)).toBe("3 h 30");
    expect(formatDelay(185)).toBe("3 h 05");
    expect(formatDelay(27 * 60)).toBe("27 h");
    expect(formatDelay(45)).toBe("45 min");
  });

  it("is conform within the limit, the limit itself included", () => {
    expect(byCode(rows(), "C1")).toMatchObject({ n: 1, key: "DELAI", status: "CONFORME", detail: "Délai 3 h 30", rules: ["DELAI"] });
    expect(byCode(rows(), "C1")).not.toHaveProperty("reason");
    const limit = rows({}, {}, { arrivedAt: at("2026-10-11T09:00:00Z") });
    expect(byCode(limit, "C1")).toMatchObject({ status: "CONFORME", detail: "Délai 24 h" });
  });

  it("is « à vérifier » past the limit, or non conforme when the laboratory says so", () => {
    const late = { arrivedAt: at("2026-10-11T12:00:00Z") };
    expect(byCode(rows({}, {}, late), "C1")).toMatchObject({ status: "A_VERIFIER", reason: "DELAI", detail: "Délai 27 h > 24 h" });
    expect(byCode(rows({}, {}, { arrivedAt: at("2026-10-11T09:01:00Z") }), "C1").status).toBe("A_VERIFIER");
    const blocking = rows({}, {}, late, { ...DEFAULT_THRESHOLDS, delayBlocking: true });
    expect(byCode(blocking, "C1")).toMatchObject({ status: "NON_CONFORME", reason: "DELAI" });
    expect(complementaryRefusal(byCode(blocking, "C1"))).toBe(
      "Contrôle C1 « Délai prélèvement → laboratoire » non conforme — délai 27 h > 24 h. L'échantillon ne peut pas être déclaré conforme."
    );
  });

  it("counts from the start when no end was typed, up to the reception instant when no arrival was recorded", () => {
    expect(serieDelayMinutes({ ...timing, endedAt: null })).toBe(270);
    expect(serieDelayMinutes({ ...timing, arrivedAt: null })).toBe(240);
    expect(byCode(rows({}, {}, { endedAt: null, arrivedAt: null }), "C1")).toMatchObject({ detail: "Délai 5 h" });
    // No clock yet (a screen before hydration): nothing to judge.
    expect(serieDelayMinutes({ ...timing, arrivedAt: null, receivedAt: null })).toBeNull();
    expect(byCode(rows({}, {}, { arrivedAt: null, receivedAt: null }), "C1")).toMatchObject({ status: "SANS_OBJET", rules: [] });
  });

  it("says « heure de prélèvement non déclarée » for a deposit without its sampling time", () => {
    expect(byCode(rows({}, {}, { samplingTimeDeclared: false }), "C1")).toMatchObject({
      status: "A_VERIFIER",
      reason: "DELAI",
      detail: "Heure de prélèvement non déclarée",
    });
  });

  it("reads the limit of the family: physico-chemistry without a limit is « sans objet »", () => {
    expect(byCode(rows({ family: "CHIMIE" }), "C1")).toMatchObject({ status: "SANS_OBJET", detail: "Pas de délai fixé", rules: [] });
    expect(byCode(rows({ family: "CHIMIE" }, {}, { samplingTimeDeclared: false }), "C1").status).toBe("SANS_OBJET");
    const chem = { ...DEFAULT_THRESHOLDS, maxDelayChemH: 2 };
    expect(byCode(rows({ family: "CHIMIE" }, {}, {}, chem), "C1")).toMatchObject({ status: "A_VERIFIER", detail: "Délai 3 h 30 > 2 h" });
    expect(byCode(rows({ family: "AUTRE" }), "C1").status).toBe("SANS_OBJET");
  });

  it("defaults to 24 h in microbiology, no limit in physico-chemistry, never blocking", () => {
    expect(DEFAULT_COMPLEMENTARY_THRESHOLDS).toMatchObject({ maxDelayMicroH: 24, maxDelayChemH: null, delayBlocking: false });
  });
});

describe("C2 — température de transport", () => {
  const c2 = (over: Partial<ComplementaryLine>, thresholds = DEFAULT_THRESHOLDS) => byCode(rows(over, {}, {}, thresholds), "C2");

  it("defaults the class by kind: chilled for food, swabs and water in microbiology, none otherwise", () => {
    const cases: [LineKind, Family, string | null][] = [
      ["ALIMENT", "MICRO", "REFRIGERE"],
      ["ALIMENT", "CHIMIE", "REFRIGERE"],
      ["SURFACE", "MICRO", "REFRIGERE"],
      ["MAINS", "MICRO", "REFRIGERE"],
      ["EAU", "MICRO", "REFRIGERE"],
      ["EAU", "CHIMIE", null],
      ["AIR", "MICRO", null],
      ["AUTRE", "MICRO", null],
    ];
    for (const [kind, family, storage] of cases) expect(defaultStorageClass(kind, family)).toBe(storage);
  });

  it("judges a chilled sample against [min, max], the bounds included", () => {
    expect(c2({ receptionTemperature: 4, temperatureSource: "GLACIERE" })).toMatchObject({
      n: 2,
      key: "TRANSPORT_TEMP",
      status: "CONFORME",
      detail: "4 °C, réfrigéré entre 0 et 8 °C (glacière)",
      rules: ["CHAINE_FROID"],
    });
    expect(c2({ receptionTemperature: 0 }).status).toBe("CONFORME");
    expect(c2({ receptionTemperature: 8 }).status).toBe("CONFORME");
    expect(c2({ receptionTemperature: 8.1, temperatureSource: "ECHANTILLON" })).toMatchObject({
      status: "A_VERIFIER",
      reason: "CHAINE_FROID",
      detail: "8,1 °C, hors de la plage réfrigérée 0 à 8 °C — vérifier la chaîne du froid (mesurée sur l'échantillon)",
    });
    expect(c2({ receptionTemperature: -0.5 })).toMatchObject({ status: "A_VERIFIER", reason: "CHAINE_FROID" });
  });

  it("reads water in microbiology against its own maximum", () => {
    const water = { lineKind: "EAU" as const, family: "MICRO" as const, receptionTemperature: 9, temperatureSource: "FLACON_TEMOIN" as const };
    expect(c2(water)).toMatchObject({ status: "A_VERIFIER", detail: "9 °C, hors de la plage réfrigérée 0 à 8 °C — vérifier la chaîne du froid (flacon témoin)" });
    expect(c2(water, { ...DEFAULT_THRESHOLDS, waterMicroMaxC: 10 })).toMatchObject({
      status: "CONFORME",
      detail: "9 °C, réfrigéré entre 0 et 10 °C (flacon témoin)",
    });
    // Food keeps the chilled maximum.
    expect(c2({ receptionTemperature: 9 }, { ...DEFAULT_THRESHOLDS, waterMicroMaxC: 10 }).status).toBe("A_VERIFIER");
  });

  it("judges a frozen sample against its maximum", () => {
    expect(c2({ storageClass: "CONGELE", receptionTemperature: -18 })).toMatchObject({ status: "CONFORME", detail: "-18 °C, congelé ≤ -15 °C" });
    expect(c2({ storageClass: "CONGELE", receptionTemperature: -15 }).status).toBe("CONFORME");
    expect(c2({ storageClass: "CONGELE", receptionTemperature: -10, temperatureSource: "GLACIERE" })).toMatchObject({
      status: "A_VERIFIER",
      reason: "CHAINE_FROID",
      detail: "-10 °C, au-dessus de -15 °C pour un congelé — vérifier la chaîne du froid (glacière)",
    });
  });

  it("says « sans objet » for ambient and hot transport, a sample without a class, or no reading", () => {
    expect(c2({ storageClass: "AMBIANT", receptionTemperature: 25 })).toMatchObject({ status: "SANS_OBJET", detail: "Transporté à température ambiante", rules: [] });
    expect(c2({ storageClass: "CHAUD", receptionTemperature: 65 })).toMatchObject({ status: "SANS_OBJET", detail: "Transporté chaud" });
    expect(c2({ lineKind: "AIR", receptionTemperature: 20 })).toMatchObject({ status: "SANS_OBJET", detail: "Sans objet : air" });
    expect(c2({ lineKind: "EAU", family: "CHIMIE", receptionTemperature: 20 })).toMatchObject({ detail: "Sans objet : eau (physico-chimie)" });
    expect(c2({ lineKind: "AUTRE", receptionTemperature: 20 })).toMatchObject({ detail: "Sans objet : autre prélèvement" });
    expect(c2({ receptionTemperature: null })).toMatchObject({ status: "SANS_OBJET", detail: "Pas de température relevée" });
    // An explicit class overrides the kind's default.
    expect(c2({ lineKind: "AIR", storageClass: "REFRIGERE", receptionTemperature: 4 }).status).toBe("CONFORME");
  });

  it("is never a refusal", () => {
    for (const temperature of [-40, 30, 90]) {
      for (const storageClass of STORAGE_CLASSES) {
        expect(["CONFORME", "A_VERIFIER", "SANS_OBJET"]).toContain(c2({ storageClass, receptionTemperature: temperature }).status);
      }
    }
  });

  it("words « Ambiant » as a stable food on a food only (12/10)", () => {
    expect(storageClassOptionLabel("AMBIANT", "ALIMENT")).toBe("Ambiant — aliment stable (conserve, sec, UHT…)");
    expect(STABLE_FOOD_STORAGE_LABEL).toBe(storageClassOptionLabel("AMBIANT", "ALIMENT"));
    for (const lineKind of ["EAU", "SURFACE", "MAINS", "AIR", "AUTRE"] as const) {
      expect(storageClassOptionLabel("AMBIANT", lineKind)).toBe("Ambiant");
    }
    expect(storageClassOptionLabel("AMBIANT", null)).toBe("Ambiant");
    expect(STORAGE_CLASSES.map((storage) => storageClassOptionLabel(storage, "ALIMENT"))).toEqual([
      "Réfrigéré",
      "Congelé",
      "Ambiant — aliment stable (conserve, sec, UHT…)",
      "Chaud",
    ]);
  });

  it("accepts a known class or source, nothing for an older page, refuses the rest", () => {
    expect(parseChoice(undefined, TEMPERATURE_SOURCES)).toBeNull();
    expect(parseChoice("", STORAGE_CLASSES)).toBeNull();
    expect(parseChoice("FLACON_TEMOIN", TEMPERATURE_SOURCES)).toBe("FLACON_TEMOIN");
    expect(parseChoice("TIEDE", STORAGE_CLASSES)).toBe("invalid");
    expect(parseChoice(4, STORAGE_CLASSES)).toBe("invalid");
  });
});

describe("C7 — DLC (food only, a warning)", () => {
  const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  const c7 = (expiryDate: Date | null, receivedAt: Date | null) =>
    byCode(rows({ expiryDate }, {}, { receivedAt }), "C7");

  it("compares calendar days: passed the day before, conform on the day itself and after", () => {
    const reception = new Date("2026-10-10T10:00:00.000Z");
    expect(c7(day("2026-10-09"), reception)).toMatchObject({
      n: 7,
      key: "DLC",
      status: "A_VERIFIER",
      reason: "AUTRE",
      detail: "DLC dépassée le 09/10/2026",
      rules: ["DLC"],
    });
    expect(c7(day("2026-10-10"), reception)).toMatchObject({ status: "CONFORME", detail: "DLC 10/10/2026" });
    expect(c7(day("2026-10-20"), reception)).toMatchObject({ status: "CONFORME", detail: "DLC 20/10/2026" });
  });

  it("reads the day of reception on the laboratory's clock — 23:30 UTC is still that day since the return to GMT", () => {
    // 09/10 (after 20/09/2026, legal time = UTC): received at 23:30 UTC, still the 9th.
    expect(labDayOf(new Date("2026-10-09T23:30:00.000Z"))).toBe("2026-10-09");
    expect(c7(day("2026-10-09"), new Date("2026-10-09T23:30:00.000Z")).status).toBe("CONFORME");
    expect(c7(day("2026-10-09"), new Date("2026-10-10T00:30:00.000Z")).status).toBe("A_VERIFIER");
    // Before the switch (UTC+1): 23:30 UTC on 10/09 is 00:30 on the 11th — a DLC of the 10th is passed.
    expect(labDayOf(new Date("2026-09-10T23:30:00.000Z"))).toBe("2026-09-11");
    expect(c7(day("2026-09-10"), new Date("2026-09-10T23:30:00.000Z")).status).toBe("A_VERIFIER");
  });

  it("reads the DLC from its stored UTC day — the 09/10 date-only shift cannot move it", () => {
    // A DATE column comes back as the UTC midnight of its day: « 2026-10-09 »
    // stays the 9th whatever the runtime's zone (date-only.ts).
    const stored = day("2026-10-09");
    expect(c7(stored, new Date("2026-10-09T00:10:00.000Z"))).toMatchObject({ status: "CONFORME", detail: "DLC 09/10/2026" });
  });

  it("says « DLC non indiquée » without a DLC, and waits for the clock", () => {
    expect(c7(null, new Date("2026-10-10T10:00:00.000Z"))).toMatchObject({ status: "SANS_OBJET", detail: "DLC non indiquée", rules: [] });
    expect(c7(day("2026-10-09"), null)).toMatchObject({ status: "SANS_OBJET", detail: "DLC 09/10/2026", rules: [] });
  });

  it("hands the form the précision of a passed DLC, nothing otherwise", () => {
    expect(expiredDlcNote(rows({ expiryDate: day("2026-10-09") }, {}, { receivedAt: new Date("2026-10-10T10:00:00.000Z") }))).toBe(
      "DLC dépassée le 09/10/2026"
    );
    expect(expiredDlcNote(rows({ expiryDate: day("2026-10-10") }, {}, { receivedAt: new Date("2026-10-10T10:00:00.000Z") }))).toBeNull();
  });
});

describe("C3 — emballage / contenant (C4 on a water sample)", () => {
  it("waits for the tick, then reads Oui / Non", () => {
    expect(byCode(rows({}, { packagingOk: null }), "C3")).toMatchObject({
      n: 3,
      key: "EMBALLAGE",
      status: "A_CONFIRMER",
      detail: "Emballage d'origine fermé ou sachet stérile",
      rules: ["EMBALLAGE"],
    });
    expect(byCode(rows(), "C3")).toMatchObject({ status: "CONFORME" });
    expect(byCode(rows(), "C3")).not.toHaveProperty("reason");
    expect(byCode(rows({}, { packagingOk: false }), "C3")).toMatchObject({ status: "NON_CONFORME", reason: "EMBALLAGE" });
  });

  it("gives the hint of the kind of sample", () => {
    const hints: [LineKind, Family, string][] = [
      ["ALIMENT", "MICRO", "Emballage d'origine fermé ou sachet stérile"],
      ["SURFACE", "MICRO", "Écouvillon dans son tube avec diluant, non desséché"],
      ["MAINS", "MICRO", "Écouvillon dans son tube avec diluant, non desséché"],
      ["AIR", "MICRO", "Boîte fermée, gélose intacte"],
      ["EAU", "CHIMIE", "Flacon adapté"],
      ["EAU", "MICRO", "C4 : flacon stérile ; au thiosulfate si eau traitée (chlorée)"],
      ["AUTRE", "MICRO", "Contenant fermé et adapté à l'analyse"],
    ];
    for (const [kind, family, hint] of hints) {
      expect(packagingHint(kind, family)).toBe(hint);
      expect(byCode(rows({ lineKind: kind, family }), "C3").detail).toBe(hint);
    }
  });
});

describe("C5 — identification", () => {
  it("waits for the tick, then reads Oui / Non — a « Non » sends back to the fiche", () => {
    expect(byCode(rows({}, { identificationOk: null }), "C5")).toMatchObject({
      key: "IDENTIFICATION",
      status: "A_CONFIRMER",
      detail: "Désignation, lot et DLC lus sur l'échantillon, comparés à la fiche",
    });
    expect(byCode(rows({ lineKind: "SURFACE" }), "C5")).toMatchObject({
      status: "CONFORME",
      detail: "Désignation lue sur l'échantillon, comparée à la fiche",
    });
    expect(byCode(rows({}, { identificationOk: false }), "C5")).toMatchObject({
      status: "NON_CONFORME",
      reason: "IDENTIFICATION",
      detail: "Corriger la fiche avant de valider",
    });
  });
});

describe("the rows and the proposal", () => {
  it("lists the rows in code order, each with its code", () => {
    // C7 on food only.
    expect(rows().map((row) => row.code)).toEqual(["C1", "C2", "C3", "C5", "C7"]);
    expect(rows({ lineKind: "SURFACE" }).map((row) => row.code)).toEqual(["C1", "C2", "C3", "C5"]);
    expect(rows().every((row) => row.code && row.text)).toBe(true);
  });

  it("forces « non conforme » after the paper's rules, and blocks the sending while a tick is missing", () => {
    const paper = receptionChecklist(
      {
        lineKind: "ALIMENT",
        family: "MICRO",
        parameterNames: [],
        quantity: 250,
        quantityUnit: "G",
        receptionTemperature: 4,
        unitCount: 1,
        storageClass: null,
        productNames: ["Produit test"],
      },
      DEFAULT_THRESHOLDS,
      { exploitable: true }
    );
    expect(proposedConformity([...paper, ...rows({}, { packagingOk: false })])).toMatchObject({
      conformity: false,
      forced: true,
      rule: null,
      code: "C3",
      reason: "EMBALLAGE",
    });
    expect(proposedConformity([...paper, ...rows({}, { identificationOk: false })])).toMatchObject({ code: "C5", reason: "IDENTIFICATION" });
    expect(proposedConformity([...paper, ...rows({}, { packagingOk: null })])).toMatchObject({ forced: false, pending: true });
    expect(proposedConformity([...paper, ...rows()])).toMatchObject({ conformity: true, forced: false, pending: false });
  });

  it("words its refusals once", () => {
    expect(COMPLEMENTARY_MESSAGES.packagingMissing).toBe(
      "Indiquez si l'emballage est intact (rechargez la page si elle date d'avant la mise à jour)."
    );
    expect(complementaryRefusal(byCode(rows({}, { identificationOk: false }), "C5"))).toBe(
      "Contrôle C5 « Identification lisible et conforme à la fiche (désignation, lot, DLC) » non conforme — corriger la fiche avant de valider. L'échantillon ne peut pas être déclaré conforme."
    );
    // A detail opening on a code keeps its capitals (recette locale 10/10: « c4 : flacon… »).
    expect(complementaryRefusal(byCode(rows({ lineKind: "EAU", family: "MICRO" }, { packagingOk: false }), "C3"))).toBe(
      "Contrôle C3 « Emballage / contenant intact, fermé et adapté » non conforme — C4 : flacon stérile ; au thiosulfate si eau traitée (chlorée). L'échantillon ne peut pas être déclaré conforme."
    );
  });
});

describe("C6 — documents : protocole signé (the série's row, a visit only)", () => {
  it("is answered by the préleveur's photo", () => {
    const row = signedProtocolRow({ hasPhoto: true, received: null });
    expect(row).toMatchObject({ code: "C6", status: "CONFORME", detail: "Photo jointe" });
    expect(checklistRowLabel(row)).toBe("C6 Documents : protocole signé par l'interlocuteur");
    // A photo wins over any answer.
    expect(signedProtocolRow({ hasPhoto: true, received: false }).status).toBe("CONFORME");
  });

  it("without a photo: Oui conforme, Non « à vérifier » (never a refusal), nothing « à confirmer »", () => {
    expect(signedProtocolRow({ hasPhoto: false, received: true })).toMatchObject({
      status: "CONFORME",
      detail: "Protocole papier signé reçu",
    });
    expect(signedProtocolRow({ hasPhoto: false, received: false })).toMatchObject({
      status: "A_VERIFIER",
      detail: "Protocole signé non reçu : à réclamer à l'interlocuteur",
    });
    expect(signedProtocolRow({ hasPhoto: false, received: null })).toMatchObject({ status: "A_CONFIRMER" });
    // No motif: C6 never proposes a sample's non-conformity.
    expect(signedProtocolRow({ hasPhoto: false, received: false })).not.toHaveProperty("reason");
  });

  it("stores the answer of a visit without a photo only", () => {
    expect(storedSignedProtocolAnswer("VISITE", false, true)).toBe(true);
    expect(storedSignedProtocolAnswer("VISITE", false, false)).toBe(false);
    expect(storedSignedProtocolAnswer("VISITE", false, null)).toBeNull();
    expect(storedSignedProtocolAnswer("VISITE", true, false)).toBeNull();
    expect(storedSignedProtocolAnswer("DEPOT", false, true)).toBeNull();
    expect(storedSignedProtocolAnswer(undefined, false, true)).toBeNull();
  });
});
