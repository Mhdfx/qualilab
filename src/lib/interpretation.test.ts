import { describe, expect, it } from "vitest";
import { applyUnitFactor, effectivePlan, fmt, interpret, legacyFailures, parseUnitReading, pickCriterion, planLabel, sampleVerdict, summariseReadings, unitStoredDisplay, verdictToConform, worstVerdict, type Plan } from "./interpretation";

const read = (...raws: string[]) => raws.map(parseUnitReading);
const threeClass: Plan = { n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 10_000 };

describe("parseUnitReading — what the technician types", () => {
  it("reads counts, dilutions, below-detection, absence and presence", () => {
    expect(parseUnitReading("1,2.10²")).toMatchObject({ value: 120, kind: "count" });
    expect(parseUnitReading("3(-2)")).toMatchObject({ value: 300, kind: "count" });
    expect(parseUnitReading("0(-1)")).toMatchObject({ value: 0, kind: "below" });
    expect(parseUnitReading("< 10")).toMatchObject({ value: 0, kind: "below" });
    expect(parseUnitReading("Absence")).toMatchObject({ detected: false, kind: "absence" });
    expect(parseUnitReading("Présence")).toMatchObject({ detected: true, kind: "presence" });
    expect(parseUnitReading("")).toMatchObject({ kind: "empty" });
    expect(parseUnitReading("??")).toMatchObject({ kind: "unreadable" });
  });
});

describe("interpret — the 3-class plan (n = 5, c = 2, m = 10², M = 10⁴)", () => {
  it("is satisfactory when every unit is at or below m", () => {
    const v = interpret(threeClass, read("< 10", "50", "1.10²", "0(-1)", "80"));
    expect(v.verdict).toBe("SATISFAISANT");
    expect(v.countBetween).toBe(0);
  });

  it("is acceptable with up to c units between m and M", () => {
    const v = interpret(threeClass, read("50", "5.10²", "3.10³", "10", "20"));
    expect(v).toMatchObject({ verdict: "ACCEPTABLE", countBetween: 2, countAboveM: 0 });
    expect(v.reason).toContain("c = 2");
  });

  it("is unsatisfactory with more than c units between m and M, or any unit above M", () => {
    expect(interpret(threeClass, read("500", "600", "700", "10", "10")).verdict).toBe("NON_SATISFAISANT");
    const above = interpret(threeClass, read("10", "10", "10", "10", "2.10⁴"));
    expect(above).toMatchObject({ verdict: "NON_SATISFAISANT", countAboveM: 1 });
    expect(above.reason).toContain("M = 1.10⁴");
  });

  it("treats a value equal to m or M as inside", () => {
    expect(interpret(threeClass, read("100", "100", "100", "100", "100")).verdict).toBe("SATISFAISANT");
    expect(interpret(threeClass, read("10000", "10", "10", "10", "10")).verdict).toBe("ACCEPTABLE");
  });

  it("is incomplete until the n units are read", () => {
    const v = interpret(threeClass, read("10", "10", "", "10"));
    expect(v).toMatchObject({ verdict: "INCOMPLET", missing: 2 });
  });
});

describe("interpret — the other plans", () => {
  it("absence: any presence fails", () => {
    const plan: Plan = { n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null };
    expect(interpret(plan, read("Absence", "Abs", "absence", "Absence", "Absence")).verdict).toBe("SATISFAISANT");
    expect(interpret(plan, read("Absence", "Présence", "Absence", "Absence", "Absence"))).toMatchObject({ verdict: "NON_SATISFAISANT", countAboveM: 1 });
  });

  it("m only and M only are two-class plans", () => {
    const mOnly: Plan = { n: 5, c: null, mKind: "VALUE", m: 1000, bigM: null };
    expect(interpret(mOnly, read("10", "999", "1000", "< 10", "0(-2)")).verdict).toBe("SATISFAISANT");
    expect(interpret(mOnly, read("10", "1001", "10", "10", "10")).verdict).toBe("NON_SATISFAISANT");
    const bigMOnly: Plan = { n: 5, c: null, mKind: "UNSPECIFIED", m: null, bigM: 100 };
    expect(interpret(bigMOnly, read("100", "1", "1", "1", "1")).verdict).toBe("SATISFAISANT");
    expect(interpret(bigMOnly, read("101", "1", "1", "1", "1")).verdict).toBe("NON_SATISFAISANT");
  });

  it("m and M without c: a unit between them is not tolerated", () => {
    const plan: Plan = { n: 5, c: null, mKind: "VALUE", m: 100, bigM: 1000 };
    expect(interpret(plan, read("500", "10", "10", "10", "10")).verdict).toBe("NON_SATISFAISANT");
    expect(interpret(plan, read("100", "10", "10", "10", "10")).verdict).toBe("SATISFAISANT");
  });

  it("a plan with n = 1 interprets a single reading", () => {
    const plan: Plan = { n: 1, c: null, mKind: "VALUE", m: 10, bigM: null };
    expect(interpret(plan, read("5")).verdict).toBe("SATISFAISANT");
    expect(interpret(plan, read("50")).verdict).toBe("NON_SATISFAISANT");
  });
});

