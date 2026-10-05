import { describe, expect, it } from "vitest";
import { effectiveFactor } from "./dilution";

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
