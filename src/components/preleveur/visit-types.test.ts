import { describe, expect, it } from "vitest";
import type { Family, LineKind, SampleType } from "@/generated/prisma/enums";
import {
  airMethodPatch,
  applyProfilePatch,
  availableFamilies,
  draftLineDetails,
  draftSurfaceAreaText,
  duplicateDraft,
  emptyLine,
  familiesPatch,
  familyStatus,
  isProfileApplied,
  kindCategory,
  kindPatch,
  lineCategory,
  lineDesignation,
  lineDraftError,
  lineFamilies,
  lineNatureIds,
  linePayload,
  primaryNature,
  resolveFamilies,
  serieAnalyses,
  surfaceAreaChoice,
  surfaceAreaPayload,
  visibleParameters,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
} from "./visit-types";
import { HANDS_STATE_CHOICES, SURFACE_AREA_CHOICES } from "@/lib/labels";
import { SERIE_MESSAGES, validateLine } from "@/lib/serie-input";

/**
 * RETOUR-LABO-06-10.md §5 — the sample card's rules: the nature follows the
 * type × the ticked boxes (V3), the surface's state (V2) and the air's
 * method (V4). An invented catalogue; no real client nor analysis list.
 */

const nature = (
  code: string,
  family: Family,
  defaultLineKind: LineKind,
  legacyType: SampleType
): NatureOption => ({ id: `nat-${code.toLowerCase()}`, code, label: `Nature ${code}`, family, defaultLineKind, legacyType });

const NATURES: NatureOption[] = [
  nature("MICRO_ALIMENTS", "MICRO", "ALIMENT", "ALIMENTAIRE"),
  nature("PC_ALIMENTS", "CHIMIE", "ALIMENT", "ALIMENTAIRE"),
  nature("MICRO_SURFACES", "MICRO", "SURFACE", "AMBIANCE"),
  nature("PC_SURFACES", "CHIMIE", "SURFACE", "AMBIANCE"),
  nature("MICRO_EAUX", "MICRO", "EAU", "EAU"),
  nature("PC_EAUX", "CHIMIE", "EAU", "EAU"),
  nature("MICRO_AIR", "MICRO", "AIR", "AMBIANCE"),
  nature("PC_AIR", "CHIMIE", "AIR", "AMBIANCE"),
  nature("MICRO_AUTRE", "MICRO", "AUTRE", "AMBIANCE"),
  nature("EFFET_ASEPTISANT", "CHIMIE", "AUTRE", "AMBIANCE"),
  nature("NATURE_FINE_TEST", "MICRO", "ALIMENT", "ALIMENTAIRE"),
];
const byCode = (code: string) => NATURES.find((n) => n.code === code)!;

/** Invented analyses of the food category: two micro, one physico-chemical. */
const FOOD_PARAMETERS: ParameterOption[] = [
  { id: "p-micro-1", name: "Paramètre micro 1", family: "MICRO" },
  { id: "p-micro-2", name: "Paramètre micro 2", family: "MICRO" },
  { id: "p-chimie-1", name: "Paramètre chimie 1", family: "CHIMIE" },
  { id: "p-autre-1", name: "Paramètre autre 1", family: "AUTRE" },
];

function line(patch: Partial<LineDraft> = {}): LineDraft {
  return { ...emptyLine(NATURES), ...patch };
}

