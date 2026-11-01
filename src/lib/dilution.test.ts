import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { dilutionText, dilutionToStore, effectiveFactor, parseDilution, readingFactor } from "./dilution";
import { singleValueEntry } from "./result-value";

/**
 * PROGRAMME.md §6 — the programmed dilution replaces the parameter's
 * calcFactor when present, and only then.
 */
describe("effectiveFactor", () => {
  it("keeps the parameter's calcFactor when nothing was programmed", () => {
    expect(effectiveFactor(null, 1)).toBe(1);
    expect(effectiveFactor(undefined, 100)).toBe(100);
  });

  it("takes the programmed dilution over the catalogue's factor", () => {
    expect(effectiveFactor(10, 1)).toBe(10);
    expect(effectiveFactor(0.5, 100)).toBe(0.5);
  });

  it("reads a Decimal-like value from the database", () => {
    // Prisma's Decimal stringifies to its exact figure.
    expect(effectiveFactor({ toString: () => "10.0000" }, 1)).toBe(10);
    expect(effectiveFactor("2,5".replace(",", "."), 1)).toBe(2.5);
  });

  it("ignores a factor that cannot multiply a reading", () => {
    expect(effectiveFactor(0, 3)).toBe(3);
    expect(effectiveFactor(-2, 3)).toBe(3);
    expect(effectiveFactor("abc", 3)).toBe(3);
  });
});

/**
 * J4 (28/10, 2.12 : « le technicien va faire entrer les résultats avec les
 * dilutions utilisées ») — the technician types the dilution beside the
 * reading; the software computes. Hypothèse R-12 : 30 lu au 1/100 → 3.10³.
 */
describe("parseDilution — the dilution as the bench writes it", () => {
  it("reads every usual notation as the multiplier", () => {
    for (const typed of ["1/100", "1 / 100", "1:100", "10-2", "10^-2", "10^2", "10⁻²", "-2", "100", "×100", "x100"]) {
      expect(parseDilution(typed), typed).toBe(100);
    }
    expect(parseDilution("1/10")).toBe(10);
    expect(parseDilution("10-6")).toBe(1_000_000);
    expect(parseDilution("1")).toBe(1);
    expect(parseDilution("1/1")).toBe(1);
    expect(parseDilution("0,5")).toBe(0.5);
    expect(parseDilution("102")).toBe(102);
  });

  it("nothing typed: none (the programme's or the catalogue's applies)", () => {
    expect(parseDilution("")).toBeNull();
    expect(parseDilution("   ")).toBeNull();
    expect(parseDilution(null)).toBeNull();
  });

  it("never guesses: anything else is refused", () => {
    for (const typed of ["abc", "1/", "0", "1/0", "-", "10^", "1/100/2", "2e3", "0,00001", "1/10000000000"]) {
      expect(parseDilution(typed), typed).toBe("invalid");
    }
  });
});

describe("dilutionText — the multiplier written back as a dilution", () => {
  it("« 1/100 », « 1 », « ×0,5 »", () => {
    expect(dilutionText(100)).toBe("1/100");
    expect(dilutionText(1)).toBe("1");
    expect(dilutionText(0.5)).toBe("×0,5");
    expect(dilutionText(1_000_000)).toBe("1/1 000 000");
    expect(parseDilution(dilutionText(1_000_000))).toBe(1_000_000);
    expect(dilutionText(0)).toBe("");
  });

  it("reads back what it writes", () => {
    for (const factor of [1, 10, 100, 1000, 0.5, 2.5]) {
      expect(parseDilution(dilutionText(factor)), String(factor)).toBe(factor);
    }
  });
});

describe("readingFactor and dilutionToStore — which dilution a line is read with", () => {
  it("the technician's, else the programme's, else the catalogue's", () => {
    expect(readingFactor(1000, 100, 1)).toBe(1000);
    expect(readingFactor(null, 100, 1)).toBe(100);
    expect(readingFactor(undefined, null, 10)).toBe(10);
    expect(readingFactor({ toString: () => "100.0000" }, null, 1)).toBe(100);
  });

  it("stores only a dilution that differs from the one the line would take anyway", () => {
    expect(dilutionToStore(100, 100)).toBeNull();
    expect(dilutionToStore(null, 100)).toBeNull();
    expect(dilutionToStore(1000, 100)).toBe(1000);
    expect(dilutionToStore(1, 10)).toBe(1);
  });

  it("R-12's example: 30 read at 1/100 prints 3.10³", () => {
    const factor = readingFactor(parseDilution("1/100") as number, null, 1);
    expect(singleValueEntry("30", factor)).toMatchObject({ value: "3.10³", rawValue: "30", parsed: { numeric: 3000 } });
  });
});

describe("J4 — the save reads the dilution typed, refuses one it cannot read, stores it only when it differs", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("in the results route", () => {
    const route = read("../app/api/samples/[id]/results/route.ts");
    expect(route).toContain('const typedDilution = parseDilution(typeof raw.dilution === "string" ? raw.dilution : null);');
    expect(route).toContain('if (typedDilution === "invalid") {');
    expect(route).toContain("const factor = typedDilution ?? programmedFactor;");
    expect(route).toContain("const stored = dilutionToStore(typedDilution, programmedFactor);");
    expect(route.match(/^\s+dilutionUsed,$/gm)).toHaveLength(3);
  });

  it("the submission and the screens read the same factor", () => {
    expect(read("../app/api/samples/[id]/results/submit/route.ts")).toContain("readingFactor(result?.dilutionUsed, line.dilutionFactor, parameter.calcFactor)");
    expect(read("../app/technicien/[id]/page.tsx")).toContain(
      "dilution: dilutionText(readingFactor(existing?.dilutionUsed, line.dilutionFactor, parameter.calcFactor)),"
    );
    expect(read("../app/validation/[id]/page.tsx")).toContain("readingFactor(result.dilutionUsed, programmedDilution.get(result.parameterId), result.parameter.calcFactor)");
  });
});
