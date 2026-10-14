import { describe, expect, it } from "vitest";
import { normInForce, parameterCaption } from "./parameter-caption";

/**
 * The muted line under an analysis where it is ticked (old software's
 * « Paramètre(s) à rechercher », 14/10): the norm version in force, then
 * the unit — shown only when known. Invented norm codes only.
 */

describe("normInForce — the version a parameter is read under today", () => {
  it("takes the version flagged in force, never a superseded one", () => {
    expect(
      normInForce([
        { label: "NM ISO 0001-1:2017", current: false },
        { label: "NM ISO 0001-1:2021", current: true },
      ])
    ).toBe("NM ISO 0001-1:2021");
  });

  it("keeps the listing's order when two norms each have a version in force — the programme sheet's default", () => {
    expect(
      normInForce([
        { label: "NM ISO 0001:2020", current: true },
        { label: "NM ISO 0002:2022", current: true },
      ])
    ).toBe("NM ISO 0001:2020");
  });

  it("says nothing when no version is in force, or when the parameter cites no norm", () => {
    expect(normInForce([{ label: "NM ISO 0001:2010", current: false }])).toBeNull();
    expect(normInForce([])).toBeNull();
  });

  it("skips a blank label and trims the one it prints", () => {
    expect(
      normInForce([
        { label: "  ", current: true },
        { label: " NM ISO 0003:2019 ", current: true },
      ])
    ).toBe("NM ISO 0003:2019");
  });
});

describe("parameterCaption — « norme · unité »", () => {
  it("joins the norm and the unit", () => {
    expect(parameterCaption({ normLabel: "NM ISO 0001-1:2021", unit: "/25 g" })).toBe("NM ISO 0001-1:2021 · /25 g");
  });

  it("prints either part alone when the other is unknown", () => {
    expect(parameterCaption({ normLabel: "NM ISO 0001-1:2021", unit: null })).toBe("NM ISO 0001-1:2021");
    expect(parameterCaption({ normLabel: null, unit: "UFC/g" })).toBe("UFC/g");
    expect(parameterCaption({ unit: "UFC/g" })).toBe("UFC/g");
  });

  it("is null when neither is known — the name stands alone", () => {
    expect(parameterCaption({})).toBeNull();
    expect(parameterCaption({ normLabel: null, unit: null })).toBeNull();
    expect(parameterCaption({ normLabel: " ", unit: "" })).toBeNull();
  });

  it("trims each part", () => {
    expect(parameterCaption({ normLabel: " NM ISO 0001:2020 ", unit: " UFC/mL " })).toBe("NM ISO 0001:2020 · UFC/mL");
  });
});