describe("the two boxes", () => {
  it("offer both boxes on every type, and grey out the natures the catalogue lacks", () => {
    // « Mains du personnel » takes physico-chimie since the 08/10 feedback (§9.2).
    expect(familyStatus(NATURES, "MAINS", "CHIMIE")).toBe("OK");
    expect(familyStatus(NATURES, "MAINS", "MICRO")).toBe("OK");
    expect(availableFamilies(NATURES, "MAINS")).toEqual(["MICRO", "CHIMIE"]);
    // Air and « Autre » take both families since the 08/10 feedback (§8.2).
    expect(familyStatus(NATURES, "AIR", "CHIMIE")).toBe("OK");
    expect(familyStatus(NATURES, "AUTRE", "MICRO")).toBe("OK");
    expect(availableFamilies(NATURES, "AIR")).toEqual(["MICRO", "CHIMIE"]);
    expect(availableFamilies(NATURES, "AUTRE")).toEqual(["MICRO", "CHIMIE"]);
    // A database not migrated yet greys them out as missing, not as forbidden.
    const before = NATURES.filter((n) => n.code !== "PC_AIR" && n.code !== "MICRO_AUTRE");
    expect(familyStatus(before, "AIR", "CHIMIE")).toBe("MISSING");
    expect(familyStatus(before, "AUTRE", "MICRO")).toBe("MISSING");
    const withoutPcSurfaces = NATURES.filter((n) => n.code !== "PC_SURFACES");
    expect(familyStatus(withoutPcSurfaces, "SURFACE", "CHIMIE")).toBe("MISSING");
    expect(availableFamilies(withoutPcSurfaces, "SURFACE")).toEqual(["MICRO"]);
  });

  it("default to micro on every type, « Autre » included (08/10)", () => {
    expect(resolveFamilies(NATURES, "ALIMENT")).toEqual(["MICRO"]);
    expect(resolveFamilies(NATURES, "AUTRE")).toEqual(["MICRO"]);
    expect(resolveFamilies(NATURES, "AUTRE", ["CHIMIE"])).toEqual(["CHIMIE"]);
    expect(resolveFamilies(NATURES, "EAU", ["CHIMIE", "MICRO"])).toEqual(["MICRO", "CHIMIE"]);
    expect(resolveFamilies(NATURES, "AIR", ["CHIMIE"])).toEqual(["CHIMIE"]);
    expect(resolveFamilies(NATURES, "AIR")).toEqual(["MICRO"]);
    expect(resolveFamilies(NATURES, "MAINS")).toEqual(["MICRO"]);
    expect(resolveFamilies(NATURES, "MAINS", ["CHIMIE"])).toEqual(["CHIMIE"]);
  });

  it("derive the primary nature, micro first", () => {
    expect(primaryNature(NATURES, "EAU", ["CHIMIE", "MICRO"])?.code).toBe("MICRO_EAUX");
    expect(primaryNature(NATURES, "EAU", ["CHIMIE"])?.code).toBe("PC_EAUX");
    expect(primaryNature(NATURES, "AIR", [])).toBeUndefined();
    expect(primaryNature(NATURES, "AIR", ["CHIMIE"])?.code).toBe("PC_AIR");
    expect(primaryNature(NATURES, "AUTRE", ["MICRO", "CHIMIE"])?.code).toBe("MICRO_AUTRE");
    expect(lineNatureIds(NATURES, { lineKind: "ALIMENT", analysesMicro: true, analysesChimie: true })).toEqual([
      byCode("MICRO_ALIMENTS").id,
      byCode("PC_ALIMENTS").id,
    ]);
  });

  it("give the category to load the analyses with, even with no box ticked", () => {
    expect(kindCategory(NATURES, "MAINS")).toBe("AMBIANCE");
    expect(lineCategory(NATURES, { natureId: "", lineKind: "EAU" })).toBe("EAU");
    expect(lineCategory(NATURES, { natureId: byCode("PC_ALIMENTS").id, lineKind: "ALIMENT" })).toBe("ALIMENTAIRE");
  });

  it("an « Autre » line keeps ONE category whatever its boxes (§8.2: MICRO_AUTRE shares EFFET_ASEPTISANT's)", () => {
    // The line loads one parameter list; the server refuses an analysis of another domain.
    expect(kindCategory(NATURES, "AUTRE")).toBe("AMBIANCE");
    for (const natureId of [byCode("MICRO_AUTRE").id, byCode("EFFET_ASEPTISANT").id]) {
      expect(lineCategory(NATURES, { natureId, lineKind: "AUTRE" })).toBe("AMBIANCE");
    }
    expect(kindCategory(NATURES, "AIR")).toBe("AMBIANCE");
    expect(lineCategory(NATURES, { natureId: byCode("PC_AIR").id, lineKind: "AIR" })).toBe("AMBIANCE");
  });

  it("drop the analyses of an unticked box and follow with the nature", () => {
    const both = line({ analysesMicro: true, analysesChimie: true, parameterIds: ["p-micro-1", "p-chimie-1"] });
    const patch = familiesPatch(NATURES, both, ["CHIMIE"], FOOD_PARAMETERS);
    expect(patch).toMatchObject({
      analysesMicro: false,
      analysesChimie: true,
      natureId: byCode("PC_ALIMENTS").id,
      parameterIds: ["p-chimie-1"],
    });
    expect(familiesPatch(NATURES, both, [], FOOD_PARAMETERS)).toMatchObject({ natureId: "", parameterIds: [] });
  });

  it("let a hands sample tick both boxes (08/10, §9.2)", () => {
    const hands = line({ lineKind: "MAINS" });
    expect(familiesPatch(NATURES, hands, ["MICRO", "CHIMIE"])).toMatchObject({
      analysesMicro: true,
      analysesChimie: true,
      natureId: byCode("MICRO_SURFACES").id,
    });
  });

  it("let an air sample tick both boxes", () => {
    const air = line({ lineKind: "AIR" });
    expect(familiesPatch(NATURES, air, ["MICRO", "CHIMIE"])).toMatchObject({
      analysesMicro: true,
      analysesChimie: true,
      natureId: byCode("MICRO_AIR").id,
    });
    expect(lineNatureIds(NATURES, { lineKind: "AIR", analysesMicro: true, analysesChimie: true })).toEqual([
      byCode("MICRO_AIR").id,
      byCode("PC_AIR").id,
    ]);
  });

  it("make the série's boxes a summary of its samples", () => {
    expect(serieAnalyses([line(), line({ lineKind: "EAU", analysesMicro: false, analysesChimie: true })])).toEqual({
      analysesMicro: true,
      analysesChimie: true,
    });
    expect(serieAnalyses([])).toEqual({ analysesMicro: false, analysesChimie: false });
  });
});

