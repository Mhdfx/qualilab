import { describe, expect, it } from "vitest";
import { formatLabNumber, parseLabNumber } from "./counters";

describe("lab numbers « NNNN/AA »", () => {
  it("formats the sequence with a two-digit year", () => {
    expect(formatLabNumber(2780, 2026)).toBe("2780/26");
    expect(formatLabNumber(20353, 2026)).toBe("20353/26");
    expect(formatLabNumber(1, 2027)).toBe("1/27");
    expect(formatLabNumber(12, 2030)).toBe("12/30");
  });

  it("parses the lab's own writing, spaces tolerated", () => {
    expect(parseLabNumber("2772/26")).toEqual({ sequence: 2772, year: 2026 });
    expect(parseLabNumber(" 20459 / 26 ")).toEqual({ sequence: 20459, year: 2026 });
  });

  it("rejects anything that is not a lab number", () => {
    expect(parseLabNumber("QLC-2026-00010")).toBeNull();
    expect(parseLabNumber("2772/2026")).toBeNull();
    expect(parseLabNumber("0/26")).toBeNull();
    expect(parseLabNumber("Salade")).toBeNull();
    expect(parseLabNumber("")).toBeNull();
  });

  it("round-trips", () => {
    const n = parseLabNumber(formatLabNumber(4321, 2026));
    expect(n).toEqual({ sequence: 4321, year: 2026 });
  });
});
