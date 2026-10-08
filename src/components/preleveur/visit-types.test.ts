import { describe, expect, it } from "vitest";
import type { Family, LineKind, SampleType } from "@/generated/prisma/enums";
import {
  applyProfilePatch,
  availableFamilies,
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
  visibleParameters,
  type LineDraft,
  type NatureOption,
  type ParameterOption,
} from "./visit-types";

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
    const hands = { ...base, lineKind: "MAINS" as const, personName: "Personne test" };
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
    // §8.5: no « T° produit » on an air line — a value typed before the switch is dropped.
    expect(linePayload({ ...food, productTemperature: "4", lineKind: "AIR" }).productTemperature).toBe("");
    expect(linePayload({ ...food, productTemperature: "4" }).productTemperature).toBe("4");
    expect(linePayload({ ...food, lineKind: "MAINS", handsState: "" }).handsState).toBeUndefined();
  });
});

describe("lineDesignation", () => {
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