describe("a new sample", () => {
  it("starts as a food sample in microbiology", () => {
    const first = emptyLine(NATURES);
    expect(first).toMatchObject({
      lineKind: "ALIMENT",
      analysesMicro: true,
      analysesChimie: false,
      natureId: byCode("MICRO_ALIMENTS").id,
      quantity: "1",
      surfaceState: "",
      airMethod: "",
      airExposureMin: "",
      handsState: "",
      parameterIds: [],
    });
  });

  it("continues the previous one: type, boxes, analyses, place and air method", () => {
    const previous = line({
      lineKind: "AIR",
      natureId: byCode("MICRO_AIR").id,
      lieu: "Salle de découpe",
      airMethod: "BIOCOLLECTEUR",
      parameterIds: ["p-air"],
      numeroLot: "L1",
    });
    expect(emptyLine(NATURES, previous)).toMatchObject({
      lineKind: "AIR",
      analysesMicro: true,
      natureId: byCode("MICRO_AIR").id,
      lieu: "Salle de découpe",
      airMethod: "BIOCOLLECTEUR",
      parameterIds: ["p-air"],
      numeroLot: "",
    });
    const surface = emptyLine(NATURES, line({ lineKind: "SURFACE", surfaceState: "NETTOYE" }));
    expect(surface).toMatchObject({ surfaceState: "", surfaceAreaCm2: "100" });
    // The physico-chimie box is never inherited (recette 07/10): the next sample starts on micro.
    const both = line({ analysesMicro: true, analysesChimie: true, parameterIds: ["p-micro-1"] });
    expect(emptyLine(NATURES, both)).toMatchObject({ analysesMicro: true, analysesChimie: false, parameterIds: [] });
  });

  it("gives no nature and no box when the catalogue is empty", () => {
    expect(emptyLine([])).toMatchObject({ natureId: "", analysesMicro: false, analysesChimie: false });
  });

  it("duplicates without lot nor dates, and gives a box to a copy that had none", () => {
    const source = line({ numeroLot: "L2", expiryDate: "2026-10-20", parameterIds: ["p-micro-1"] });
    const copy = duplicateDraft(source, NATURES);
    expect(copy.key).not.toBe(source.key);
    expect(copy).toMatchObject({ numeroLot: "", expiryDate: "", parameterIds: ["p-micro-1"], analysesMicro: true });
    copy.parameterIds.push("p-micro-2");
    expect(source.parameterIds).toEqual(["p-micro-1"]);
    const bare = duplicateDraft(line({ analysesMicro: false, natureId: "" }), NATURES);
    expect(bare).toMatchObject({ analysesMicro: true, natureId: byCode("MICRO_ALIMENTS").id });
  });
});

describe("changing the type", () => {
  it("keeps the ticked boxes the new type allows", () => {
    const both = line({ analysesChimie: true, parameterIds: ["p-micro-1"] });
    expect(kindPatch(NATURES, both, "EAU")).toMatchObject({
      lineKind: "EAU",
      analysesMicro: true,
      analysesChimie: true,
      natureId: byCode("MICRO_EAUX").id,
      parameterIds: [],
      quantityUnit: "L",
    });
    // Hands keep both boxes since 08/10 (§9.2).
    expect(kindPatch(NATURES, both, "MAINS")).toMatchObject({ analysesMicro: true, analysesChimie: true });
  });

  it("applies the new type's default when no ticked box remains", () => {
    const chimie = line({ analysesMicro: false, analysesChimie: true, natureId: byCode("PC_ALIMENTS").id });
    // Hands have a physico-chimie box since 08/10 (§9.2): the ticked box stays.
    expect(kindPatch(NATURES, chimie, "MAINS")).toMatchObject({
      analysesMicro: false,
      analysesChimie: true,
      natureId: byCode("PC_SURFACES").id,
    });
    // Air has a physico-chimie box since 08/10: the ticked box stays.
    expect(kindPatch(NATURES, chimie, "AIR")).toMatchObject({
      analysesMicro: false,
      analysesChimie: true,
      natureId: byCode("PC_AIR").id,
    });
  });

  it("keeps the microbiology box through a tap on « Autre » and back", () => {
    const autre = line({ ...kindPatch(NATURES, line(), "AUTRE") });
    expect(autre).toMatchObject({ analysesMicro: true, analysesChimie: false });
    expect(kindPatch(NATURES, autre, "ALIMENT")).toMatchObject({ analysesMicro: true, analysesChimie: false });
  });

  it("keeps the analyses within one category, filtered by box", () => {
    const surface = line({
      lineKind: "SURFACE",
      analysesMicro: true,
      analysesChimie: true,
      natureId: byCode("MICRO_SURFACES").id,
      parameterIds: ["s-micro", "s-chimie"],
      surfaceState: "ASEPTIQUE",
    });
    const params: ParameterOption[] = [
      { id: "s-micro", name: "Surface micro", family: "MICRO" },
      { id: "s-chimie", name: "Surface chimie", family: "CHIMIE" },
    ];
    // Hands keep both boxes since 08/10 (§9.2), hence both analyses.
    expect(kindPatch(NATURES, surface, "MAINS", { parameters: params })).toMatchObject({
      parameterIds: ["s-micro", "s-chimie"],
      surfaceState: "",
      surfaceAreaCm2: "",
    });
  });

  it("sets the area, clears the state, the method and the product type it does not show", () => {
    const food = line({ productTypeId: "type-1" });
    expect(kindPatch(NATURES, food, "SURFACE")).toMatchObject({ surfaceAreaCm2: "100", productTypeId: "" });
    const air = line({ lineKind: "AIR", airMethod: "BOITE_EXPOSEE_30MIN" });
    expect(kindPatch(NATURES, air, "EAU")).toMatchObject({ airMethod: "" });
    const water = line({ lineKind: "EAU", quantityUnit: "L" });
    expect(kindPatch(NATURES, water, "ALIMENT")).toMatchObject({ quantityUnit: "UNITE" });
    expect(kindPatch(NATURES, water, "ALIMENT", { fallbackUnit: "G" })).toMatchObject({ quantityUnit: "G" });
  });
});

