import { describe, expect, it } from "vitest";
import { sampleCodeFor, twinFor } from "./sample-code";

/**
 * The internal code of a sample: « série-ligne », and since
 * RETOUR-LABO-06-10.md §5 (V3) a letter for each of the two samples of a
 * line whose two families are ticked.
 */
describe("sampleCodeFor", () => {
  it("joins the série and the line number", () => {
    expect(sampleCodeFor("1/26", 1)).toBe("1/26-1");
    expect(sampleCodeFor("2780/26", 12)).toBe("2780/26-12");
  });

  it("adds M or P for the two samples of one line", () => {
    expect(sampleCodeFor("1/26", 1, "M")).toBe("1/26-1M");
    expect(sampleCodeFor("1/26", 1, "P")).toBe("1/26-1P");
  });

  it("keeps the bare code when no letter is given", () => {
    expect(sampleCodeFor("1/26", 3, undefined)).toBe("1/26-3");
  });
});

describe("twinFor", () => {
  it("gives M to microbiology and P to physico-chemistry", () => {
    expect(twinFor("MICRO")).toBe("M");
    expect(twinFor("CHIMIE")).toBe("P");
  });

  it("builds the two codes of a two-family line", () => {
    expect((["MICRO", "CHIMIE"] as const).map((f) => sampleCodeFor("1/26", 1, twinFor(f)))).toEqual([
      "1/26-1M",
      "1/26-1P",
    ]);
  });
});
