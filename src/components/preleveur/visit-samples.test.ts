import { describe, expect, it } from "vitest";
import { familiesLabel, groupByLine, sampleFamily, sampleHeading, twinOfCode } from "./visit-samples";

/**
 * RETOUR-LABO-06-10.md §5 (V2 + V3) — how the préleveur's screens name the
 * samples of a saved série. Invented codes only.
 */

describe("twinOfCode", () => {
  it("reads the letter of the two samples of a two-family line", () => {
    expect(twinOfCode("12/26-3M")).toBe("M");
    expect(twinOfCode("12/26-3P")).toBe("P");
  });

  it("finds no letter on a single sample nor on an older code", () => {
    expect(twinOfCode("12/26-3")).toBeNull();
    expect(twinOfCode("QL-2026-0007")).toBeNull();
    expect(twinOfCode(null)).toBeNull();
    expect(twinOfCode(undefined)).toBeNull();
  });
});

describe("sampleFamily", () => {
  it("prefers the code's letter, then the nature's family", () => {
    expect(sampleFamily({ lineNumber: 1, code: "1/26-1P", nature: { family: "MICRO" } })).toBe("CHIMIE");
    expect(sampleFamily({ lineNumber: 1, code: "1/26-1", nature: { family: "CHIMIE" } })).toBe("CHIMIE");
    expect(sampleFamily({ lineNumber: 1, code: "1/26-1", nature: { family: "AUTRE" } })).toBeNull();
    expect(sampleFamily({ lineNumber: 1 })).toBeNull();
  });
});

describe("groupByLine", () => {
  const samples = [
    { id: "c", lineNumber: 2, code: "1/26-2P", nature: { family: "CHIMIE" as const } },
    { id: "a", lineNumber: 1, code: "1/26-1", nature: { family: "MICRO" as const } },
    { id: "b", lineNumber: 2, code: "1/26-2M", nature: { family: "MICRO" as const } },
  ];

  it("groups the twins under their number, micro first, in protocol order", () => {
    const groups = groupByLine(samples);
    expect(groups.map((g) => g.lineNumber)).toEqual([1, 2]);
    expect(groups[0]).toMatchObject({ twinned: false });
    expect(groups[0].samples.map((s) => s.id)).toEqual(["a"]);
    expect(groups[1]).toMatchObject({ twinned: true });
    expect(groups[1].samples.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("keeps a lone twin (its sibling filtered out) marked as one of two", () => {
    const [group] = groupByLine([{ lineNumber: 4, code: "1/26-4P" }]);
    expect(group.twinned).toBe(true);
  });

  it("reads old séries (one sample per number, bare codes) as before", () => {
    const groups = groupByLine([
      { lineNumber: 1, code: "9/26-1" },
      { lineNumber: 2, code: "9/26-2" },
    ]);
    expect(groups.every((g) => !g.twinned && g.samples.length === 1)).toBe(true);
  });
});

describe("sampleHeading", () => {
  it("says « Échantillon N » for a single sample", () => {
    expect(sampleHeading({ lineNumber: 3, code: "1/26-3" }, false)).toBe("Échantillon 3");
  });

  it("names the family of each of the two samples of a line", () => {
    expect(sampleHeading({ lineNumber: 1, code: "1/26-1M" }, true)).toBe("Échantillon 1 · micro");
    expect(sampleHeading({ lineNumber: 1, code: "1/26-1P" }, true)).toBe("Échantillon 1 · physico-chimie");
  });
});

describe("familiesLabel", () => {
  it("lists the ticked families in the form's order", () => {
    expect(familiesLabel(["MICRO", "CHIMIE"])).toBe("micro et physico-chimie");
    expect(familiesLabel(["CHIMIE"])).toBe("physico-chimie");
    expect(familiesLabel([])).toBe("aucune analyse cochée");
  });
});
