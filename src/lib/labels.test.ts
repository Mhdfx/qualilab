import { describe, expect, it } from "vitest";
import {
  LAB_TIME_ZONE,
  formatDate,
  formatDateTime,
  formatIsoDay,
} from "./labels";

/**
 * The laboratory reads its own clock, not the server's.
 *
 * The container runs in Africa/Casablanca (UTC+1, no DST), so a local midnight
 * is 23:00 the previous day in UTC. Anything derived from `toISOString()` is
 * therefore one day behind for the whole day — the bug these tests pin down.
 */
describe("lab time zone", () => {
  it("is the laboratory's zone, not the machine's", () => {
    expect(LAB_TIME_ZONE).toBe("Africa/Casablanca");
  });

  it("stamps the local day, never the UTC one", () => {
    // 9 September 2026, 00:00 in Casablanca = 8 September 23:00 UTC.
    const localMidnight = new Date("2026-09-08T23:00:00.000Z");
    expect(formatIsoDay(localMidnight)).toBe("2026-09-09");
    expect(localMidnight.toISOString().slice(0, 10)).toBe("2026-09-08");
  });

  it("stamps the last minute of the local day on that same day", () => {
    // 9 September 2026, 23:59 in Casablanca = 22:59 UTC the same day.
    expect(formatIsoDay(new Date("2026-09-09T22:59:00.000Z"))).toBe("2026-09-09");
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(formatIsoDay("2026-09-08T23:30:00.000Z")).toBe("2026-09-09");
  });

  it("prints times in the laboratory's zone", () => {
    // 14:05 UTC is 15:05 in Casablanca.
    expect(formatDateTime("2026-09-09T14:05:00.000Z")).toContain("15:05");
  });

  it("prints the local date for an instant that is the day before in UTC", () => {
    expect(formatDate("2026-09-08T23:30:00.000Z")).toContain("sept.");
    expect(formatDate("2026-09-08T23:30:00.000Z")).toContain("9");
  });
});
