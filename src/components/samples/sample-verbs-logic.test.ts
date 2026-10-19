import { describe, expect, it } from "vitest";
import { cancelReasonsFor, correctionBody, correctionFields, correctionValues, type VerbSample } from "./sample-verbs-logic";
import { validateIntake, type IntakeCurrent } from "@/lib/intake-input";
import { HANDS_STATE_CHOICES, SURFACE_AREA_CHOICES } from "@/lib/labels";

/**
 * « Corriger la fiche » ↔ `PATCH /api/samples/[id]/intake`: the body the
 * dialog builds for each kind of sample is accepted by the API's own
 * validator, and never carries a field of another kind
 * (RETOUR-LABO-06-10.md §5, V2 and V4). Invented designations only.
 */

const base: VerbSample = {
  id: "s1",
  code: "1/26-1",
  controlCode: "10/26",
  status: "RECU",
  type: "ALIMENTAIRE",
  lineKind: "ALIMENT",
  produit: "Salade test",
  lieu: "Cuisine",
  numeroLot: "L1",
  productionDate: "2026-10-01T00:00:00.000Z",
  expiryDate: "2026-10-09T00:00:00.000Z",
  quantity: 250,
  quantityUnit: "G",
  productTemperature: null,
  ambientTemperature: null,
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
  unitCount: 1,
  parameterIds: ["p1"],
  productTypeId: null,
  clientId: "c1",
};

function currentOf(sample: VerbSample): IntakeCurrent {
  return {
    lineKind: sample.lineKind,
    produit: sample.produit,
    lieu: sample.lieu,
    numeroLot: sample.numeroLot,
    productionDate: sample.productionDate ? new Date(sample.productionDate) : null,
    expiryDate: sample.expiryDate ? new Date(sample.expiryDate) : null,
    quantity: sample.quantity,
    quantityUnit: sample.quantityUnit,
    productTemperature: sample.productTemperature,
    ambientTemperature: sample.ambientTemperature,
    surfaceLabel: sample.surfaceLabel,
    surfaceAreaCm2: sample.surfaceAreaCm2,
    surfaceAreaNote: sample.surfaceAreaNote,
    surfaceState: sample.surfaceState ?? null,
    personName: sample.personName,
    personRole: sample.personRole,
    handsState: sample.handsState,
    airMethod: sample.airMethod ?? null,
    airExposureMin: sample.airExposureMin,
    remarks: sample.remarks,
    unitCount: sample.unitCount,
    productTypeId: sample.productTypeId,
    parameterIds: sample.parameterIds,
  };
}

