import { describe, expect, it } from "vitest";
import { needsRegulation, proposeRegulation, validateRegulation } from "./regulation";

const settings = { regulationMicroId: "fam-micro", regulationChimieId: "fam-chimie" };
const active = new Set(["s", "cp", "pt", "fam-micro", "fam-chimie"]);

describe("proposeRegulation", () => {
  it("proposes the most specific choice already known", () => {
    const all = { sample: "s", clientProduct: "cp", productType: "pt", family: "MICRO" as const, settings };
    expect(proposeRegulation(all, active)).toBe("s");
    expect(proposeRegulation({ ...all, sample: null }, active)).toBe("cp");
    expect(proposeRegulation({ ...all, sample: null, clientProduct: null }, active)).toBe("pt");
    expect(proposeRegulation({ ...all, sample: null, clientProduct: null, productType: null }, active)).toBe("fam-micro");
    expect(proposeRegulation({ ...all, sample: null, clientProduct: null, productType: null, family: "CHIMIE" }, active)).toBe("fam-chimie");
  });

  it("never proposes an archived regulation, and may propose nothing", () => {
    const sources = { sample: null, clientProduct: "old", productType: "pt", family: null, settings };
    expect(proposeRegulation(sources, active)).toBe("pt");
    expect(proposeRegulation({ ...sources, productType: null, settings: { regulationMicroId: null, regulationChimieId: null } }, active)).toBeNull();
  });
});

describe("needsRegulation / validateRegulation", () => {
  it("asks for a regulation only when criteria judge the sample", () => {
    expect(needsRegulation({ productTypeId: "t1" })).toBe(true);
    expect(needsRegulation({ productTypeId: null })).toBe(false);
  });

  it("checks the name and prints the name when no text is given", () => {
    expect(validateRegulation({ title: "  Règlement  UE 2073/2005 " })).toMatchObject({
      ok: true,
      value: { title: "Règlement UE 2073/2005", text: "Règlement UE 2073/2005", normalizedTitle: "reglement ue 2073 2005", active: true },
    });
    expect(validateRegulation({ title: "" }).ok).toBe(false);
    expect(validateRegulation({ title: "x", text: "y".repeat(4001) }).ok).toBe(false);
  });
});
