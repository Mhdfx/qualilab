import { describe, it, expect } from "vitest";
import { applyCalcFactor, parseLabValue, suggestConformity, formatLabValue } from "./result-value";

/**
 * Reading a bench value is the single most consequential function here: it
 * decides conformity, and it decides whether a contamination alert reaches the
 * client. A misread digit is a wrong verdict on a food sample.
 */
describe("parseLabValue", () => {
  it("reads the notation from the client's own alert email", () => {
    // 8,9.10² and 3.10² against a limit of 1.10², from the mail of 17/08/2026.
    expect(parseLabValue("8,9.10²").numeric).toBe(890);
    expect(parseLabValue("3.10²").numeric).toBe(300);
    expect(parseLabValue("1.10²").numeric).toBe(100);
  });

  it("accepts the other ways a technician writes a power of ten", () => {
    expect(parseLabValue("1,5 x 10^4").numeric).toBe(15000);
    expect(parseLabValue("1.5x10^4").numeric).toBe(15000);
    expect(parseLabValue("10^3").numeric).toBe(1000);
    expect(parseLabValue("2.5e3").numeric).toBe(2500);
  });

  it("reads plain numbers, with the comma as decimal separator", () => {
    expect(parseLabValue("150").numeric).toBe(150);
    expect(parseLabValue("0").numeric).toBe(0);
    expect(parseLabValue("12,5").numeric).toBe(12.5);
  });

  it("treats an absence as zero, however it is written", () => {
    for (const written of ["Absence", "absence /25 g", "ND", "néant", "abs"]) {
      const parsed = parseLabValue(written);
      expect(parsed.numeric, written).toBe(0);
      expect(parsed.kind, written).toBe("absence");
    }
  });

  it("treats a below-detection reading as zero but flags it as such", () => {
    const parsed = parseLabValue("< 10");
    expect(parsed.numeric).toBe(0);
    // Flagged so the interface can say "sous le seuil de détection" rather
    // than claiming an exact count of zero.
    expect(parsed.kind).toBe("below");
  });

  it("never guesses at something it cannot read", () => {
    for (const written of ["", "   ", "à refaire", "voir cahier", "??"]) {
      const parsed = parseLabValue(written);
      expect(parsed.numeric, written).toBeNull();
      expect(parsed.kind, written).toBe("unreadable");
    }
  });

  it("is not confused by surrounding spaces", () => {
    expect(parseLabValue("  8,9.10²  ").numeric).toBe(890);
  });
});

describe("suggestConformity", () => {
  it("is conform at or below the limit, not above", () => {
    expect(suggestConformity(50, 100)).toBe(true);
    expect(suggestConformity(100, 100)).toBe(true);
    expect(suggestConformity(101, 100)).toBe(false);
    expect(suggestConformity(890, 100)).toBe(false);
  });

  it("treats a zero limit as requiring absence", () => {
    expect(suggestConformity(0, 0)).toBe(true);
    expect(suggestConformity(1, 0)).toBe(false);
  });

  it("decides nothing when the value or the limit is unknown", () => {
    // The technician is asked instead — the system must not invent a verdict.
    expect(suggestConformity(null, 100)).toBeNull();
    expect(suggestConformity(50, null)).toBeNull();
    expect(suggestConformity(50, undefined)).toBeNull();
  });
});

describe("formatLabValue", () => {
  it("writes a count back the way the laboratory writes it", () => {
    expect(formatLabValue(890)).toBe("8,9.10²");
    expect(formatLabValue(300)).toBe("3.10²");
    expect(formatLabValue(100)).toBe("1.10²");
    expect(formatLabValue(15000)).toBe("1,5.10⁴");
  });

  it("leaves small numbers alone", () => {
    expect(formatLabValue(50)).toBe("50");
    expect(formatLabValue(0)).toBe("0");
  });

  it("round-trips through the parser", () => {
    for (const value of [890, 300, 100, 15000, 50, 0]) {
      expect(parseLabValue(formatLabValue(value)).numeric, String(value)).toBe(
        value
      );
    }
  });
});

/**
 * The calculation factor (dilution) turns the bench reading into the final
 * value — awaiting the lab's official formulas, the mechanism must already be
 * exact: it decides what the report prints and what an alert compares.
 */
describe("applyCalcFactor", () => {
  it("multiplies a plain reading by the factor", () => {
    const parsed = parseLabValue("8,9.10²");
    expect(applyCalcFactor(parsed, 10).numeric).toBe(8900);
    expect(applyCalcFactor(parsed, 10).kind).toBe("number");
  });

  it("leaves the reading untouched at factor 1 — today's default", () => {
    const parsed = parseLabValue("450");
    expect(applyCalcFactor(parsed, 1)).toEqual(parsed);
  });

  it("keeps Absence and < detections at zero whatever the factor", () => {
    expect(applyCalcFactor(parseLabValue("Absence"), 100).numeric).toBe(0);
    expect(applyCalcFactor(parseLabValue("< 10"), 100).numeric).toBe(0);
    expect(applyCalcFactor(parseLabValue("< 10"), 100).kind).toBe("below");
  });

  it("never turns an unreadable entry into a number", () => {
    const parsed = parseLabValue("illisible???");
    expect(applyCalcFactor(parsed, 10).numeric).toBeNull();
  });

  it("ignores a nonsensical factor rather than corrupting the value", () => {
    const parsed = parseLabValue("100");
    expect(applyCalcFactor(parsed, 0).numeric).toBe(100);
    expect(applyCalcFactor(parsed, Number.NaN).numeric).toBe(100);
    expect(applyCalcFactor(parsed, -5).numeric).toBe(100);
  });

  it("changes the conformity verdict exactly as a dilution would", () => {
    // Raw 50 is under a limit of 100 — but at ×10 the final 500 is over it.
    const parsed = parseLabValue("50");
    expect(suggestConformity(parsed.numeric, 100)).toBe(true);
    expect(suggestConformity(applyCalcFactor(parsed, 10).numeric, 100)).toBe(false);
  });
});