describe("correctionBody against validateIntake", () => {
  it("surface: designation, state, area — accepted; nothing of another kind sent", () => {
    const sample: VerbSample = {
      ...base,
      type: "AMBIANCE",
      lineKind: "SURFACE",
      produit: null,
      numeroLot: null,
      productionDate: null,
      expiryDate: null,
      quantity: null,
      quantityUnit: null,
      surfaceLabel: "Planche verte",
      surfaceAreaCm2: 100,
      surfaceState: null,
    };
    const values = { ...correctionValues(sample), surfaceState: "NETTOYE" as const, surfaceAreaCm2: "" };
    const body = correctionBody("SURFACE", values, null, "état oublié");
    expect(Object.keys(body).sort()).toEqual([
      "ambientTemperature",
      "lieu",
      "productTemperature",
      "reason",
      "remarks",
      "surfaceAreaCm2",
      "surfaceAreaNote",
      "surfaceLabel",
      "surfaceState",
      "unitCount",
    ]);
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { surfaceState: "NETTOYE" } } });
    // An old surface sample without a state may be corrected without one.
    const untouched = correctionBody("SURFACE", { ...correctionValues(sample), lieu: "Plonge" }, null, "lieu");
    expect(untouched).not.toHaveProperty("surfaceState");
    expect(validateIntake(untouched, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
  });

  it("surface: each quick area (« 100 cm² », « 1000 cm² », 14/10) is sent as typed and accepted", () => {
    const sample: VerbSample = {
      ...base,
      type: "AMBIANCE",
      lineKind: "SURFACE",
      produit: null,
      quantity: null,
      quantityUnit: null,
      numeroLot: null,
      productionDate: null,
      expiryDate: null,
      surfaceLabel: "Planche verte",
      surfaceAreaCm2: 250,
      surfaceState: "NETTOYE",
    };
    expect(SURFACE_AREA_CHOICES).toEqual([100, 1000]);
    for (const area of SURFACE_AREA_CHOICES) {
      const body = correctionBody("SURFACE", { ...correctionValues(sample), surfaceAreaCm2: String(area) }, null, "aire");
      expect(body).toHaveProperty("surfaceAreaCm2", String(area));
      expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { surfaceAreaCm2: area } } });
    }
  });

  it("surface: renaming the designation keeps the stored state", () => {
    const sample: VerbSample = { ...base, type: "AMBIANCE", lineKind: "SURFACE", produit: null, quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, surfaceLabel: "Pince", surfaceAreaCm2: 100, surfaceState: "ASEPTIQUE" };
    const body = correctionBody("SURFACE", { ...correctionValues(sample), surfaceLabel: "Pince inox" }, null, "faute");
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { surfaceLabel: "Pince inox" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("surfaceState");
  });

  it("air: the method only, accepted", () => {
    const sample: VerbSample = { ...base, type: "AMBIANCE", lineKind: "AIR", produit: "Salle", quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, airMethod: null };
    const body = correctionBody("AIR", { ...correctionValues(sample), airMethod: "BIOCOLLECTEUR" }, null, "méthode");
    expect(body).toHaveProperty("airMethod", "BIOCOLLECTEUR");
    expect(body).not.toHaveProperty("surfaceLabel");
    expect(body).not.toHaveProperty("quantity");
    expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { airMethod: "BIOCOLLECTEUR" } } });
  });

  it("food: never sends surface, method or hands fields; an old surface label survives", () => {
    const sample: VerbSample = { ...base, surfaceLabel: "MAIN", surfaceAreaCm2: null };
    const body = correctionBody("ALIMENT", { ...correctionValues(sample), numeroLot: "L2" }, null, "lot");
    for (const key of ["surfaceLabel", "surfaceAreaCm2", "surfaceState", "airMethod", "personName", "handsState"]) {
      expect(body).not.toHaveProperty(key);
    }
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { numeroLot: "L2" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("surfaceLabel");
  });

  it("hands: person and state, accepted", () => {
    const sample: VerbSample = { ...base, type: "AMBIANCE", lineKind: "MAINS", produit: null, quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, personName: "Agent test", handsState: null };
    const body = correctionBody("MAINS", { ...correctionValues(sample), handsState: "LAVEES" }, ["p1", "p2"], "état");
    expect(body).toMatchObject({ personName: "Agent test", handsState: "LAVEES", parameterIds: ["p1", "p2"] });
    expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true });
  });

  const hands: VerbSample = {
    ...base,
    type: "AMBIANCE",
    lineKind: "MAINS",
    produit: null,
    quantity: null,
    quantityUnit: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    personName: "Personne Test",
    handsState: "NON_LAVEES",
  };

  it("hands (16/10, Q109): every state of the one list is accepted; an old « non lavées » becomes « aseptisées »", () => {
    expect(HANDS_STATE_CHOICES).toEqual(["ASEPTISEES", "NON_LAVEES", "LAVEES"]);
    for (const state of HANDS_STATE_CHOICES) {
      const body = correctionBody("MAINS", { ...correctionValues({ ...hands, handsState: null }), handsState: state }, null, "état");
      expect(validateIntake(body, currentOf({ ...hands, handsState: null }))).toMatchObject({
        ok: true,
        value: { changes: { handsState: state } },
      });
    }
    const body = correctionBody("MAINS", { ...correctionValues(hands), handsState: "ASEPTISEES" }, null, "état");
    expect(validateIntake(body, currentOf(hands))).toMatchObject({ ok: true, value: { changes: { handsState: "ASEPTISEES" } } });
  });

  it("hands: an empty state is not sent — the stored one stays; an old sample without one stays correctable", () => {
    const body = correctionBody("MAINS", { ...correctionValues(hands), handsState: "", lieu: "Plonge" }, null, "lieu");
    expect(body).not.toHaveProperty("handsState");
    const checked = validateIntake(body, currentOf(hands));
    expect(checked).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("handsState");
    const old = { ...hands, handsState: null };
    expect(
      validateIntake(correctionBody("MAINS", { ...correctionValues(old), lieu: "Plonge" }, null, "lieu"), currentOf(old))
    ).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
  });

  it("temperatures (P9, 16/10): shown with a decimal comma, corrected, never emptied once recorded", () => {
    const sample: VerbSample = { ...base, productTemperature: 4.5, ambientTemperature: 18 };
    expect(correctionValues(sample)).toMatchObject({ productTemperature: "4,5", ambientTemperature: "18" });
    const body = correctionBody("ALIMENT", { ...correctionValues(sample), productTemperature: "3,5" }, null, "T°");
    expect(validateIntake(body, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { productTemperature: 3.5 } } });
    const emptied = correctionBody("ALIMENT", { ...correctionValues(sample), ambientTemperature: "" }, null, "T°");
    expect(validateIntake(emptied, currentOf(sample))).toMatchObject({ ok: false, error: expect.stringContaining("T° ambiante") });
    // An old sample without them: correctable as it is, and they may be added.
    expect(
      validateIntake(correctionBody("ALIMENT", { ...correctionValues(base), lieu: "Plonge" }, null, "lieu"), currentOf(base))
    ).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
    expect(
      validateIntake(correctionBody("ALIMENT", { ...correctionValues(base), ambientTemperature: "0" }, null, "T°"), currentOf(base))
    ).toMatchObject({ ok: true, value: { changes: { ambientTemperature: 0 } } });
    expect(
      validateIntake(correctionBody("ALIMENT", { ...correctionValues(base), productTemperature: "301" }, null, "T°"), currentOf(base))
    ).toMatchObject({ ok: false });
  });

  it("temperatures: the air sends its ambient one only", () => {
    expect(correctionFields("AIR").productTemperature).toBe(false);
    expect(correctionFields("SURFACE").productTemperature).toBe(true);
    const air: VerbSample = { ...base, type: "AMBIANCE", lineKind: "AIR", produit: "Salle", quantity: null, quantityUnit: null, numeroLot: null, productionDate: null, expiryDate: null, airMethod: "BIOCOLLECTEUR" };
    const body = correctionBody("AIR", { ...correctionValues(air), ambientTemperature: "21" }, null, "T°");
    expect(body).not.toHaveProperty("productTemperature");
    expect(validateIntake(body, currentOf(air))).toMatchObject({ ok: true, value: { changes: { ambientTemperature: 21 } } });
  });

  const swab: VerbSample = {
    ...base,
    type: "AMBIANCE",
    lineKind: "SURFACE",
    produit: null,
    quantity: null,
    quantityUnit: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    surfaceLabel: "Couteau",
    surfaceAreaCm2: 100,
    surfaceState: "NETTOYE",
  };

  it("surface « Autre » (16/10, Q114): a text replaces the area, and the area comes back", () => {
    const body = correctionBody("SURFACE", { ...correctionValues(swab), surfaceAreaCm2: "couteau entier" }, null, "autre");
    expect(body).toMatchObject({ surfaceAreaCm2: "", surfaceAreaNote: "couteau entier" });
    expect(validateIntake(body, currentOf(swab))).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" } },
    });
    const noted: VerbSample = { ...swab, surfaceAreaCm2: null, surfaceAreaNote: "couteau entier" };
    // The dialog opens on the text, and sending it unchanged changes nothing else.
    expect(correctionValues(noted).surfaceAreaCm2).toBe("couteau entier");
    const kept = correctionBody("SURFACE", { ...correctionValues(noted), lieu: "Plonge" }, null, "lieu");
    expect(validateIntake(kept, currentOf(noted))).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
    const back = correctionBody("SURFACE", { ...correctionValues(noted), surfaceAreaCm2: "1000" }, null, "aire");
    expect(validateIntake(back, currentOf(noted))).toMatchObject({
      ok: true,
      value: { changes: { surfaceAreaCm2: 1000, surfaceAreaNote: null } },
    });
  });

  const plate: VerbSample = {
    ...base,
    type: "AMBIANCE",
    lineKind: "AIR",
    produit: "Salle",
    quantity: null,
    quantityUnit: null,
    numeroLot: null,
    productionDate: null,
    expiryDate: null,
    airMethod: "BOITE_EXPOSEE_30MIN",
    airExposureMin: 30,
  };

  it("air (16/10, Q50): the plate's duration is sent with the plate only, and corrected", () => {
    const body = correctionBody("AIR", { ...correctionValues(plate), airExposureMin: "45" }, null, "durée");
    expect(body).toMatchObject({ airMethod: "BOITE_EXPOSEE_30MIN", airExposureMin: "45" });
    expect(validateIntake(body, currentOf(plate))).toMatchObject({ ok: true, value: { changes: { airExposureMin: 45 } } });
    const bio = correctionBody("AIR", { ...correctionValues(plate), airMethod: "BIOCOLLECTEUR" }, null, "méthode");
    expect(bio).not.toHaveProperty("airExposureMin");
    expect(validateIntake(bio, currentOf(plate))).toMatchObject({
      ok: true,
      value: { changes: { airMethod: "BIOCOLLECTEUR", airExposureMin: null } },
    });
  });

  it("air: an old plate without a duration stays correctable without one", () => {
    const old: VerbSample = { ...plate, airExposureMin: null };
    expect(correctionValues(old).airExposureMin).toBe("");
    const body = correctionBody("AIR", { ...correctionValues(old), lieu: "Couloir" }, null, "lieu");
    const checked = validateIntake(body, currentOf(old));
    expect(checked).toMatchObject({ ok: true, value: { changes: { lieu: "Couloir" } } });
    if (checked.ok) expect(checked.value.changes).not.toHaveProperty("airExposureMin");
  });
});

describe("cancelReasonsFor — the motifs « Annuler » offers", () => {
  it("offers « Non reçu au laboratoire » on a sample still waiting for its reception only", () => {
    expect(cancelReasonsFor("PRELEVE")).toContain("NON_RECU");
    for (const status of ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as const) {
      expect(cancelReasonsFor(status)).not.toContain("NON_RECU");
    }
  });

  it("never offers « Détruit à réception », the reception's own verb", () => {
    expect(cancelReasonsFor("PRELEVE")).not.toContain("DETRUIT_A_RECEPTION");
    expect(cancelReasonsFor("RECU")).toEqual(["NON_EXPLOITABLE", "QUANTITE_INSUFFISANTE", "DOUBLON", "ANNULATION_CLIENT", "AUTRE"]);
  });
});
