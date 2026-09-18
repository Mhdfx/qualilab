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
  personName: null,
  personRole: null,
  handsState: null,
  remarks: null,
  unitCount: 5,
  productTypeId: null,
  parameterIds: ["p1", "p2"],
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
    expect(validateIntake({ parameterIds: [], reason: "x" }, current)).toMatchObject({ ok: false });
  });

  it("compares dates by day and clears a field with an empty string", () => {
    expect(validateIntake({ productionDate: "2026-09-01", reason: "x" }, current)).toMatchObject({ ok: false, error: "Aucune modification à enregistrer." });
    expect(validateIntake({ numeroLot: "", reason: "lot inconnu" }, current)).toMatchObject({ ok: true, value: { changes: { numeroLot: null } } });
  });
});