describe("the surface area's quick choices (14/10: « 100 cm² » / « 1000 cm² »)", () => {
  it("names the chip a typed area equals, read the way the server reads it", () => {
    expect(surfaceAreaChoice("100")).toBe(100);
    expect(surfaceAreaChoice("1000")).toBe(1000);
    expect(surfaceAreaChoice(" 1000 ")).toBe(1000);
    expect(surfaceAreaChoice("1000,0")).toBe(1000);
    // Any other area is typed in the field and presses no chip.
    for (const other of ["250", "10000", "10", "", "  ", "cent"]) {
      expect(surfaceAreaChoice(other)).toBeNull();
    }
  });

  it("starts a new surface sample on the 100 cm² chip", () => {
    expect(surfaceAreaChoice(emptyLine(NATURES, line({ lineKind: "SURFACE" })).surfaceAreaCm2)).toBe(100);
    expect(surfaceAreaChoice(kindPatch(NATURES, line(), "SURFACE").surfaceAreaCm2 ?? "")).toBe(100);
  });

  it("keeps a chosen 1000 cm² through a mis-tap on another type, and drops the default 100", () => {
    const surface = line({
      lineKind: "SURFACE",
      natureId: byCode("MICRO_SURFACES").id,
      surfaceLabel: "Planche verte",
      surfaceAreaCm2: "1000",
    });
    const food = { ...surface, ...kindPatch(NATURES, surface, "ALIMENT") };
    expect(food.surfaceAreaCm2).toBe("1000");
    // Never sent on the food line…
    expect(linePayload(food).surfaceAreaCm2).toBe("");
    // …and back on the surface, the chosen area is still pressed.
    expect(kindPatch(NATURES, food, "SURFACE").surfaceAreaCm2).toBe("1000");
    const byDefault = { ...surface, surfaceAreaCm2: "100" };
    expect(kindPatch(NATURES, byDefault, "ALIMENT").surfaceAreaCm2).toBe("");
  });

  it("sends each choice as an area the server accepts", () => {
    const catalogue = new Map(NATURES.map((n) => [n.id, { ...n, active: true }]));
    for (const area of SURFACE_AREA_CHOICES) {
      const draft = line({
        ...kindPatch(NATURES, line(), "SURFACE"),
        lieu: "Cuisine",
        surfaceLabel: "Planche verte",
        surfaceState: "NETTOYE",
        surfaceAreaCm2: String(area),
        productTemperature: "4",
        ambientTemperature: "18",
      });
      expect(lineDraftError(draft, NATURES)).toBeNull();
      expect(validateLine(linePayload(draft), 0, catalogue)).toMatchObject({ ok: true, value: { surfaceAreaCm2: area } });
    }
  });
});

