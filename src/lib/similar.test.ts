import { describe, expect, it } from "vitest";
import { editDistance, matchesQuery, similarLabels, tolerance } from "./similar";

describe("editDistance", () => {
  it("counts insertions, deletions, substitutions and swaps", () => {
    expect(editDistance("salade", "salade")).toBe(0);
    expect(editDistance("salde", "salade")).toBe(1);
    expect(editDistance("salaade", "salade")).toBe(1);
    expect(editDistance("salode", "salade")).toBe(1);
    expect(editDistance("slaade", "salade")).toBe(1);
    expect(editDistance("", "abc")).toBe(3);
  });
});

describe("tolerance", () => {
  it("grows with the length, never beyond three errors", () => {
    expect(tolerance(3)).toBe(0);
    expect(tolerance(6)).toBe(1);
    expect(tolerance(10)).toBe(2);
    expect(tolerance(40)).toBe(3);
  });
});

describe("similarLabels — « Vouliez-vous dire … ? »", () => {
  const known = ["Salade composée", "Pain au chocolat", "Pain aux raisins", "Poulet rôti", "Tajine de poulet"];

  it("recognises the usual typing errors", () => {
    expect(similarLabels("Salde composée", known)).toEqual(["Salade composée"]);
    expect(similarLabels("salade compossee", known)).toEqual(["Salade composée"]);
    expect(similarLabels("Pain au choclat", known)).toEqual(["Pain au chocolat"]);
    expect(similarLabels("Tajine de pulet", known)).toEqual(["Tajine de poulet"]);
  });

  it("keeps different products apart and proposes nothing on an exact match", () => {
    expect(similarLabels("Pain aux raisins", known)).toEqual([]);
    expect(similarLabels("POULET ROTI", known)).toEqual([]);
    expect(similarLabels("Harira", known)).toEqual([]);
    expect(similarLabels("riz", ["rix"])).toEqual([]);
  });

  it("returns the closest first, at most three, without duplicates", () => {
    const list = ["Pain de mie", "Pain de mis", "Pain de mie ", "Pain de mia"];
    expect(similarLabels("Pain de mi", list)).toEqual(["Pain de mia", "Pain de mie", "Pain de mis"]);
  });
});

describe("matchesQuery — filtering a long list", () => {
  it("matches words anywhere, accents ignored, one typo tolerated per word", () => {
    expect(matchesQuery("SALADES AVEC SOURCE PROTEIQUE", "salade proteique")).toBe(true);
    expect(matchesQuery("CHARCUTERIE CUITE", "charcuteri")).toBe(true);
    expect(matchesQuery("CHARCUTERIE CUITE", "charcutrie cuite")).toBe(true);
    expect(matchesQuery("CRÈME FRAICHE", "creme")).toBe(true);
    expect(matchesQuery("CHARCUTERIE CUITE", "poisson")).toBe(false);
    expect(matchesQuery("CHARCUTERIE CUITE", "")).toBe(true);
  });
});
