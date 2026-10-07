import { describe, expect, it } from "vitest";
import { validateIntake, type IntakeCurrent } from "./intake-input";

const current: IntakeCurrent = {
  lineKind: "ALIMENT",
  produit: "Salade Gaillardière",
  lieu: "Poste salades",
  numeroLot: "L-2409",
  productionDate: new Date("2026-09-01T00:00:00"),
  expiryDate: new Date("2026-09-05T00:00:00"),
  quantity: 250,
  quantityUnit: "G",
  productTemperature: 1,
  ambientTemperature: 2,
  surfaceLabel: null,
  surfaceAreaCm2: null,
  surfaceState: null,
  personName: null,
  personRole: null,
  handsState: null,
  airMethod: null,
  remarks: null,
  unitCount: 5,
  productTypeId: null,
  parameterIds: ["p1", "p2"],
};

/** A surface line as entered since RETOUR-LABO-06-10.md §5 (V2). */
const surface: IntakeCurrent = {
  ...current,
  lineKind: "SURFACE",
  produit: null,
  numeroLot: null,
  productionDate: null,
  expiryDate: null,
  quantity: null,
  quantityUnit: null,
  productTemperature: null,
  ambientTemperature: null,
  surfaceLabel: "Planche verte",
  surfaceAreaCm2: 100,
  surfaceState: "EN_COURS_DE_TRAVAIL",
  unitCount: 1,
};

/** The same line entered before the state existed: no state, no area. */
const oldSurface: IntakeCurrent = { ...surface, surfaceState: null, surfaceAreaCm2: null };

/** An air line (V4). */
const air: IntakeCurrent = {
  ...surface,
  lineKind: "AIR",
  produit: "Salle de découpe",
  surfaceLabel: null,
  surfaceAreaCm2: null,
  surfaceState: null,
  airMethod: "BOITE_EXPOSEE_30MIN",
};

describe("validateIntake", () => {
  it("keeps only what actually changed, with the reason", () => {
    const result = validateIntake({ numeroLot: "L-2410", produit: "Salade Gaillardière", reason: "Erreur de lot sur le protocole" }, current);
    expect(result).toEqual({
      ok: true,
      value: { changes: { numeroLot: "L-2410" }, parameterIds: null, reason: "Erreur de lot sur le protocole" },
    });
  });

  it("needs a reason and refuses a correction that changes nothing", () => {
    expect(validateIntake({ numeroLot: "L-2410" }, current)).toMatchObject({ ok: false, error: "Indiquez le motif de la correction." });
    expect(validateIntake({ numeroLot: "L-2409", reason: "rien" }, current)).toMatchObject({ ok: false, error: "Aucune modification à enregistrer." });
    expect(validateIntake(null, current)).toMatchObject({ ok: false, error: "Indiquez le motif de la correction." });
  });

  it("applies the line rules of the protocol", () => {
    expect(validateIntake({ produit: "", reason: "x" }, current)).toMatchObject({ ok: false, error: "Indiquez la désignation du produit." });
    expect(validateIntake({ expiryDate: "2026-08-01", reason: "x" }, current)).toMatchObject({ ok: false });
    expect(validateIntake({ unitCount: 9, reason: "histamine" }, current)).toMatchObject({ ok: true, value: { changes: { unitCount: 9 } } });
  });

  it("detects a change of analyses and ignores a reordered identical list", () => {
    expect(validateIntake({ parameterIds: ["p2", "p1"], reason: "x" }, current)).toMatchObject({ ok: false, error: "Aucune modification à enregistrer." });
    expect(validateIntake({ parameterIds: ["p1", "p3"], reason: "ajout Listeria" }, current)).toMatchObject({
      ok: true,
      value: { changes: {}, parameterIds: ["p1", "p3"] },
    });
    expect(validateIntake({ parameterIds: ["p1", "p1", "", 4, "p3"], reason: "doublons" }, current)).toMatchObject({
      ok: true,
      value: { parameterIds: ["p1", "p3"] },
    });
  });

  it("needs at least one analysis when the correction names them", () => {
    expect(validateIntake({ parameterIds: [], reason: "x" }, current)).toMatchObject({ ok: false, error: "Choisissez au moins une analyse." });
    expect(validateIntake({ parameterIds: "p1", reason: "x" }, current)).toMatchObject({ ok: false, error: "La liste des analyses est invalide." });
  });

  it("corrects a sample that has no analysis yet (the programme decides them)", () => {
    const bare = { ...current, parameterIds: [] };
    expect(validateIntake({ lieu: "Poste froid", reason: "lieu mal saisi" }, bare)).toMatchObject({
      ok: true,
      value: { changes: { lieu: "Poste froid" }, parameterIds: null },
    });
  });

  it("compares dates by day and clears a field with an empty string", () => {
    expect(validateIntake({ productionDate: "2026-09-01", reason: "x" }, current)).toMatchObject({ ok: false, error: "Aucune modification à enregistrer." });
    expect(validateIntake({ numeroLot: "", reason: "lot inconnu" }, current)).toMatchObject({ ok: true, value: { changes: { numeroLot: null } } });
  });
});

