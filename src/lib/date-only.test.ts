import { describe, expect, it } from "vitest";
import { formatDateOnly, isoDayOf, parseIsoDay } from "./date-only";

describe("calendar dates without a time", () => {
  it("reads « AAAA-MM-JJ » as the UTC midnight of that day", () => {
    expect(parseIsoDay("2024-10-01")?.toISOString()).toBe("2024-10-01T00:00:00.000Z");
    expect(parseIsoDay("2006-01-05")?.toISOString()).toBe("2006-01-05T00:00:00.000Z");
  });

  it("refuses anything else, impossible days included", () => {
    for (const value of ["", "2024-02-30", "2024-13-01", "01/10/2024", "2024-10-01T00:00:00", "2024-1-1"]) {
      expect(parseIsoDay(value)).toBeNull();
    }
    expect(parseIsoDay("2024-02-29")).not.toBeNull();
  });

  it("round-trips whatever the runtime's zone (the date never slips by one day)", () => {
    for (const value of ["2024-10-01", "2024-10-08", "2019-10-11", "2026-10-08", "2006-01-05"]) {
      const date = parseIsoDay(value)!;
      expect(isoDayOf(date)).toBe(value);
    }
    expect(formatDateOnly(parseIsoDay("2024-10-01")!)).toBe("01/10/2024");
  });
});
