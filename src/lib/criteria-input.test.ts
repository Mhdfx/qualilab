import { describe, expect, it } from "vitest";
import { validateCriterion, validateProductType } from "./criteria-input";

describe("validateProductType", () => {
  it("normalises the name and defaults the family", () => {
    expect(validateProductType({ name: "  Salades  avec source protéique ", clientId: "" })).toEqual({
      ok: true,
      value: { name: "Salades avec source protéique", normalizedName: "salades avec source proteique", family: "MICRO", clientId: null, active: true },
    });
    expect(validateProductType({ name: "" })).toMatchObject({ ok: false });
  });
});

describe("validateCriterion", () => {
  it("accepts a 3-class plan typed in the lab's notation", () => {
    expect(validateCriterion({ parameterId: "p1", n: "5", c: "2", mKind: "VALUE", m: "1.10²", bigM: "1,5.10⁴", unit: "ufc/g" })).toEqual({
      ok: true,
      value: { id: null, parameterId: "p1", normVersionId: null, unit: "ufc/g", n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 15_000, active: true },
    });
  });

  it("enforces the plan's coherence", () => {
    expect(validateCriterion({ parameterId: "p1", n: 5, c: 5, m: 10, bigM: 100 })).toMatchObject({ ok: false });
    expect(validateCriterion({ parameterId: "p1", m: 100, bigM: 10 })).toMatchObject({ ok: false, error: expect.stringContaining("M doit être") });
    expect(validateCriterion({ parameterId: "p1", mKind: "ABSENCE", m: 10 })).toMatchObject({ ok: false });
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED" })).toMatchObject({ ok: false });
    expect(validateCriterion({ parameterId: "p1", mKind: "VALUE" })).toMatchObject({ ok: false, error: expect.stringContaining("m est obligatoire") });
    expect(validateCriterion({ parameterId: "p1", m: 10, c: 1 })).toMatchObject({ ok: false });
    expect(validateCriterion({ parameterId: "p1", m: "abc" }, 3)).toMatchObject({ ok: false, error: expect.stringContaining("Ligne 3") });
  });

  it("accepts absence and M-only plans", () => {
    expect(validateCriterion({ parameterId: "p1", mKind: "ABSENCE", unit: "/25g" })).toMatchObject({ ok: true, value: { mKind: "ABSENCE", m: null, bigM: null, c: null } });
    expect(validateCriterion({ parameterId: "p1", mKind: "UNSPECIFIED", bigM: 1000 })).toMatchObject({ ok: true, value: { m: null, bigM: 1000 } });
  });
});
