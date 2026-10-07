import { describe, expect, it } from "vitest";
import { correctionBody, correctionValues, type VerbSample } from "./sample-verbs-logic";
import { validateIntake, type IntakeCurrent } from "@/lib/intake-input";

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
  surfaceLabel: null,
  surfaceAreaCm2: null,
  surfaceState: null,
  personName: null,
  personRole: null,
  handsState: null,
  airMethod: null,
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
    productTemperature: null,
    ambientTemperature: null,
    surfaceLabel: sample.surfaceLabel,
    surfaceAreaCm2: sample.surfaceAreaCm2,
    surfaceState: sample.surfaceState ?? null,
    personName: sample.personName,
    personRole: sample.personRole,
    handsState: sample.handsState,
    airMethod: sample.airMethod ?? null,
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
    expect(Object.keys(body).sort()).toEqual(["lieu", "reason", "remarks", "surfaceAreaCm2", "surfaceLabel", "surfaceState", "unitCount"]);
    const checked = validateIntake(body, currentOf(sample));
    expect(checked).toMatchObject({ ok: true, value: { changes: { surfaceState: "NETTOYE" } } });
    // An old surface sample without a state may be corrected without one.
    const untouched = correctionBody("SURFACE", { ...correctionValues(sample), lieu: "Plonge" }, null, "lieu");
    expect(untouched).not.toHaveProperty("surfaceState");
    expect(validateIntake(untouched, currentOf(sample))).toMatchObject({ ok: true, value: { changes: { lieu: "Plonge" } } });
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
});
