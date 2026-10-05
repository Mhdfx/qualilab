import { describe, expect, it } from "vitest";
import { MOROCCO_GMT_SWITCH, fromLabWallTime, labOffsetMinutes, labTimeZone, toLabWallTime } from "./lab-time";

/**
 * Morocco: permanent UTC+1 (with the Ramadan pause at UTC+0) until
 * 20 September 2026 02:00, plain UTC since. The helpers must give the
 * laboratory's wall time on a machine whose zone data stops before 2026c.
 */
describe("labTimeZone", () => {
  it("keeps the IANA zone before the switch and UTC after it", () => {
    expect(labTimeZone(new Date("2026-09-09T14:05:00Z"))).toBe("Africa/Casablanca");
    expect(labTimeZone(new Date(MOROCCO_GMT_SWITCH - 1))).toBe("Africa/Casablanca");
    expect(labTimeZone(new Date(MOROCCO_GMT_SWITCH))).toBe("UTC");
    expect(labTimeZone(new Date("2026-10-05T00:57:00Z"))).toBe("UTC");
  });
});

describe("labOffsetMinutes", () => {
  it("is +60 before the switch, 0 during Ramadan 2026 and 0 after the switch", () => {
    expect(labOffsetMinutes(new Date("2026-09-09T14:05:00Z"))).toBe(60);
    expect(labOffsetMinutes(new Date("2026-03-01T12:00:00Z"))).toBe(0);
    expect(labOffsetMinutes(new Date("2026-10-05T12:00:00Z"))).toBe(0);
    expect(labOffsetMinutes(new Date("2027-06-01T12:00:00Z"))).toBe(0);
  });
});

describe("toLabWallTime / fromLabWallTime", () => {
  it("round-trips a datetime-local value on the laboratory's clock", () => {
    expect(toLabWallTime(new Date("2026-09-09T14:05:00Z"))).toBe("2026-09-09T15:05");
    expect(toLabWallTime(new Date("2026-10-05T00:57:00Z"))).toBe("2026-10-05T00:57");
    expect(fromLabWallTime("2026-09-09T15:05")?.toISOString()).toBe("2026-09-09T14:05:00.000Z");
    expect(fromLabWallTime("2026-10-05T01:57")?.toISOString()).toBe("2026-10-05T01:57:00.000Z");
    expect(fromLabWallTime("2026-10-05T01:57:30")?.toISOString()).toBe("2026-10-05T01:57:30.000Z");
  });

  it("never lands on the previous day at a local midnight", () => {
    expect(toLabWallTime(new Date("2026-09-08T23:30:00Z"))).toBe("2026-09-09T00:30");
    expect(fromLabWallTime("2026-09-09T00:30")?.toISOString()).toBe("2026-09-08T23:30:00.000Z");
  });

  it("rejects what is not a wall time", () => {
    expect(fromLabWallTime("")).toBeNull();
    expect(fromLabWallTime("demain")).toBeNull();
  });
});
