import { describe, expect, it } from "vitest";
import {
  LEGACY_SIEGE,
  decimalsOf,
  formatLegacyNumber,
  formatLegacyReading,
  legacyCriterionText,
  legacyHistoryQueryString,
  legacyHistoryWhere,
  legacyLimit,
  legacyNonSatisfyingMark,
  legacyReadings,
  legacyResultInterpretation,
  legacySampleByIdWhere,
  legacyVerdict,
  parseLegacyHistoryFilters,
  parseLegacySampleId,
  storedReadings,
  superscript,
} from "./legacy-history";

/**
 * Lot 5B (RETOUR-LABO-20-11.md §6) — how the old software's history is read:
 * its verdict codes, how its readings print, and the queries that keep a
 * client's history to that client.
 */

const NBSP = " ";

describe("the old software's verdict codes (LES_CONCLUSION_ECHANTION)", () => {
  it("reads the codes of a sample and of a unit on our scale, in the old wording", () => {
    expect(legacyVerdict(2)).toEqual({ label: "Satisfaisant", interpretation: "SATISFAISANT" });
    expect(legacyVerdict(1)).toEqual({ label: "Acceptable", interpretation: "ACCEPTABLE" });
    expect(legacyVerdict(0)).toEqual({ label: "Non satisfaisant", interpretation: "NON_SATISFAISANT" });
    expect(legacyVerdict(5)).toEqual({ label: "Conforme", interpretation: "SATISFAISANT" });
    expect(legacyVerdict(4)).toEqual({ label: "Non conforme", interpretation: "NON_SATISFAISANT" });
    expect(legacyVerdict(10)?.interpretation).toBe("NON_SATISFAISANT");
    expect(legacyVerdict(11)?.interpretation).toBe("SATISFAISANT");
  });

  it("reads the « (inv.) » codes by their printed wording (hypothèse, compared with the signed reports in HA7)", () => {
    expect(legacyVerdict(16)?.interpretation).toBe("SATISFAISANT");
    expect(legacyVerdict(17)?.interpretation).toBe("NON_SATISFAISANT");
    expect(legacyVerdict(25)?.interpretation).toBe("ACCEPTABLE");
  });

  it("no verdict for a blank (100), an unknown code or none; a grade keeps its wording without a place on our scale", () => {
    expect(legacyVerdict(100)).toBeNull();
    expect(legacyVerdict(999)).toBeNull();
    expect(legacyVerdict(null)).toBeNull();
    expect(legacyVerdict(undefined)).toBeNull();
    expect(legacyVerdict(122)).toEqual({ label: "Vierge lampante", interpretation: null });
    expect(legacyVerdict(116)?.interpretation).toBe("NON_SATISFAISANT");
  });
});

describe("a reading as the report printed it", () => {
  it("the decimals of FORMAT_NUM: zeros are the minimum, every character the maximum", () => {
    expect(decimalsOf("0.###")).toEqual({ min: 0, max: 3 });
    expect(decimalsOf("0.0")).toEqual({ min: 1, max: 1 });
    expect(decimalsOf("0.#0")).toEqual({ min: 1, max: 2 });
    expect(decimalsOf(null)).toEqual({ min: 0, max: 4 });
    expect(decimalsOf("n'importe quoi")).toEqual({ min: 0, max: 4 });
    expect(formatLegacyNumber("21.24", decimalsOf("0.0"))).toBe("21,2");
    expect(formatLegacyNumber("7", decimalsOf("0.0"))).toBe("7,0");
    expect(formatLegacyNumber("0.2", decimalsOf(null))).toBe("0,2");
    expect(formatLegacyNumber("abc", decimalsOf(null))).toBeNull();
  });

  it("a power of ten in the lab's notation, one decimal kept", () => {
    expect(superscript(3)).toBe("³");
    expect(superscript(-1)).toBe("⁻¹");
    expect(formatLegacyReading({ v: "3", e: 3, k: 11 }, "0.###")).toBe("3,0.10³");
    expect(formatLegacyReading({ v: "1.7", e: 2, k: 11 }, null)).toBe("1,7.10²");
    expect(formatLegacyReading({ v: "5.3", e: 6, k: 11 }, "0.###")).toBe("5,3.10⁶");
  });

  it("an operator before the value, never wrapped alone; « NE » alone", () => {
    expect(formatLegacyReading({ v: "10", op: "<", k: 11 }, null)).toBe(`<${NBSP}10`);
    expect(formatLegacyReading({ v: "1", e: 1, op: "<", k: 11 }, null)).toBe(`<${NBSP}1,0.10¹`);
    expect(formatLegacyReading({ op: "NE", k: 11 }, null)).toBe("NE");
    expect(formatLegacyReading({ v: "3", op: "NE", k: 11 }, null)).toBe("NE");
    // A stray operator (« . », « 1 ») is no operator.
    expect(formatLegacyReading({ v: "4", op: ".", k: 11 }, null)).toBe("4");
  });

  it("a presence test, a text, nothing entered", () => {
    expect(formatLegacyReading({ k: 12, b: 21 }, null)).toBe("Absence");
    expect(formatLegacyReading({ k: 12, b: 22 }, null)).toBe("Présence");
    expect(formatLegacyReading({ k: 12, b: 23 }, null)).toBe("Non détecté");
    expect(formatLegacyReading({ k: 13, t: "Odeur caractéristique" }, null)).toBe("Odeur caractéristique");
    expect(formatLegacyReading({ k: 11 }, null)).toBeNull();
  });
});