describe("analyses and profiles", () => {
  it("shows only the analyses of the ticked boxes", () => {
    expect(visibleParameters(FOOD_PARAMETERS, ["MICRO"]).map((p) => p.id)).toEqual(["p-micro-1", "p-micro-2"]);
    expect(visibleParameters(FOOD_PARAMETERS, ["CHIMIE"]).map((p) => p.id)).toEqual(["p-chimie-1"]);
    // A payload without the column counts as microbiology.
    expect(visibleParameters([{ id: "old", name: "Ancien" }], ["MICRO"])).toHaveLength(1);
  });

  it("applies a profile to its family only, and recognises it", () => {
    const both = line({ analysesChimie: true, parameterIds: ["p-micro-1", "p-chimie-1"] });
    const profile = { parameterIds: ["p-micro-2", "p-autre-1"], unitCount: 5 };
    const patch = applyProfilePatch(both, profile, FOOD_PARAMETERS);
    expect(patch).toEqual({ parameterIds: ["p-chimie-1", "p-micro-2"], unitCount: 5 });
    expect(isProfileApplied({ ...both, ...patch }, profile, FOOD_PARAMETERS)).toBe(true);
    expect(isProfileApplied(both, profile, FOOD_PARAMETERS)).toBe(false);
    // A profile whose analyses are all under an unticked box shows nothing.
    expect(isProfileApplied(line(), { parameterIds: ["p-chimie-1"] }, FOOD_PARAMETERS)).toBe(false);
  });
});

describe("before saving", () => {
  it("asks for a box, and for the fields of each type", () => {
    const base = line({ lieu: "Cuisine", produit: "Plat test" });
    expect(lineDraftError(base, NATURES)).toBeNull();
    expect(lineDraftError({ ...base, analysesMicro: false }, NATURES)).toMatch(/au moins une famille/);
    expect(lineDraftError({ ...base, lieu: " " }, NATURES)).toBe("Indiquez le lieu / la section.");
    expect(lineDraftError({ ...base, lieu: "" }, NATURES, { requirePlace: false })).toBeNull();
    const surface = { ...base, lineKind: "SURFACE" as const, surfaceLabel: "Planche verte" };
    expect(lineDraftError(surface, NATURES)).toBe("Choisissez l'état de la surface.");
    expect(lineDraftError({ ...surface, surfaceState: "NETTOYE" }, NATURES)).toBeNull();
    expect(lineDraftError({ ...surface, surfaceLabel: "" }, NATURES)).toBe("Indiquez la désignation de la surface.");
    const air = { ...base, lineKind: "AIR" as const };
    expect(lineDraftError(air, NATURES)).toBe("Choisissez la méthode de prélèvement de l'air.");
    expect(lineDraftError({ ...air, airMethod: "BIOCOLLECTEUR" }, NATURES)).toBeNull();
    expect(lineDraftError({ ...air, airMethod: "BIOCOLLECTEUR", analysesChimie: true }, NATURES)).toBeNull();
    const hands = { ...base, lineKind: "MAINS" as const, personName: "Personne test", handsState: "LAVEES" as const };
    expect(lineDraftError(hands, NATURES)).toBeNull();
    // Physico-chimie on hands since 08/10 (§9.2).
    expect(lineDraftError({ ...hands, analysesChimie: true }, NATURES)).toBeNull();
    // Analyses are no longer required (V6).
    expect(lineDraftError({ ...base, parameterIds: [] }, NATURES)).toBeNull();
  });

  it("sends only what the type shows", () => {
    const food = line({
      produit: "Plat test",
      surfaceLabel: "Planche",
      surfaceState: "NETTOYE",
      airMethod: "BIOCOLLECTEUR",
      personName: "Prénom Nom",
      productTypeId: "type-1",
    });
    const payload = linePayload(food);
    expect(payload).not.toHaveProperty("key");
    expect(payload).toMatchObject({ surfaceLabel: "", surfaceAreaCm2: "", personName: "", productTypeId: "type-1" });
    expect(payload.surfaceState).toBeUndefined();
    expect(payload.airMethod).toBeUndefined();
    const surface = linePayload({ ...food, lineKind: "SURFACE", surfaceAreaCm2: "100" });
    expect(surface).toMatchObject({
      surfaceLabel: "Planche",
      surfaceState: "NETTOYE",
      surfaceAreaCm2: "100",
      productTypeId: "",
    });
    expect(linePayload({ ...food, lineKind: "AIR" }).airMethod).toBe("BIOCOLLECTEUR");
    // §8.5: no « Température au prélèvement » on an air line — a value typed before the switch is dropped.
    expect(linePayload({ ...food, productTemperature: "4", lineKind: "AIR" }).productTemperature).toBe("");
    expect(linePayload({ ...food, productTemperature: "4" }).productTemperature).toBe("4");
    expect(linePayload({ ...food, lineKind: "MAINS", handsState: "" }).handsState).toBeUndefined();
  });

  it("sends no « Fonction » on a hands line any more (Q111, 16/10)", () => {
    const hands = line({
      ...kindPatch(NATURES, line(), "MAINS"),
      lieu: "Cuisine",
      personName: "Personne Test",
      handsState: "LAVEES",
    });
    expect(hands).not.toHaveProperty("personRole");
    const payload = linePayload(hands);
    expect(payload).toMatchObject({ lineKind: "MAINS", personName: "Personne Test", handsState: "LAVEES" });
    expect(payload).not.toHaveProperty("personRole");
    // The server still reads the line; the column stays empty on a new sample.
    const catalogue = new Map(NATURES.map((n) => [n.id, { ...n, active: true }]));
    expect(lineDraftError(hands, NATURES)).toBeNull();
    expect(validateLine(payload, 0, catalogue)).toMatchObject({
      ok: true,
      value: { personName: "Personne Test", personRole: null, handsState: "LAVEES" },
    });
  });
});

