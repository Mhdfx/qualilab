import { describe, it, expect } from "vitest";
import { validateParameter, parseLimit } from "./parameter-validation";

const valid = {
  name: "E. coli",
  category: "ALIMENTAIRE",
  unit: "UFC/g",
  threshold: "1.10² UFC/g",
  limitValue: 100,
  alertOnExceed: true,
};

describe("parseLimit", () => {
  it("reads a limit typed with a comma, as in French", () => {
    expect(parseLimit("1,5")).toBe(1.5);
    expect(parseLimit("100")).toBe(100);
    expect(parseLimit(0)).toBe(0);
  });

  it("treats an empty field as no limit defined", () => {
    expect(parseLimit("")).toBeNull();
    expect(parseLimit(null)).toBeNull();
    expect(parseLimit(undefined)).toBeNull();
  });

  it("refuses what cannot be a limit", () => {
    expect(parseLimit("abc")).toBe("invalid");
    expect(parseLimit(-1)).toBe("invalid");
    expect(parseLimit(Number.NaN)).toBe("invalid");
  });
});

describe("validateParameter", () => {
  it("accepts a well-formed parameter", () => {
    const result = validateParameter(valid);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toMatchObject({
        name: "E. coli",
        category: "ALIMENTAIRE",
        limitValue: 100,
        alertOnExceed: true,
      });
    }
  });

  it("requires a name and a real domain", () => {
    expect(validateParameter({ ...valid, name: "  " }).ok).toBe(false);
    expect(validateParameter({ ...valid, category: "AUTRE" }).ok).toBe(false);
  });

  it("refuses a sensitive parameter with no limit", () => {
    // Otherwise the system would promise an alert it can never raise.
    const result = validateParameter({
      ...valid,
      limitValue: "",
      alertOnExceed: true,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("limite");
  });

  it("allows no limit when no alert is expected", () => {
    const result = validateParameter({
      ...valid,
      limitValue: "",
      alertOnExceed: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.limitValue).toBeNull();
  });

  it("accepts a limit of zero, which means absence is required", () => {
    const result = validateParameter({ ...valid, name: "Salmonelles", limitValue: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.limitValue).toBe(0);
  });

  it("keeps empty optional fields as null rather than empty strings", () => {
    const result = validateParameter({
      ...valid,
      unit: "",
      threshold: "  ",
      alertOnExceed: false,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.unit).toBeNull();
      expect(result.value.threshold).toBeNull();
    }
  });

  it("treats a missing alert flag as not sensitive", () => {
    const result = validateParameter({ ...valid, alertOnExceed: undefined });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.alertOnExceed).toBe(false);
  });
});