describe("an analysis' verdict from its units — never softened", () => {
  it("one unit, or all alike: that verdict", () => {
    expect(legacyResultInterpretation([2])).toBe("SATISFAISANT");
    expect(legacyResultInterpretation([1, 1, 1, 1, 1])).toBe("ACCEPTABLE");
  });

  it("any unit non satisfaisant: the analysis is non satisfaisant, whatever the others", () => {
    expect(legacyResultInterpretation([2, 2, 2, 2, 0])).toBe("NON_SATISFAISANT");
    expect(legacyResultInterpretation([1, 0, 100])).toBe("NON_SATISFAISANT");
  });

  it("satisfaisant and acceptable mixed: none (c of the time unknown) — the units keep their own verdicts", () => {
    expect(legacyResultInterpretation([2, 2, 1, 2, 2])).toBeNull();
    const read = legacyReadings([{ u: 2, v: "50", c: 1, k: 11 }, { u: 1, v: "5", c: 2, k: 11 }], null);
    expect(read.interpretation).toBeNull();
    expect(read.readings).toEqual([
      { unit: 1, value: "5", verdict: "Satisfaisant" },
      { unit: 2, value: "50", verdict: "Acceptable" },
    ]);
    expect(read.value).toBe("5 ; 50");
  });

  it("no verdict at all (blank codes): none", () => {
    expect(legacyResultInterpretation([100, undefined])).toBeNull();
    expect(legacyResultInterpretation([])).toBeNull();
  });

  it("stored readings read back; anything malformed left out", () => {
    expect(storedReadings([{ unit: 1, value: "< 10", verdict: "Satisfaisant" }, { unit: "x" }, null, 3])).toEqual([
      { unit: 1, value: "< 10", verdict: "Satisfaisant" },
    ]);
    expect(storedReadings("nope")).toEqual([]);
  });
});

describe("the criterion in clear", () => {
  it("a three-class plan with n and c when the analysis was read on n units", () => {
    expect(legacyCriterionText({ n: 5, c: 2, m: ["1", 2], M: ["1", 3] }, 5)).toBe("n = 5 ; c = 2 ; m = 10² ; M = 10³");
  });

  it("n and c left out when fewer units were read than today's plan says", () => {
    expect(legacyCriterionText({ n: 5, c: 2, m: ["1", 2], M: ["1", 3] }, 1)).toBe("m = 10² ; M = 10³");
    expect(legacyCriterionText({ n: 5, M: ["1", 3] }, 1)).toBe(`≤${NBSP}10³`);
  });

  it("a single limit, an absence, nothing usable", () => {
    expect(legacyCriterionText({ n: 1, m: ["100", 0] }, 1)).toBe(`≤${NBSP}100`);
    expect(legacyCriterionText({ n: 1, abs: 1 }, 1)).toBe("Absence");
    expect(legacyCriterionText({ n: 5, abs: 1 }, 5)).toBe("n = 5 ; Absence");
    expect(legacyCriterionText({ n: 1 }, 1)).toBeNull();
    expect(legacyCriterionText(null, 1)).toBeNull();
    expect(legacyLimit(["1.5", 3])).toBe("1,5.10³");
  });
});