describe("validateIntake — a surface line (« Désignation », « Surface prélevée (cm²) », état)", () => {
  it("corrects the state of the surface, with the before/after the audit needs", () => {
    expect(validateIntake({ surfaceState: "NETTOYE", reason: "état mal coché" }, surface)).toEqual({
      ok: true,
      value: { changes: { surfaceState: "NETTOYE" }, parameterIds: null, reason: "état mal coché" },
    });
    expect(validateIntake({ surfaceState: "EN_COURS_DE_TRAVAIL", reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: "Aucune modification à enregistrer.",
    });
  });

  it("refuses an unknown state, and never empties a state once set", () => {
    expect(validateIntake({ surfaceState: "PROPRE", reason: "x" }, surface)).toMatchObject({ ok: false, error: "État de la surface inconnu." });
    expect(validateIntake({ surfaceState: 3, reason: "x" }, surface)).toMatchObject({ ok: false, error: "État de la surface inconnu." });
    for (const empty of ["", null]) {
      expect(validateIntake({ surfaceState: empty, reason: "x" }, surface)).toMatchObject({ ok: false, error: "Choisissez l'état de la surface." });
    }
  });

  it("lets a line entered before the state existed be corrected without one, or be given one", () => {
    expect(validateIntake({ lieu: "Cuisine froide", surfaceState: "", reason: "lieu" }, oldSurface)).toMatchObject({
      ok: true,
      value: { changes: { lieu: "Cuisine froide" } },
    });
    expect(validateIntake({ surfaceState: "ASEPTIQUE", reason: "état connu" }, oldSurface)).toMatchObject({
      ok: true,
      value: { changes: { surfaceState: "ASEPTIQUE" } },
    });
  });

  it("refuses a state on a line that is not a surface, and ignores an empty one", () => {
    expect(validateIntake({ surfaceState: "NETTOYE", reason: "x" }, current)).toMatchObject({
      ok: false,
      error: "L'état de la surface ne concerne qu'un échantillon de surface.",
    });
    expect(validateIntake({ surfaceState: "", numeroLot: "L-2410", reason: "lot" }, current)).toMatchObject({
      ok: true,
      value: { changes: { numeroLot: "L-2410" } },
    });
  });

  it("speaks of « Désignation » for what is sampled", () => {
    expect(validateIntake({ surfaceLabel: "  ", reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: "Indiquez la désignation de la surface.",
    });
    expect(validateIntake({ surfaceLabel: "x".repeat(192), reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: "La désignation de la surface est trop longue (191 caractères maximum).",
    });
    expect(validateIntake({ surfaceLabel: ["Pince"], reason: "x" }, surface)).toMatchObject({ ok: false, error: "La désignation est invalide." });
    expect(validateIntake({ surfaceLabel: " Pince ", reason: "x" }, surface)).toMatchObject({
      ok: true,
      value: { changes: { surfaceLabel: "Pince" } },
    });
  });

  it("speaks of « Surface prélevée (cm²) » for the area, 100 cm² when emptied", () => {
    for (const area of ["abc", 0, -5, 2.5, "12,5", 100_001, true]) {
      expect(validateIntake({ surfaceAreaCm2: area, reason: "x" }, surface)).toMatchObject({
        ok: false,
        error: "La surface prélevée (cm²) doit être un nombre entier positif, 100 000 au plus.",
      });
    }
    expect(validateIntake({ surfaceAreaCm2: "25", reason: "x" }, surface)).toMatchObject({ ok: true, value: { changes: { surfaceAreaCm2: 25 } } });
    expect(validateIntake({ surfaceAreaCm2: "", reason: "x" }, oldSurface)).toMatchObject({ ok: true, value: { changes: { surfaceAreaCm2: 100 } } });
  });

  it("leaves an old line's missing area alone when the correction does not touch it", () => {
    expect(validateIntake({ lieu: "Plonge", reason: "x" }, oldSurface)).toEqual({
      ok: true,
      value: { changes: { lieu: "Plonge" }, parameterIds: null, reason: "x" },
    });
  });
});

describe("validateIntake — an air line (« Méthode de prélèvement »)", () => {
  it("corrects the method", () => {
    expect(validateIntake({ airMethod: "BIOCOLLECTEUR", reason: "méthode" }, air)).toMatchObject({
      ok: true,
      value: { changes: { airMethod: "BIOCOLLECTEUR" } },
    });
  });

  it("refuses an unknown method, an emptied one, or a method on another kind of line", () => {
    expect(validateIntake({ airMethod: "ASPIRATION", reason: "x" }, air)).toMatchObject({ ok: false, error: "Méthode de prélèvement inconnue." });
    expect(validateIntake({ airMethod: "", reason: "x" }, air)).toMatchObject({ ok: false, error: "Choisissez la méthode de prélèvement." });
    expect(validateIntake({ airMethod: "BIOCOLLECTEUR", reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: "La méthode de prélèvement ne concerne qu'un échantillon d'air.",
    });
  });

  it("lets a line entered before the method existed be corrected without one", () => {
    expect(validateIntake({ lieu: "Salle blanche", reason: "lieu" }, { ...air, airMethod: null })).toMatchObject({
      ok: true,
      value: { changes: { lieu: "Salle blanche" } },
    });
  });
});

describe("validateIntake — old data stays as it was", () => {
  it("keeps the product type the programme gave a line that is not a food", () => {
    const water: IntakeCurrent = { ...air, lineKind: "EAU", airMethod: null, productTypeId: "type-eau" };
    // The screen sends every field back, the product type included.
    expect(validateIntake({ lieu: "Robinet cuisine", productTypeId: "type-eau", reason: "lieu" }, water)).toEqual({
      ok: true,
      value: { changes: { lieu: "Robinet cuisine" }, parameterIds: null, reason: "lieu" },
    });
    expect(validateIntake({ productTypeId: "", reason: "type retiré" }, water)).toMatchObject({
      ok: true,
      value: { changes: { productTypeId: null } },
    });
    expect(validateIntake({ productTypeId: 7, reason: "x" }, water)).toMatchObject({ ok: false, error: "Type de produit invalide." });
  });

  it("never empties a stored value the correction does not mention", () => {
    // A surface line imported with a product name: the kind's rule drops it,
    // the correction of another field must not.
    const imported: IntakeCurrent = { ...surface, produit: "Libellé repris" };
    expect(validateIntake({ lieu: "Laverie", reason: "x" }, imported)).toEqual({
      ok: true,
      value: { changes: { lieu: "Laverie" }, parameterIds: null, reason: "x" },
    });
  });

  it("keeps the designation of a food line that carried one", () => {
    const withSurface: IntakeCurrent = { ...current, surfaceLabel: "Plan de travail", surfaceAreaCm2: 50 };
    expect(validateIntake({ numeroLot: "L-2411", surfaceLabel: "Plan de travail", reason: "lot" }, withSurface)).toMatchObject({
      ok: true,
      value: { changes: { numeroLot: "L-2411" } },
    });
  });
});
