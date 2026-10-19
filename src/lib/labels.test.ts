import { describe, expect, it } from "vitest";
import {
  AIR_METHOD_LABELS,
  HANDS_STATE_CHOICES,
  HANDS_STATE_LABELS,
  HANDS_STATE_PHRASES,
  LAB_TIME_ZONE,
  SURFACE_STATE_PHRASES,
  airMethodText,
  formatDate,
  formatDateTime,
  formatIsoDay,
  isExposedPlate,
  surfaceAreaText,
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

describe("the hands' states (16/10, Q109, Q110)", () => {
  it("offers the laboratory's three choices, in its order", () => {
    expect(HANDS_STATE_CHOICES).toEqual(["ASEPTISEES", "NON_LAVEES", "LAVEES"]);
    expect(HANDS_STATE_CHOICES.map((s) => HANDS_STATE_LABELS[s])).toEqual([
      "Aseptisées ou désinfectées",
      "En cours de travail",
      "Lavées",
    ]);
  });

  it("prints its own phrases — an old « non lavées » reads « mains en cours de travail »", () => {
    expect(HANDS_STATE_PHRASES.NON_LAVEES).toBe("mains en cours de travail");
    expect(HANDS_STATE_PHRASES.LAVEES).toBe("mains lavées");
    expect(HANDS_STATE_PHRASES.ASEPTISEES).toBe("mains aseptisées ou désinfectées");
    // Never the surface's words.
    expect(Object.values(HANDS_STATE_PHRASES)).not.toContain(SURFACE_STATE_PHRASES.EN_COURS_DE_TRAVAIL);
  });
});

describe("the air method and the plate's duration (16/10, Q50)", () => {
  it("no longer carries the duration in its label", () => {
    expect(AIR_METHOD_LABELS.BOITE_EXPOSEE_30MIN).toBe("Boîte exposée");
    expect(isExposedPlate("BOITE_EXPOSEE_30MIN")).toBe(true);
    expect(isExposedPlate("BIOCOLLECTEUR")).toBe(false);
    expect(isExposedPlate("")).toBe(false);
  });

  it("composes « Boîte exposée N min »; an older plate without a duration reads 30 min", () => {
    expect(airMethodText("BOITE_EXPOSEE_30MIN", 30)).toBe("Boîte exposée 30 min");
    expect(airMethodText("BOITE_EXPOSEE_30MIN", 45)).toBe("Boîte exposée 45 min");
    expect(airMethodText("BOITE_EXPOSEE_30MIN", null)).toBe("Boîte exposée 30 min");
    expect(airMethodText("BOITE_EXPOSEE_30MIN")).toBe("Boîte exposée 30 min");
    expect(airMethodText("BIOCOLLECTEUR", 45)).toBe("Biocollecteur");
  });
});

describe("surfaceAreaText — the area, or the « Autre » text in its place (16/10, Q114)", () => {
  it("prints the text instead of « N cm² »", () => {
    expect(surfaceAreaText(null, "couteau entier")).toBe("couteau entier");
    expect(surfaceAreaText(100, null)).toBe("100 cm²");
    expect(surfaceAreaText(1000)).toBe("1000 cm²");
    expect(surfaceAreaText(null, "  ")).toBeNull();
    expect(surfaceAreaText(null, null)).toBeNull();
  });
});

describe("after Morocco's return to plain UTC (20/09/2026)", () => {
  it("prints the laboratory's time as UTC whatever the device's zone data", () => {
    // 00:57 UTC on 5 October 2026 is 00:57 on the laboratory's clock.
    expect(formatDateTime("2026-10-05T00:57:00.000Z")).toContain("00:57");
    expect(formatDate("2026-10-05T23:30:00.000Z")).toContain("5");
  });
});