describe("the state of the hands (16/10, Q109)", () => {
  const hands = line({ lineKind: "MAINS", lieu: "Cuisine", personName: "Personne Test" });

  it("is required at creation, on the visit and at the counter", () => {
    expect(lineDraftError(hands, NATURES)).toBe(SERIE_MESSAGES.handsStateMissing);
    expect(lineDraftError({ ...hands, lieu: "" }, NATURES, { requirePlace: false })).toBe(SERIE_MESSAGES.handsStateMissing);
    for (const handsState of HANDS_STATE_CHOICES) {
      expect(lineDraftError({ ...hands, handsState }, NATURES)).toBeNull();
    }
  });

  it("each choice of the one list is sent and accepted by the server", () => {
    const catalogue = new Map(NATURES.map((n) => [n.id, { ...n, active: true }]));
    for (const handsState of HANDS_STATE_CHOICES) {
      const draft = line({ ...kindPatch(NATURES, line(), "MAINS"), lieu: "Cuisine", personName: "Personne Test", handsState });
      expect(validateLine(linePayload(draft), 0, catalogue)).toMatchObject({ ok: true, value: { handsState } });
    }
  });
});

describe("the T° ambiante on the visit (16/10, Q113)", () => {
  const food = line({ lieu: "Cuisine", produit: "Plat test" });

  it("is required on every type when the visit asks for it — the air included; « 0 » is a value", () => {
    const air = { ...food, lineKind: "AIR" as const, airMethod: "BIOCOLLECTEUR" as const };
    for (const draft of [food, air]) {
      expect(lineDraftError({ ...draft, ambientTemperature: " " }, NATURES, { requireAmbient: true })).toBe(
        SERIE_MESSAGES.ambientMissing
      );
      expect(lineDraftError({ ...draft, ambientTemperature: "0" }, NATURES, { requireAmbient: true })).toBeNull();
    }
  });

  it("stays optional at the counter (no option)", () => {
    expect(lineDraftError({ ...food, ambientTemperature: "" }, NATURES, { requirePlace: false })).toBeNull();
  });
});

