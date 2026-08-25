import { describe, it, expect } from "vitest";
import {
  proposeLines,
  lineDescription,
  buildCatalogueIndex,
  type CatalogueEntry,
  type BillableSample,
} from "./billing";

const catalogue: CatalogueEntry[] = [
  { name: "E. coli", category: "ALIMENTAIRE", unitPrice: 320, active: true },
  { name: "E. coli", category: "EAU", unitPrice: 380, active: true },
  { name: "Salmonelles", category: "ALIMENTAIRE", unitPrice: 450, active: true },
  { name: "Légionelles", category: "EAU", unitPrice: 420, active: false },
];

const sample: BillableSample = {
  id: "s1",
  controlCode: "QLC-2026-00001",
  code: "QL-2026-00001",
  type: "ALIMENTAIRE",
  produit: "Salade printanière",
  parameters: [{ name: "E. coli" }, { name: "Salmonelles" }],
};

describe("buildCatalogueIndex", () => {
  it("prices the same analysis differently by domain", () => {
    const index = buildCatalogueIndex(catalogue);
    expect(index.get("alimentaire::e. coli")?.unitPrice).toBe(320);
    expect(index.get("eau::e. coli")?.unitPrice).toBe(380);
  });

  it("ignores a service the admin has deactivated", () => {
    const index = buildCatalogueIndex(catalogue);
    expect(index.has("eau::légionelles")).toBe(false);
  });
});

describe("lineDescription", () => {
  it("says what was analysed, on what, and on which sample", () => {
    expect(lineDescription("E. coli", sample)).toBe(
      "E. coli (Alimentaire) — Salade printanière · QLC-2026-00001"
    );
  });

  it("falls back to the field code when there is no control code", () => {
    expect(
      lineDescription("E. coli", { ...sample, controlCode: null })
    ).toContain("QL-2026-00001");
  });

  it("omits the product when it was never recorded", () => {
    const line = lineDescription("E. coli", { ...sample, produit: null });
    expect(line).toBe("E. coli (Alimentaire) · QLC-2026-00001");
  });
});

describe("proposeLines", () => {
  it("turns each analysis into a line at its catalogue price", () => {
    const lines = proposeLines([sample], catalogue);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      sampleId: "s1",
      quantity: 1,
      unitPrice: 320,
      unpriced: false,
    });
    expect(lines[1].unitPrice).toBe(450);
  });

  it("uses the price of the right domain", () => {
    const water: BillableSample = {
      ...sample,
      id: "s2",
      type: "EAU",
      parameters: [{ name: "E. coli" }],
    };
    expect(proposeLines([water], catalogue)[0].unitPrice).toBe(380);
  });

  it("flags an analysis missing from the catalogue instead of pricing it at zero", () => {
    const unknown: BillableSample = {
      ...sample,
      parameters: [{ name: "Paramètre inconnu" }],
    };
    const [line] = proposeLines([unknown], catalogue);
    // The accountant is asked, rather than the laboratory silently invoicing 0.
    expect(line.unpriced).toBe(true);
    expect(line.unitPrice).toBe(0);
  });

  it("treats a deactivated service as missing", () => {
    const water: BillableSample = {
      ...sample,
      type: "EAU",
      parameters: [{ name: "Légionelles" }],
    };
    expect(proposeLines([water], catalogue)[0].unpriced).toBe(true);
  });

  it("bills several samples in one invoice, keeping each line traceable", () => {
    const second: BillableSample = {
      ...sample,
      id: "s2",
      controlCode: "QLC-2026-00002",
      parameters: [{ name: "E. coli" }],
    };
    const lines = proposeLines([sample, second], catalogue);
    expect(lines).toHaveLength(3);
    // Every line knows which sample it bills — that is what prevents a
    // sample being invoiced twice.
    expect(lines.map((line) => line.sampleId)).toEqual(["s1", "s1", "s2"]);
  });

  it("produces nothing from nothing", () => {
    expect(proposeLines([], catalogue)).toEqual([]);
    expect(proposeLines([{ ...sample, parameters: [] }], catalogue)).toEqual([]);
  });
});
