import { describe, expect, it } from "vitest";
import {
  COUNTER_KINDS,
  formatCounterNumber,
  formatDocumentNumber,
  formatLabNumber,
  highestSequence,
  isDocumentCounter,
  parseDocumentNumber,
  parseLabNumber,
} from "./counters";

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

describe("document numbers « FAC-AAAA-NNNN » / « AV-AAAA-NNNN »", () => {
  it("parses an invoice and a credit-note number", () => {
    expect(parseDocumentNumber("FAC-2026-0042")).toEqual({ kind: "FACTURE", year: 2026, sequence: 42 });
    expect(parseDocumentNumber(" AV-2026-0003 ")).toEqual({ kind: "AVOIR", year: 2026, sequence: 3 });
    // Past 9 999 the sequence simply grows a digit.
    expect(parseDocumentNumber("FAC-2026-12345")).toEqual({ kind: "FACTURE", year: 2026, sequence: 12345 });
  });

  it("round-trips with formatDocumentNumber", () => {
    for (const kind of ["FACTURE", "AVOIR"] as const) {
      expect(parseDocumentNumber(formatDocumentNumber(kind, 7, 2027))).toEqual({ kind, year: 2027, sequence: 7 });
    }
  });

  it("rejects anything else", () => {
    for (const value of ["", "FAC-2026-0000", "FAC-26-0042", "fac-2026-0042", "FA-2026-0042", "2780/26", "FAC-2026-", "FAC-2026-00x2"]) {
      expect(parseDocumentNumber(value), value).toBeNull();
    }
  });
});

describe("the « Compteurs » screen", () => {
  it("covers the four yearly sequences, documents after the lab's numbers", () => {
    expect(COUNTER_KINDS).toEqual(["SERIE", "CONTROLE", "FACTURE", "AVOIR"]);
    expect(COUNTER_KINDS.filter(isDocumentCounter)).toEqual(["FACTURE", "AVOIR"]);
  });

  it("previews the next number in each kind's format", () => {
    expect(formatCounterNumber("SERIE", 2781, 2026)).toBe("2781/26");
    expect(formatCounterNumber("FACTURE", 43, 2026)).toBe("FAC-2026-0043");
    expect(formatCounterNumber("AVOIR", 1, 2026)).toBe("AV-2026-0001");
  });

  it("finds the highest number already used of a kind and a year", () => {
    const invoices = ["FAC-2026-0009", "FAC-2026-0042", "FAC-2025-0300", "AV-2026-0050", null, "FAC-2026-0010"];
    expect(highestSequence("FACTURE", 2026, invoices)).toBe(42);
    expect(highestSequence("AVOIR", 2026, invoices)).toBe(50);
    expect(highestSequence("FACTURE", 2027, invoices)).toBe(0);
    expect(highestSequence("SERIE", 2026, ["2780/26", "2799/26", "15/25", "Visite"])).toBe(2799);
    expect(highestSequence("CONTROLE", 2026, [])).toBe(0);
  });
});
