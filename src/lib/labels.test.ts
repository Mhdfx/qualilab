import { describe, expect, it } from "vitest";
import {
  AIR_METHOD_LABELS,
  HANDS_STATE_CHOICES,
  HANDS_STATE_LABELS,
  HANDS_STATE_PHRASES,
  LAB_TIME_ZONE,
  SURFACE_STATE_PHRASES,
  airMethodText,
  formatCurrency,
  formatDate,
  formatDateTime,
  formatDecimal,
  formatIsoDay,
  formatTypedAmount,
  typedAmountIsNone,
  isExposedPlate,
  surfaceAreaText,
  withPrintableSpaces,
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

describe("the thousands separator of figures (found 21/10)", () => {
  // Intl's fr-FR writes U+202F, which the invoice PDF's regular weight draws
  // as nothing: « 1800,00 DH ». Every figure now carries U+00A0 instead.
  const NBSP = "\u00a0";
  const INVISIBLE = /[\u202f\u2009]/;
  /** What Intl itself writes, the separators aside — the rounding and decimals that must not move. */
  const intl = (amount: number) =>
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);

  it("1800 is « 1 800,00 DH », with a no-break space", () => {
    expect(formatCurrency(1800)).toBe(`1${NBSP}800,00 DH`);
    expect(formatCurrency(2160)).toBe(`2${NBSP}160,00 DH`);
    expect(formatCurrency(1000)).toBe(`1${NBSP}000,00 DH`);
  });

  it("negatives, zero and amounts under a thousand", () => {
    expect(formatCurrency(-1800)).toBe(`-1${NBSP}800,00 DH`);
    expect(formatCurrency(-0.5)).toBe("-0,50 DH");
    expect(formatCurrency(0)).toBe("0,00 DH");
    expect(formatCurrency(999.99)).toBe("999,99 DH");
    expect(formatCurrency(Number.NaN)).toBe("0,00 DH");
  });

  it("millions and the largest amount accepted", () => {
    expect(formatCurrency(1234567.891)).toBe(`1${NBSP}234${NBSP}567,89 DH`);
    expect(formatCurrency(-2500000)).toBe(`-2${NBSP}500${NBSP}000,00 DH`);
    expect(formatCurrency(9_999_999_999.99)).toBe(`9${NBSP}999${NBSP}999${NBSP}999,99 DH`);
  });

  it("changes the separators only: Intl's rounding and decimals stay", () => {
    for (const amount of [0.005, 1.005, 2.675, 1234.565, -1234.565, 1800.004, 1e6 + 0.1]) {
      const printed = formatCurrency(amount);
      expect(printed).toBe(`${intl(amount).replace(/\u202f/g, NBSP)} DH`);
      expect(printed).not.toMatch(INVISIBLE);
    }
  });

  it("formatDecimal — a quantity, a mass, a VAT rate — the same way", () => {
    expect(formatDecimal(1500)).toBe(`1${NBSP}500`);
    expect(formatDecimal(1000, 2)).toBe(`1${NBSP}000`);
    expect(formatDecimal("1234,5", 2)).toBe(`1${NBSP}234,5`);
    expect(formatDecimal(-1250.25, 2)).toBe(`-1${NBSP}250,25`);
    expect(formatDecimal(2_500_000)).toBe(`2${NBSP}500${NBSP}000`);
    expect(formatDecimal(0)).toBe("0");
    expect(formatDecimal(5.5)).toBe("5,5");
    expect(formatDecimal(-18)).toBe("-18");
    expect(formatDecimal("pas un nombre")).toBe("pas un nombre");
  });

  it("withPrintableSpaces maps U+202F and U+2009 and nothing else", () => {
    expect(withPrintableSpaces("1\u202f800,00")).toBe(`1${NBSP}800,00`);
    expect(withPrintableSpaces("1\u2009800,00")).toBe(`1${NBSP}800,00`);
    expect(withPrintableSpaces(`1${NBSP}800 DH`)).toBe(`1${NBSP}800 DH`);
    expect(withPrintableSpaces("Total HT 18")).toBe("Total HT 18");
  });

  it("the Direction's « délai moyen » in days: a comma, and no « ,0 »", () => {
    // DirectionStats printed `(hours / 24).toFixed(1)`: « 2.5 j », « 3.0 j ».
    expect(formatDecimal(60 / 24)).toBe("2,5");
    expect(formatDecimal(72 / 24)).toBe("3");
    expect(formatDecimal(49 / 24)).toBe("2");
  });
});

describe("formatTypedAmount — the deposit's advance before it is saved", () => {
  const NBSP = " ";

  it("reads the amount as serie-input.ts does, then prints it as the bon de réception", () => {
    expect(formatTypedAmount("1800")).toBe(`1${NBSP}800,00 DH`);
    expect(formatTypedAmount("1800,5")).toBe(`1${NBSP}800,50 DH`);
    expect(formatTypedAmount("1800.5")).toBe(`1${NBSP}800,50 DH`);
    expect(formatTypedAmount(" 250 ")).toBe("250,00 DH");
    expect(formatTypedAmount("99,999")).toBe("100,00 DH");
    expect(formatTypedAmount("1800")).toBe(formatCurrency(1800));
  });

  it("text the server will refuse is shown as typed, never as a made-up figure", () => {
    expect(formatTypedAmount("1 800")).toBe("1 800 DH");
    expect(formatTypedAmount("12abc")).toBe("12abc DH");
    expect(formatTypedAmount("   ")).toBe("    DH");
    expect(formatTypedAmount("1,800.5")).toBe("1,800.5 DH");
  });
});

describe("typedAmountIsNone — an advance the server keeps no trace of", () => {
  it("blank or zero, however written", () => {
    for (const text of ["", "   ", "0", "0,00", "0.0", " 0 "]) expect(typedAmountIsNone(text), text).toBe(true);
  });

  it("an amount, or text the server refuses (it must still be shown and corrected)", () => {
    for (const text of ["1800", "0,5", "0.01", "1 800", "abc", "-0,5"]) expect(typedAmountIsNone(text), text).toBe(false);
  });
});