describe("worstVerdict, verdictToConform, fmt", () => {
  it("keeps the worst verdict of a sample and maps it to the old boolean", () => {
    expect(worstVerdict(["SATISFAISANT", "ACCEPTABLE"])).toBe("ACCEPTABLE");
    expect(worstVerdict(["ACCEPTABLE", "NON_SATISFAISANT", "SATISFAISANT"])).toBe("NON_SATISFAISANT");
    expect(worstVerdict(["SATISFAISANT", "INCOMPLET"])).toBe("INCOMPLET");
    expect(worstVerdict([])).toBeNull();
    expect(verdictToConform("ACCEPTABLE")).toBe(true);
    expect(verdictToConform("NON_SATISFAISANT")).toBe(false);
    expect(verdictToConform("INCOMPLET")).toBeNull();
  });

  it("prints limits in the lab's notation", () => {
    expect(fmt(100)).toBe("1.10²");
    expect(fmt(1_500_000)).toBe("1,5.10⁶");
    expect(fmt(30)).toBe("30");
    expect(fmt(0)).toBe("0");
  });
});

describe("the helpers the screens share", () => {
  it("prints the plan the way the workbook writes it", () => {
    expect(planLabel({ ...threeClass, unit: "ufc/g" })).toBe("m = 1.10² · M = 1.10⁴ ufc/g · c = 2");
    expect(planLabel({ n: 5, c: null, mKind: "ABSENCE", m: null, bigM: null, unit: "/25g" })).toBe("Absence /25g");
    expect(planLabel({ n: 5, c: null, mKind: "UNSPECIFIED", m: null, bigM: 1000 })).toBe("M = 1.10³");
    expect(planLabel({ n: 5, c: null, mKind: "VALUE", m: 100, bigM: null })).toBe("≤ 1.10²");
  });

  it("judges on the units actually taken", () => {
    expect(effectivePlan(threeClass, 3)).toEqual({ ...threeClass, n: 3, c: 2 });
    expect(effectivePlan(threeClass, 1)).toEqual({ ...threeClass, n: 1, c: 0 });
    expect(effectivePlan(threeClass, 9)).toEqual(threeClass);
  });

  it("summarises the line by its worst unit", () => {
    expect(summariseReadings(read("< 10", "1,5.10³", "50"))).toEqual({ value: "1,5.10³", numeric: 1500 });
    expect(summariseReadings(read("Absence", "Absence"))).toEqual({ value: "Absence", numeric: 0 });
    expect(summariseReadings(read("Absence", "Présence"))).toEqual({ value: "Présence", numeric: null });
    expect(summariseReadings(read("< 10", "0(-1)"))).toEqual({ value: "< 10", numeric: 0 });
    expect(summariseReadings(read("", "??"))).toEqual({ value: null, numeric: null });
  });

  it("prefers the norm version in force", () => {
    const old = { ...threeClass, normVersion: { current: false, version: "2009" } };
    const current = { ...threeClass, normVersion: { current: true, version: "2017" } };
    expect(pickCriterion([old, current])).toBe(current);
    expect(pickCriterion([old, { ...threeClass, normVersion: { current: false, version: "2020" } }])?.normVersion?.version).toBe("2020");
    expect(pickCriterion([])).toBeNull();
  });
});

describe("the sample's verdict", () => {
  it("is the worst of its germs and never ignores a legacy non-conform line", () => {
    expect(sampleVerdict([{ interpretation: "SATISFAISANT", conform: true }, { interpretation: "ACCEPTABLE", conform: true }])).toBe("ACCEPTABLE");
    expect(sampleVerdict([{ interpretation: "SATISFAISANT", conform: true }, { interpretation: null, conform: false }])).toBe("NON_SATISFAISANT");
    expect(sampleVerdict([{ interpretation: null, conform: true }])).toBeNull();
    expect(sampleVerdict([])).toBeNull();
    expect(legacyFailures([{ interpretation: null, conform: false }, { interpretation: "NON_SATISFAISANT", conform: false }])).toHaveLength(1);
  });
});

describe("dilution and printing of a unit", () => {
  it("multiplies a count by the parameter's factor, and only a count", () => {
    expect(applyUnitFactor(parseUnitReading("25"), 10)).toMatchObject({ value: 250 });
    expect(applyUnitFactor(parseUnitReading("< 10"), 10)).toMatchObject({ value: 0, kind: "below" });
    expect(applyUnitFactor(parseUnitReading("Absence"), 10)).toMatchObject({ detected: false });
    expect(applyUnitFactor(parseUnitReading("25"), 1)).toMatchObject({ value: 25 });
  });

  it("prints the count, the word or the detection limit", () => {
    expect(unitStoredDisplay({ rawValue: "3(-2)", value: 300, detected: null })).toBe("3.10²");
    expect(unitStoredDisplay({ rawValue: "0(-1)", value: 0, detected: null })).toBe("< 10");
    expect(unitStoredDisplay({ rawValue: "< 10", value: 0, detected: null })).toBe("< 10");
    expect(unitStoredDisplay({ rawValue: "Absence", value: null, detected: false })).toBe("Absence");
    expect(unitStoredDisplay({ rawValue: "Présence", value: null, detected: true })).toBe("Présence");
  });

  it("carries the mantissa instead of printing « 10.10² »", () => {
    expect(fmt(995)).toBe("1.10³");
    expect(fmt(95)).toBe("95");
    expect(fmt(1_500_000)).toBe("1,5.10⁶");
  });
});