describe("the surface's « Autre » (16/10, Q114)", () => {
  it("reads a number as an area, anything else as the text that replaces it", () => {
    expect(surfaceAreaPayload("couteau entier")).toEqual({ surfaceAreaCm2: "", surfaceAreaNote: "couteau entier" });
    expect(surfaceAreaPayload(" 50 ")).toEqual({ surfaceAreaCm2: "50", surfaceAreaNote: "" });
    expect(surfaceAreaPayload("1 000 cm²")).toEqual({ surfaceAreaCm2: "1000", surfaceAreaNote: "" });
    expect(surfaceAreaPayload("250 cm2")).toEqual({ surfaceAreaCm2: "250", surfaceAreaNote: "" });
    // A decimal stays an area: the server says it must be a whole number.
    expect(surfaceAreaPayload("12,5")).toEqual({ surfaceAreaCm2: "12,5", surfaceAreaNote: "" });
    expect(surfaceAreaPayload("  ")).toEqual({ surfaceAreaCm2: "", surfaceAreaNote: "" });
    expect(surfaceAreaPayload("2 poignées")).toEqual({ surfaceAreaCm2: "", surfaceAreaNote: "2 poignées" });
  });

  it("reads a thousands separator as one, never as a decimal mark: « 1.000 » is 1000 cm², not 1", () => {
    for (const typed of ["1.000", "1,000", "1 000", "1.000 cm²", "1,000 cm2"]) {
      expect(surfaceAreaPayload(typed), typed).toEqual({ surfaceAreaCm2: "1000", surfaceAreaNote: "" });
    }
    expect(surfaceAreaPayload("12.500")).toEqual({ surfaceAreaCm2: "12500", surfaceAreaNote: "" });
    expect(surfaceAreaChoice("1.000")).toBe(1000);
    // Not three digits after the mark: a decimal, refused by the server as not whole.
    expect(surfaceAreaPayload("1,5")).toEqual({ surfaceAreaCm2: "1,5", surfaceAreaNote: "" });
    expect(surfaceAreaPayload("0,100")).toEqual({ surfaceAreaCm2: "0,100", surfaceAreaNote: "" });
    const catalogue = new Map(NATURES.map((n) => [n.id, { ...n, active: true }]));
    const draft = line({
      ...kindPatch(NATURES, line(), "SURFACE"),
      lieu: "Cuisine",
      surfaceLabel: "Plan de travail",
      surfaceState: "NETTOYE",
      surfaceAreaCm2: "1.000",
    });
    expect(validateLine(linePayload(draft), 0, catalogue)).toMatchObject({ ok: true, value: { surfaceAreaCm2: 1000, surfaceAreaNote: null } });
  });

  it("reads « cm » without its ² as the unit too: « 250 cm » is an area, not a text", () => {
    expect(surfaceAreaPayload("250 cm")).toEqual({ surfaceAreaCm2: "250", surfaceAreaNote: "" });
    expect(surfaceAreaPayload("250cm")).toEqual({ surfaceAreaCm2: "250", surfaceAreaNote: "" });
    // A text ending on « cm » stays a text, whole.
    expect(surfaceAreaPayload("planche 30 x 40 cm")).toEqual({ surfaceAreaCm2: "", surfaceAreaNote: "planche 30 x 40 cm" });
  });

  it("presses no chip for a text, and the recap prints it in place of « N cm² »", () => {
    expect(surfaceAreaChoice("couteau entier")).toBeNull();
    expect(surfaceAreaChoice("1000 cm²")).toBe(1000);
    expect(draftSurfaceAreaText("couteau entier")).toBe("couteau entier");
    expect(draftSurfaceAreaText("100")).toBe("100 cm²");
    expect(draftSurfaceAreaText("")).toBeNull();
  });

  it("sends the text as `surfaceAreaNote` with no area — and the server keeps it so", () => {
    const catalogue = new Map(NATURES.map((n) => [n.id, { ...n, active: true }]));
    const draft = line({
      ...kindPatch(NATURES, line(), "SURFACE"),
      lieu: "Cuisine",
      surfaceLabel: "Couteau",
      surfaceState: "NETTOYE",
      surfaceAreaCm2: "couteau entier",
    });
    expect(lineDraftError(draft, NATURES)).toBeNull();
    const payload = linePayload(draft);
    expect(payload).toMatchObject({ surfaceAreaCm2: "", surfaceAreaNote: "couteau entier" });
    expect(validateLine(payload, 0, catalogue)).toMatchObject({
      ok: true,
      value: { surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" },
    });
    expect(lineDraftError({ ...draft, surfaceAreaCm2: "x".repeat(192) }, NATURES)).toBe(SERIE_MESSAGES.surfaceAreaNoteTooLong);
    // Never on another type.
    expect(linePayload({ ...draft, lineKind: "ALIMENT" })).toMatchObject({ surfaceAreaCm2: "", surfaceAreaNote: "" });
  });
});

describe("the exposed plate's duration (16/10, Q50)", () => {
  const air = line({ lineKind: "AIR", lieu: "Salle blanche", natureId: byCode("MICRO_AIR").id });

  it("proposes 30 minutes when the plate is picked, and keeps a duration typed", () => {
    expect(airMethodPatch(air, "BOITE_EXPOSEE_30MIN")).toEqual({ airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "30" });
    expect(airMethodPatch({ ...air, airExposureMin: "45" }, "BOITE_EXPOSEE_30MIN")).toEqual({
      airMethod: "BOITE_EXPOSEE_30MIN",
      airExposureMin: "45",
    });
    expect(airMethodPatch({ ...air, airExposureMin: "45" }, "BIOCOLLECTEUR")).toEqual({
      airMethod: "BIOCOLLECTEUR",
      airExposureMin: "45",
    });
  });

  it("is copied by the next air sample, with its method", () => {
    const previous = { ...air, airMethod: "BOITE_EXPOSEE_30MIN" as const, airExposureMin: "45" };
    expect(emptyLine(NATURES, previous)).toMatchObject({ airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "45" });
    expect(emptyLine(NATURES, line({ lieu: "Cuisine" }))).toMatchObject({ airMethod: "", airExposureMin: "" });
  });

  it("is required with the plate, a whole number of minutes from 1 to 480", () => {
    const plate = { ...air, airMethod: "BOITE_EXPOSEE_30MIN" as const };
    expect(lineDraftError({ ...plate, airExposureMin: "" }, NATURES)).toBe(SERIE_MESSAGES.airExposureMissing);
    for (const wrong of ["0", "481", "12,5", "trente"]) {
      expect(lineDraftError({ ...plate, airExposureMin: wrong }, NATURES)).toBe(SERIE_MESSAGES.airExposureInvalid);
    }
    expect(lineDraftError({ ...plate, airExposureMin: "45" }, NATURES)).toBeNull();
    expect(lineDraftError({ ...air, airMethod: "BIOCOLLECTEUR", airExposureMin: "" }, NATURES)).toBeNull();
  });

  it("is sent with the plate only, and the server keeps it", () => {
    const catalogue = new Map(NATURES.map((n) => [n.id, { ...n, active: true }]));
    const plate = { ...air, airMethod: "BOITE_EXPOSEE_30MIN" as const, airExposureMin: "45" };
    expect(linePayload(plate).airExposureMin).toBe("45");
    expect(validateLine(linePayload(plate), 0, catalogue)).toMatchObject({ ok: true, value: { airExposureMin: 45 } });
    expect(linePayload({ ...plate, airMethod: "BIOCOLLECTEUR" })).not.toHaveProperty("airExposureMin", "45");
    expect(linePayload({ ...plate, airMethod: "BIOCOLLECTEUR" }).airExposureMin).toBeUndefined();
    expect(linePayload({ ...plate, lineKind: "EAU" }).airExposureMin).toBeUndefined();
  });
});

describe("draftLineDetails — the « Vérifier » step's detail line", () => {
  const base = { lieu: "Cuisine", numeroLot: "", surfaceAreaCm2: "", productTemperature: "", ambientTemperature: "", handsState: "" as const, unitCount: 1 };

  it("shows the T° ambiante on every kind, air included, and the T° au prélèvement except on air", () => {
    expect(draftLineDetails({ ...base, lineKind: "ALIMENT", productTemperature: " 4 ", ambientTemperature: "21,5" })).toBe(
      "Cuisine · T° au prélèvement 4 °C · T° ambiante 21,5 °C"
    );
    expect(draftLineDetails({ ...base, lineKind: "AIR", productTemperature: "4", ambientTemperature: "0" })).toBe("Cuisine · T° ambiante 0 °C");
  });

  it("shows the hands' state on a hands line", () => {
    expect(draftLineDetails({ ...base, lineKind: "MAINS", handsState: "NON_LAVEES", ambientTemperature: "20" })).toBe(
      "Cuisine · mains en cours de travail · T° ambiante 20 °C"
    );
    expect(draftLineDetails({ ...base, lineKind: "ALIMENT", handsState: "LAVEES" })).toBe("Cuisine");
  });

  it("prints the 100 cm² the server stores when « Préciser » is left empty, and the lot and n", () => {
    expect(draftLineDetails({ ...base, lineKind: "SURFACE" })).toBe("Cuisine · 100 cm²");
    expect(draftLineDetails({ ...base, lineKind: "SURFACE", surfaceAreaCm2: "couteau entier" })).toBe("Cuisine · couteau entier");
    expect(draftLineDetails({ ...base, lineKind: "ALIMENT", numeroLot: "L12", unitCount: 5 })).toBe("Cuisine · lot L12 · n = 5");
  });
});

describe("lineDesignation", () => {
  it("reads a duration typed with a comma as the server does: « 45,0 » is 45 min", () => {
    expect(lineDesignation({ lineKind: "AIR", produit: "Salle", airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "45,0" })).toBe(
      "Salle — Boîte exposée 45 min"
    );
  });

  it("prints the plate's duration: « Boîte exposée 45 min », 30 min on an older plate", () => {
    expect(lineDesignation({ lineKind: "AIR", produit: "Salle", airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: 45 })).toBe(
      "Salle — Boîte exposée 45 min"
    );
    expect(lineDesignation({ lineKind: "AIR", produit: "Salle", airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "20" })).toBe(
      "Salle — Boîte exposée 20 min"
    );
    expect(lineDesignation({ lineKind: "AIR", produit: "Salle", airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: null })).toBe(
      "Salle — Boîte exposée 30 min"
    );
  });

  it("appends the surface's state and the air's method", () => {
    expect(lineDesignation({ lineKind: "SURFACE", surfaceLabel: "Planche verte", surfaceState: "NETTOYE" })).toBe(
      "Planche verte — surface nettoyée"
    );
    expect(lineDesignation({ lineKind: "AIR", produit: "Salle blanche", airMethod: "BOITE_EXPOSEE_30MIN" })).toBe(
      "Salle blanche — Boîte exposée 30 min"
    );
    expect(lineDesignation({ lineKind: "AIR", produit: "", airMethod: "BIOCOLLECTEUR" })).toBe("Air — Biocollecteur");
  });

  it("reads the samples saved before: no state, no method", () => {
    expect(lineDesignation({ lineKind: "SURFACE", surfaceLabel: "Pince", surfaceState: null })).toBe("Pince");
    expect(lineDesignation({ lineKind: "SURFACE", surfaceLabel: null })).toBe("Surface");
    expect(lineDesignation({ lineKind: "AIR", produit: null, airMethod: null })).toBe("—");
    expect(lineDesignation({ lineKind: "MAINS", personName: "Prénom Nom" })).toBe("Mains — Prénom Nom");
    expect(lineDesignation({ lineKind: "ALIMENT", produit: "Plat test", surfaceLabel: "Planche" })).toBe("Plat test");
  });
});

describe("lineFamilies", () => {
  it("lists the boxes micro first", () => {
    expect(lineFamilies({ analysesMicro: true, analysesChimie: true })).toEqual(["MICRO", "CHIMIE"]);
    expect(lineFamilies({ analysesMicro: false, analysesChimie: false })).toEqual([]);
  });
});
