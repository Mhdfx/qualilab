import { describe, expect, it } from "vitest";
import {
  ANALYSES_FIELDS,
  analysesChangesOnly,
  correctionTouches,
  resultsToReset,
  validateIntake,
  type IntakeCurrent,
} from "./intake-input";
import { SERIE_MESSAGES } from "./serie-input";

const current: IntakeCurrent = {
  lineKind: "ALIMENT",
  produit: "Salade maison",
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
  surfaceAreaNote: null,
  surfaceState: null,
  personName: null,
  personRole: null,
  handsState: null,
  airMethod: null,
  airExposureMin: null,
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

/** An air line (V4), an exposed plate entered before its duration existed (16/10). */
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
    const result = validateIntake({ numeroLot: "L-2410", produit: "Salade maison", reason: "Erreur de lot sur le protocole" }, current);
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

/** A hands line (16/10, Q109): its person and its state. */
const hands: IntakeCurrent = {
  ...surface,
  lineKind: "MAINS",
  surfaceLabel: null,
  surfaceAreaCm2: null,
  surfaceState: null,
  personName: "Personne Test",
  handsState: "NON_LAVEES",
};

describe("validateIntake — the state of the hands (16/10, Q109)", () => {
  it("changes a state for another of the list — an old « non lavées » included", () => {
    expect(validateIntake({ handsState: "ASEPTISEES", reason: "état" }, hands)).toEqual({
      ok: true,
      value: { changes: { handsState: "ASEPTISEES" }, parameterIds: null, reason: "état" },
    });
    expect(validateIntake({ handsState: "LAVEES", reason: "état" }, hands)).toMatchObject({
      ok: true,
      value: { changes: { handsState: "LAVEES" } },
    });
  });

  it("never empties a state once set", () => {
    for (const empty of ["", null]) {
      expect(validateIntake({ handsState: empty, reason: "x" }, hands)).toMatchObject({
        ok: false,
        error: SERIE_MESSAGES.handsStateMissing,
      });
    }
  });

  it("lets an old hands line without a state be corrected without one, or be given one", () => {
    const old: IntakeCurrent = { ...hands, handsState: null };
    expect(validateIntake({ lieu: "Plonge", reason: "lieu" }, old)).toEqual({
      ok: true,
      value: { changes: { lieu: "Plonge" }, parameterIds: null, reason: "lieu" },
    });
    expect(validateIntake({ lieu: "Plonge", handsState: "", reason: "lieu" }, old)).toMatchObject({ ok: true });
    expect(validateIntake({ handsState: "ASEPTISEES", reason: "état connu" }, old)).toMatchObject({
      ok: true,
      value: { changes: { handsState: "ASEPTISEES" } },
    });
  });

  it("refuses an unknown state, or a state on another kind of line", () => {
    expect(validateIntake({ handsState: "PROPRES", reason: "x" }, hands)).toMatchObject({ ok: false, error: "État des mains inconnu." });
    expect(validateIntake({ handsState: "LAVEES", reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: "L'état des mains ne concerne qu'un échantillon de mains.",
    });
  });
});

describe("validateIntake — the temperatures (P9, 16/10)", () => {
  it("corrects them, decimal comma accepted, within −80…300 °C", () => {
    expect(validateIntake({ productTemperature: "4,5", ambientTemperature: "2", reason: "T°" }, current)).toMatchObject({
      ok: true,
      value: { changes: { productTemperature: 4.5 } },
    });
    expect(validateIntake({ ambientTemperature: "301", reason: "x" }, current)).toMatchObject({
      ok: false,
      error: "La température ambiante doit être un nombre plausible (−80 à 300 °C).",
    });
  });

  it("never empties a temperature that was recorded", () => {
    for (const empty of ["", "  ", null]) {
      expect(validateIntake({ productTemperature: empty, reason: "x" }, current)).toMatchObject({
        ok: false,
        error: "La température au prélèvement a été relevée : corrigez sa valeur, elle ne peut pas être effacée.",
      });
      expect(validateIntake({ ambientTemperature: empty, reason: "x" }, current)).toMatchObject({
        ok: false,
        error: "La T° ambiante a été relevée : corrigez sa valeur, elle ne peut pas être effacée.",
      });
    }
  });

  it("lets an old line without temperatures be corrected without them, or be given them", () => {
    // `surface` carries none: the visit's required ambient temperature is never asked here.
    expect(validateIntake({ lieu: "Plonge", productTemperature: "", ambientTemperature: "", reason: "lieu" }, surface)).toEqual({
      ok: true,
      value: { changes: { lieu: "Plonge" }, parameterIds: null, reason: "lieu" },
    });
    expect(validateIntake({ ambientTemperature: "0", reason: "T°" }, surface)).toMatchObject({
      ok: true,
      value: { changes: { ambientTemperature: 0 } },
    });
  });
});

describe("validateIntake — the surface's « Autre » (16/10, Q114)", () => {
  it("a text replaces the area, which stays empty — never the 100 cm² default", () => {
    expect(validateIntake({ surfaceAreaCm2: "", surfaceAreaNote: " couteau entier ", reason: "autre" }, surface)).toEqual({
      ok: true,
      value: { changes: { surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" }, parameterIds: null, reason: "autre" },
    });
    // Only the text sent: it replaces the stored area all the same.
    expect(validateIntake({ surfaceAreaNote: "poignée de porte", reason: "autre" }, surface)).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: null, surfaceAreaNote: "poignée de porte" } },
    });
  });

  it("refuses an area and a text together", () => {
    expect(validateIntake({ surfaceAreaCm2: "50", surfaceAreaNote: "couteau entier", reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: SERIE_MESSAGES.surfaceAreaBoth,
    });
  });

  it("an area typed replaces the text; neither gives 100 cm²; an untouched text stays", () => {
    const noted: IntakeCurrent = { ...surface, surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" };
    expect(validateIntake({ surfaceAreaCm2: "50", surfaceAreaNote: "", reason: "aire" }, noted)).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: 50, surfaceAreaNote: null } },
    });
    // A page opened before 16/10 sends the area alone: it replaces the text too.
    expect(validateIntake({ surfaceAreaCm2: "1000", reason: "aire" }, noted)).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: 1000, surfaceAreaNote: null } },
    });
    expect(validateIntake({ surfaceAreaCm2: "", surfaceAreaNote: "", reason: "aire" }, noted)).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: 100, surfaceAreaNote: null } },
    });
    expect(validateIntake({ lieu: "Plonge", reason: "lieu" }, noted)).toEqual({
      ok: true,
      value: { changes: { lieu: "Plonge" }, parameterIds: null, reason: "lieu" },
    });
  });

  it("refuses a text too long, of the wrong type, or on a line that is not a surface", () => {
    expect(validateIntake({ surfaceAreaNote: "x".repeat(192), reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: SERIE_MESSAGES.surfaceAreaNoteTooLong,
    });
    expect(validateIntake({ surfaceAreaNote: 12, reason: "x" }, surface)).toMatchObject({ ok: false });
    expect(validateIntake({ surfaceAreaNote: "couteau", reason: "x" }, current)).toMatchObject({
      ok: false,
      error: "La précision « Autre » ne concerne qu'un échantillon de surface.",
    });
  });
});

