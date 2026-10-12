import { describe, expect, it } from "vitest";
import { labDayBounds, labDayStart, parseLabDayRange } from "./lab-day-range";

describe("labDayStart", () => {
  it("is UTC midnight since Morocco's return to UTC (20/09/2026)", () => {
    expect(labDayStart("2026-10-01")).toEqual(new Date("2026-10-01T00:00:00.000Z"));
  });

  it("is 23:00 UTC the day before while the lab's clock was UTC+1", () => {
    expect(labDayStart("2026-01-15")).toEqual(new Date("2026-01-14T23:00:00.000Z"));
  });

  it("refuses what is not a real day", () => {
    for (const value of [null, "", "2026-02-29", "2026-13-01", "0099-01-01", "01/10/2026", "2026-10-1"]) {
      expect(labDayStart(value), String(value)).toBeNull();
    }
  });
});

describe("parseLabDayRange", () => {
  it("bounds an inclusive period, the last day included up to its midnight", () => {
    expect(parseLabDayRange("2026-10-01", "2026-10-03")).toEqual({
      fromDay: "2026-10-01",
      toDay: "2026-10-03",
      from: new Date("2026-10-01T00:00:00.000Z"),
      until: new Date("2026-10-04T00:00:00.000Z"),
    });
  });

  it("crosses a month and a year", () => {
    expect(parseLabDayRange(null, "2026-12-31").until).toEqual(new Date("2027-01-01T00:00:00.000Z"));
    expect(parseLabDayRange(null, "2028-02-28").until).toEqual(new Date("2028-02-29T00:00:00.000Z"));
  });

  it("puts a backwards period right and trims", () => {
    expect(parseLabDayRange(" 2026-10-05 ", "2026-10-02")).toMatchObject({
      fromDay: "2026-10-02",
      toDay: "2026-10-05",
    });
  });

  it("stays open on a side that is missing or unreadable", () => {
    expect(parseLabDayRange("2026-02-30", "2026-10-05")).toMatchObject({ fromDay: null, from: null, toDay: "2026-10-05" });
    expect(parseLabDayRange(undefined, undefined)).toEqual({ fromDay: null, toDay: null, from: null, until: null });
  });
});

describe("labDayBounds", () => {
  it("bounds the day asked on the laboratory's clock", () => {
    expect(labDayBounds("2026-10-12", new Date("2026-10-20T10:00:00Z"))).toEqual({
      day: "2026-10-12",
      from: new Date("2026-10-12T00:00:00.000Z"),
      until: new Date("2026-10-13T00:00:00.000Z"),
    });
  });

  it("is the laboratory's today when no day is asked — 00:30 UTC is already the new day", () => {
    const now = new Date("2026-10-12T00:30:00Z");
    expect(labDayBounds(null, now)?.day).toBe("2026-10-12");
    expect(labDayBounds("", now)?.from).toEqual(new Date("2026-10-12T00:00:00.000Z"));
  });

  it("keeps UTC+1 for a day before Morocco's return to UTC", () => {
    expect(labDayBounds("2026-09-10", new Date())?.from).toEqual(new Date("2026-09-09T23:00:00.000Z"));
  });

  it("refuses what is not a real day", () => {
    for (const value of ["abc", "2026-02-31", "12/10/2026"]) {
      expect(labDayBounds(value, new Date()), value).toBeNull();
    }
  });
});