describe("the screens' queries keep a client's history to that client (HA6)", () => {
  const none = { q: null, siteId: null, from: null, until: null };

  it("the client is a top-level equality, a cancelled sample never listed", () => {
    expect(legacyHistoryWhere("c1", none)).toEqual({ clientId: "c1", cancelled: false });
    const where = legacyHistoryWhere("c1", { q: "2772", siteId: "s9", from: new Date("2020-01-01T00:00:00.000Z"), until: null });
    expect(where.clientId).toBe("c1");
    expect(where.cancelled).toBe(false);
    expect(where.AND).toHaveLength(3);
    // The text search never widens the client: its OR sits under the AND.
    expect(Object.keys(where).sort()).toEqual(["AND", "cancelled", "clientId"]);
  });

  it("« Siège » is the samples without a site", () => {
    expect(legacyHistoryWhere("c1", { ...none, siteId: LEGACY_SIEGE }).AND).toEqual([{ siteId: null }]);
  });

  it("refuses to build a query without a client", () => {
    expect(() => legacyHistoryWhere("", none)).toThrow();
    expect(() => legacySampleByIdWhere("", 5)).toThrow();
    expect(legacySampleByIdWhere("c1", 5)).toEqual({ id: 5, clientId: "c1", cancelled: false });
  });

  it("a sample id from a URL: digits only, within an INT", () => {
    expect(parseLegacySampleId("5110057")).toBe(5110057);
    expect(parseLegacySampleId("0")).toBeNull();
    expect(parseLegacySampleId("12a")).toBeNull();
    expect(parseLegacySampleId("99999999999")).toBeNull();
    expect(parseLegacySampleId("-3")).toBeNull();
  });

  it("filters from the URL: a period typed backwards is still that period; the page bounded", () => {
    const filters = parseLegacyHistoryFilters(new URLSearchParams("du=2024-12-31&au=2024-01-01&page=0&q=%20lot%20"));
    expect([filters.fromDay, filters.toDay]).toEqual(["2024-01-01", "2024-12-31"]);
    expect(filters.from! < filters.until!).toBe(true);
    expect(filters.page).toBe(1);
    expect(filters.q).toBe("lot");
    expect(parseLegacyHistoryFilters(new URLSearchParams("page=99999")).page).toBe(2000);
    expect(parseLegacyHistoryFilters(new URLSearchParams("du=2026-02-30")).from).toBeNull();
    expect(legacyHistoryQueryString({ q: "x", siteId: "s", page: 2 })).toBe("q=x&site=s&page=2");
  });

  it("the period is cut on the laboratory's clock (lab-day-range.ts), never the runtime's midnight; the last day included", () => {
    // After Morocco's return to UTC (20/09/2026): midnight is 00:00 UTC; the day after « au » excluded.
    const after = parseLegacyHistoryFilters(new URLSearchParams("du=2026-10-01&au=2026-10-03"));
    expect(after.from).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(after.until).toEqual(new Date("2026-10-04T00:00:00.000Z"));
    expect(legacyHistoryWhere("c1", after).AND).toEqual([{ receivedAt: { gte: after.from, lt: after.until } }]);
    // Before it, the lab's clock was UTC+1: its midnight is 23:00 UTC the day before.
    expect(parseLegacyHistoryFilters(new URLSearchParams("du=2026-01-15")).from).toEqual(new Date("2026-01-14T23:00:00.000Z"));
    // The links carry the days as typed, not an instant read back on the runtime's clock.
    expect(legacyHistoryQueryString(after)).toBe("du=2026-10-01&au=2026-10-03");
  });
});

describe("a non-conformity without a sample verdict is never a bare « — » (hypothèse D-7)", () => {
  it("marks a sample with no verdict of its own and an analysis « non satisfaisant »", () => {
    expect(legacyNonSatisfyingMark(null, 1, true)).toBe(true);
    expect(legacyNonSatisfyingMark(null, 3, true)).toBe(true);
  });

  it("never when the sample has a verdict on our scale (that verdict prints), nor without such an analysis, nor switched off", () => {
    expect(legacyNonSatisfyingMark("SATISFAISANT", 1, true)).toBe(false);
    expect(legacyNonSatisfyingMark("NON_SATISFAISANT", 1, true)).toBe(false);
    expect(legacyNonSatisfyingMark(null, 0, true)).toBe(false);
    expect(legacyNonSatisfyingMark(null, 1, false)).toBe(false);
  });

  it("an analysis read on several units is « non satisfaisant » as soon as one unit is (what the mark counts)", () => {
    // Units 2 and 1 (Satisfaisant, Non satisfaisant), sample verdict blank (code 100).
    expect(legacyResultInterpretation([2, 0])).toBe("NON_SATISFAISANT");
    expect(legacyVerdict(100)).toBeNull();
    for (const code of [0, 4, 10, 17, 116, 118, 123]) expect(legacyVerdict(code)?.interpretation, String(code)).toBe("NON_SATISFAISANT");
  });
});
