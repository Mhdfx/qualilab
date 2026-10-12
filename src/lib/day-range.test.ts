import { describe, expect, it } from "vitest";
import { dayRangeFilter, dayRangeParams, parseDay, parseDayRange } from "./day-range";
import { parseLabDayRange } from "./lab-day-range";

/**
 * « Du … au … » of /admin/envois and /reception/historique — inclusive days
 * on the laboratory's clock, the cut of the audit journal and the export.
 * Every expectation is an exact instant, so the suite means the same thing
 * whatever time zone the machine running it is in.
 */

describe("parseDay", () => {
  it("reads a day as its first or last instant on the laboratory's clock (UTC since 20/09/2026)", () => {
    expect(parseDay("2026-10-07", false)).toEqual(new Date("2026-10-07T00:00:00.000Z"));
    expect(parseDay("2026-10-07", true)).toEqual(new Date("2026-10-07T23:59:59.999Z"));
  });

  it("follows the UTC+1 clock before Morocco's return to UTC", () => {
    expect(parseDay("2026-01-15", false)).toEqual(new Date("2026-01-14T23:00:00.000Z"));
    expect(parseDay("2026-01-15", true)).toEqual(new Date("2026-01-15T22:59:59.999Z"));
  });

  it("cuts exactly where the journal and the accounting export cut", () => {
    const lab = parseLabDayRange("2026-10-01", "2026-10-07");
    expect(parseDay("2026-10-01", false)).toEqual(lab.from);
    expect(parseDay("2026-10-07", true)?.getTime()).toBe((lab.until as Date).getTime() - 1);
  });

  it("ignores anything that is not a real calendar day", () => {
    for (const value of [null, undefined, "", "07/10/2026", "2026-1-7", "2026-02-31", "2026-13-01", "demain"]) {
      expect(parseDay(value, false), String(value)).toBeNull();
    }
    expect(parseDay(" 2026-10-07 ", false)).not.toBeNull();
  });
});

describe("parseDayRange", () => {
  it("keeps open bounds open", () => {
    expect(parseDayRange(null, null)).toEqual({ from: null, to: null });
    expect(parseDayRange("2026-10-01", null).to).toBeNull();
    expect(parseDayRange(null, "2026-10-01").from).toBeNull();
  });

  it("swaps a period typed backwards", () => {
    const range = parseDayRange("2026-10-09", "2026-10-01");
    expect(dayRangeParams(range)).toEqual({ du: "2026-10-01", au: "2026-10-09" });
    expect(range.from && range.to && range.from < range.to).toBe(true);
  });

  it("round-trips through the form's values, before and after the change of legal time", () => {
    expect(dayRangeParams(parseDayRange("2026-09-30", "2026-10-02"))).toEqual({ du: "2026-09-30", au: "2026-10-02" });
    expect(dayRangeParams(parseDayRange("2026-09-15", "2026-09-25"))).toEqual({ du: "2026-09-15", au: "2026-09-25" });
    expect(dayRangeParams({ from: null, to: null })).toEqual({ du: "", au: "" });
  });
});

describe("dayRangeFilter", () => {
  it("is absent without bounds, inclusive with them", () => {
    expect(dayRangeFilter({ from: null, to: null })).toBeUndefined();
    const range = parseDayRange("2026-10-01", "2026-10-02");
    expect(dayRangeFilter(range)).toEqual({ gte: range.from, lte: range.to });
    expect(dayRangeFilter({ from: range.from, to: null })).toEqual({ gte: range.from });
  });

  it("keeps an entry printed « 09/10 23:40 » inside a period ending on 09/10", () => {
    const range = parseDayRange("2026-10-09", "2026-10-09");
    const late = new Date("2026-10-09T23:40:00.000Z");
    expect(range.from && late >= range.from && range.to && late <= range.to).toBe(true);
    expect(range.to && new Date("2026-10-10T00:00:00.000Z") > range.to).toBe(true);
  });
});