describe("validateIntake — the exposed plate's duration (16/10, Q50)", () => {
  const plate: IntakeCurrent = { ...air, airExposureMin: 30 };

  it("corrects the duration, a whole number of minutes from 1 to 480", () => {
    expect(validateIntake({ airExposureMin: "45", reason: "durée" }, plate)).toEqual({
      ok: true,
      value: { changes: { airExposureMin: 45 }, parameterIds: null, reason: "durée" },
    });
    for (const wrong of ["0", "481", "12,5", "abc", true]) {
      expect(validateIntake({ airExposureMin: wrong, reason: "x" }, plate)).toMatchObject({
        ok: false,
        error: SERIE_MESSAGES.airExposureInvalid,
      });
    }
  });

  it("never empties a recorded duration; an old plate stays correctable without one, or is given one", () => {
    expect(validateIntake({ airExposureMin: "", reason: "x" }, plate)).toMatchObject({
      ok: false,
      error: SERIE_MESSAGES.airExposureMissing,
    });
    // `air` is a plate entered before the duration: it reads 30 min.
    expect(validateIntake({ lieu: "Couloir", airExposureMin: "", reason: "lieu" }, air)).toEqual({
      ok: true,
      value: { changes: { lieu: "Couloir" }, parameterIds: null, reason: "lieu" },
    });
    expect(validateIntake({ airExposureMin: "60", reason: "durée" }, air)).toMatchObject({
      ok: true,
      value: { changes: { airExposureMin: 60 } },
    });
  });

  it("follows the method: another method carries none, a plate just chosen needs one", () => {
    expect(validateIntake({ airMethod: "BIOCOLLECTEUR", reason: "méthode" }, plate)).toMatchObject({
      ok: true,
      value: { changes: { airMethod: "BIOCOLLECTEUR", airExposureMin: null } },
    });
    const bio: IntakeCurrent = { ...air, airMethod: "BIOCOLLECTEUR" };
    expect(validateIntake({ airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "", reason: "x" }, bio)).toMatchObject({
      ok: false,
      error: SERIE_MESSAGES.airExposureMissing,
    });
    expect(validateIntake({ airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "20", reason: "méthode" }, bio)).toMatchObject({
      ok: true,
      value: { changes: { airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: 20 } },
    });
  });

  it("refuses a duration on a line that is not an air sample", () => {
    expect(validateIntake({ airExposureMin: "30", reason: "x" }, surface)).toMatchObject({
      ok: false,
      error: "La durée d'exposition ne concerne qu'un échantillon d'air.",
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
    expect(validateIntake({ productTypeId: 7, reason: "x" }, water)).toMatchObject({ ok: false, error: "Famille de produits invalide." });
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

/** What a checked correction changes, for `correctionTouches`. */
function checkedOf(body: Record<string, unknown>, row: IntakeCurrent = current) {
  const result = validateIntake(body, row);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("correctionTouches — which half of the fiche a correction changes (16/10, Q128)", () => {
  it("names the analyses' fields: the product type and the number of units, with the list", () => {
    expect([...ANALYSES_FIELDS]).toEqual(["productTypeId", "unitCount"]);
  });

  it("the list of analyses, the product type or the units: the analyses", () => {
    for (const body of [
      { parameterIds: ["p1"], reason: "analyse non faite" },
      { parameterIds: ["p1", "p2", "p3"], reason: "analyse oubliée" },
      { unitCount: 3, reason: "unités" },
      { productTypeId: "type-1", reason: "famille" },
    ]) {
      expect(correctionTouches(body, checkedOf(body)), JSON.stringify(body)).toEqual({ analyses: true, identification: false });
    }
  });

  it("an identification field: the identification", () => {
    const body = { numeroLot: "L-2410", reason: "lot" };
    expect(correctionTouches(body, checkedOf(body))).toEqual({ analyses: false, identification: true });
    const both = { numeroLot: "L-2410", parameterIds: ["p1"], reason: "lot et analyse" };
    expect(correctionTouches(both, checkedOf(both))).toEqual({ analyses: true, identification: true });
  });

  it("what the screen sends back unchanged touches nothing", () => {
    const body = { lieu: "Poste salades", unitCount: 5, productTypeId: null, parameterIds: ["p2", "p1"], numeroLot: "L-2410", reason: "lot" };
    expect(correctionTouches(body, checkedOf(body))).toEqual({ analyses: false, identification: true });
  });

  it("a stored value the line rules tidy on the way, unsent, is nobody's change — and is not written for the analyses' half", () => {
    // An old row whose place carries stray spaces: the protocol's rules trim it.
    const untidy: IntakeCurrent = { ...current, lieu: "  Poste salades  " };
    const body = { unitCount: 3, reason: "unités" };
    const checked = checkedOf(body, untidy);
    expect(checked.changes).toEqual({ unitCount: 3, lieu: "Poste salades" });
    expect(correctionTouches(body, checked)).toEqual({ analyses: true, identification: false });
    expect(analysesChangesOnly(checked.changes)).toEqual({ unitCount: 3 });
  });

  it("a field decided by another one counts with it: the unit with its quantity", () => {
    const body = { quantity: "300", reason: "quantité" };
    expect(correctionTouches(body, checkedOf(body))).toEqual({ analyses: false, identification: true });
  });
});

describe("resultsToReset — what a correction does to the results (16/10, Q91)", () => {
  it("a withdrawal, and nothing else, deletes the withdrawn analyses' results only", () => {
    expect(resultsToReset(["p1", "p2", "p3"], ["p1", "p3"], false)).toEqual({ kind: "removed", parameterIds: ["p2"] });
    expect(resultsToReset(["p1", "p2", "p3"], ["p3"], false)).toEqual({ kind: "removed", parameterIds: ["p1", "p2"] });
  });

  it("an added analysis empties every result, a withdrawal with it too", () => {
    expect(resultsToReset(["p1", "p2"], ["p1", "p2", "p3"], false)).toEqual({ kind: "all" });
    expect(resultsToReset(["p1", "p2"], ["p1", "p3"], false)).toEqual({ kind: "all" });
  });

  it("another product type or number of units empties every result, whatever the list", () => {
    expect(resultsToReset(["p1", "p2"], null, true)).toEqual({ kind: "all" });
    expect(resultsToReset(["p1", "p2"], ["p1"], true)).toEqual({ kind: "all" });
  });

  it("an untouched list, or the same list in another order, keeps every result", () => {
    expect(resultsToReset(["p1", "p2"], null, false)).toEqual({ kind: "none" });
    expect(resultsToReset(["p1", "p2"], ["p2", "p1"], false)).toEqual({ kind: "none" });
  });

  it("decides on the list as it stands under the lock: an analysis the programme added meanwhile is not « removed »", () => {
    // The page read [p1, p2]; the programme now holds [p1, p2, p4]; the
    // correction keeps [p1]: p2 and p4 go, the others' readings stay.
    expect(resultsToReset(["p1", "p2", "p4"], ["p1"], false)).toEqual({ kind: "removed", parameterIds: ["p2", "p4"] });
  });
});
