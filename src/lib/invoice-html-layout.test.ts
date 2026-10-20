import { describe, expect, it } from "vitest";
import {
  billedAnalysis,
  groupLinesByParameter,
  invoiceLayoutOf,
  invoicePdfPath,
  layoutSourceLine,
  type LayoutSourceLine,
} from "./invoice-html-layout";
import { checkInvoiceLines, lineDescription, type BillableSample } from "./billing";
import { computeInvoiceTotals } from "./invoice-math";

const sample = (overrides: Partial<BillableSample> = {}): BillableSample => ({
  id: "s1",
  controlCode: "480/26-2",
  code: "ECH-2026-00001",
  type: "ALIMENTAIRE",
  produit: null,
  parameters: [],
  ...overrides,
});

/** An analysis line as `proposeLines` writes it. */
const analysis = (
  name: string,
  unitPrice: number,
  over: Partial<BillableSample> = {},
  quantity = 1
): LayoutSourceLine => ({
  description: lineDescription(name, sample(over)),
  quantity,
  unitPrice,
  lineTotal: Math.round(quantity * unitPrice * 100) / 100,
  fromSample: true,
});

const free = (description: string, unitPrice: number, quantity = 1): LayoutSourceLine => ({
  description,
  quantity,
  unitPrice,
  lineTotal: Math.round(quantity * unitPrice * 100) / 100,
});

/** A line as the database stores it, read through layoutSourceLine — what the PDF route does. */
const stored = (
  description: string,
  unitPrice: number,
  links: { sampleId: string | null; creditedItem: { sampleId: string | null } | null }
): LayoutSourceLine => layoutSourceLine({ description, quantity: 1, unitPrice, lineTotal: unitPrice, ...links });

const sumCents = (lines: { lineTotal: number }[]) => lines.reduce((sum, line) => sum + Math.round(line.lineTotal * 100), 0);

describe("invoiceLayoutOf", () => {
  it("no parameter is the per-line layout, as before", () => {
    expect(invoiceLayoutOf(null)).toBe("ligne");
    expect(invoiceLayoutOf("")).toBe("ligne");
    expect(invoiceLayoutOf("ligne")).toBe("ligne");
  });

  it("« parametre » is the layout by parameter; anything else is refused", () => {
    expect(invoiceLayoutOf("parametre")).toBe("parametre");
    expect(invoiceLayoutOf("PARAMETRE")).toBeNull();
    expect(invoiceLayoutOf("paramètre")).toBeNull();
    expect(invoiceLayoutOf("x")).toBeNull();
  });

  it("invoicePdfPath: the per-line PDF keeps its address, the other one adds ?modele=parametre", () => {
    expect(invoicePdfPath("cmabc")).toBe("/api/invoices/cmabc/pdf");
    expect(invoicePdfPath("cmabc", "ligne")).toBe("/api/invoices/cmabc/pdf");
    expect(invoicePdfPath("cmabc", "parametre")).toBe("/api/invoices/cmabc/pdf?modele=parametre");
  });
});

describe("billedAnalysis", () => {
  it("reads back what lineDescription wrote, in every domain", () => {
    expect(billedAnalysis(lineDescription("E. coli", sample()))).toEqual({
      analysis: "E. coli (Alimentaire)",
      reference: "480/26-2",
    });
    expect(billedAnalysis(lineDescription("Chlore libre", sample({ type: "EAU", controlCode: null })))).toEqual({
      analysis: "Chlore libre (Eau)",
      reference: "ECH-2026-00001",
    });
    expect(billedAnalysis(lineDescription("Flore totale", sample({ type: "AMBIANCE", produit: "Plan de travail" })))).toEqual({
      analysis: "Flore totale (Ambiance)",
      reference: "480/26-2",
    });
  });

  it("a parameter or a product with brackets, dashes or dots is read whole", () => {
    expect(billedAnalysis(lineDescription("Coliformes (30 °C)", sample({ produit: "Fromage · frais — au lait cru" })))).toEqual({
      analysis: "Coliformes (30 °C) (Alimentaire)",
      reference: "480/26-2",
    });
    expect(billedAnalysis(lineDescription("Absorbance K 232 nm", sample({ produit: "Huile (Eau) d'olive" })))).toEqual({
      analysis: "Absorbance K 232 nm (Alimentaire)",
      reference: "480/26-2",
    });
  });

  it("a line typed by hand is not an analysis", () => {
    expect(billedAnalysis("Déplacement")).toBeNull();
    expect(billedAnalysis("Supplément")).toBeNull();
    expect(billedAnalysis("E. coli")).toBeNull();
    expect(billedAnalysis("Prélèvement sur site & transport")).toBeNull();
    // A domain the catalogue does not know.
    expect(billedAnalysis("E. coli (Lait) · 480/26-2")).toBeNull();
    // No sample reference.
    expect(billedAnalysis("E. coli (Alimentaire)")).toBeNull();
  });
});

describe("layoutSourceLine", () => {
  const worded = lineDescription("E. coli", sample({ controlCode: "A-1" }));

  it("an invoice line with its sample bills an analysis", () => {
    expect(stored(worded, 320, { sampleId: "s1", creditedItem: null })).toEqual({
      description: worded,
      quantity: 1,
      unitPrice: 320,
      lineTotal: 320,
      fromSample: true,
    });
  });

  it("a credit-note line stores no sample: it bills one through the invoice line it takes back", () => {
    const line = stored(worded, 320, { sampleId: null, creditedItem: { sampleId: "s1" } });
    expect(line.fromSample).toBe(true);
    expect(groupLinesByParameter([line])).toEqual([
      { description: "E. coli (Alimentaire)", quantity: 1, unitPrice: 320, lineTotal: 320, references: ["A-1"] },
    ]);
  });

  it("taking back a free line, or no line (a free credit line, an old credit note): a free line, never grouped", () => {
    const lines = [
      stored(worded, 320, { sampleId: null, creditedItem: { sampleId: null } }),
      stored(worded, 320, { sampleId: null, creditedItem: null }),
    ];
    expect(lines.map((line) => line.fromSample)).toEqual([false, false]);
    expect(groupLinesByParameter(lines)).toEqual(
      lines.map(() => ({ description: worded, quantity: 1, unitPrice: 320, lineTotal: 320, references: [] }))
    );
  });
});

describe("groupLinesByParameter", () => {
  it("one line per parameter and price: the number of analyses, the price, the sum, the samples", () => {
    const lines = groupLinesByParameter([
      analysis("E. coli", 320, { controlCode: "480/26-2" }),
      analysis("Salmonelles", 450, { controlCode: "480/26-2" }),
      analysis("E. coli", 320, { controlCode: "480/26-3" }),
      analysis("E. coli", 320, { controlCode: "480/26-4", produit: "Fromage" }),
      analysis("Salmonelles", 450, { controlCode: "480/26-4" }),
    ]);
    expect(lines).toEqual([
      {
        description: "E. coli (Alimentaire)",
        quantity: 3,
        unitPrice: 320,
        lineTotal: 960,
        references: ["480/26-2", "480/26-3", "480/26-4"],
      },
      { description: "Salmonelles (Alimentaire)", quantity: 2, unitPrice: 450, lineTotal: 900, references: ["480/26-2", "480/26-4"] },
    ]);
  });

  it("free lines stay as they are, in their place; a group sits where its first analysis was", () => {
    const lines = groupLinesByParameter([
      free("Déplacement", 145.5),
      analysis("E. coli", 320, { controlCode: "A-1" }),
      free("Supplément", 0.25),
      analysis("E. coli", 320, { controlCode: "A-2" }),
    ]);
    expect(lines.map((line) => [line.description, line.quantity, line.lineTotal])).toEqual([
      ["Déplacement", 1, 145.5],
      ["E. coli (Alimentaire)", 2, 640],
      ["Supplément", 1, 0.25],
    ]);
    expect(lines[0].references).toEqual([]);
  });

  it("another price, or another domain, is another line", () => {
    const lines = groupLinesByParameter([
      analysis("E. coli", 320, { controlCode: "A-1" }),
      analysis("E. coli", 280, { controlCode: "A-2" }),
      analysis("E. coli", 320, { controlCode: "B-1", type: "EAU" }),
      analysis("E. coli", 320, { controlCode: "A-3" }),
    ]);
    expect(lines.map((line) => [line.description, line.quantity, line.unitPrice, line.lineTotal])).toEqual([
      ["E. coli (Alimentaire)", 2, 320, 640],
      ["E. coli (Alimentaire)", 1, 280, 280],
      ["E. coli (Eau)", 1, 320, 320],
    ]);
  });

  it("a line without a sample is never grouped, even worded like an analysis", () => {
    const worded = { ...analysis("E. coli", 320, { controlCode: "A-1" }), fromSample: false };
    const lines = groupLinesByParameter([worded, analysis("E. coli", 320, { controlCode: "A-2" })]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ description: worded.description, quantity: 1, references: [] });
    expect(lines[1]).toMatchObject({ description: "E. coli (Alimentaire)", quantity: 1, references: ["A-2"] });
  });

  it("a quantity counts as that many analyses; a fractional quantity keeps its own line", () => {
    const lines = groupLinesByParameter([
      analysis("E. coli", 320, { controlCode: "A-1" }, 2),
      analysis("E. coli", 320, { controlCode: "A-2" }),
      analysis("E. coli", 320, { controlCode: "A-3" }, 1.5),
    ]);
    expect(lines.map((line) => [line.quantity, line.lineTotal, line.references])).toEqual([
      [3, 960, ["A-1", "A-2"]],
      [1.5, 480, []],
    ]);
  });

  it("a sample counted twice on one parameter is named once", () => {
    const lines = groupLinesByParameter([
      analysis("E. coli", 320, { controlCode: "A-1" }),
      analysis("E. coli", 320, { controlCode: "A-1" }),
    ]);
    expect(lines).toEqual([
      { description: "E. coli (Alimentaire)", quantity: 2, unitPrice: 320, lineTotal: 640, references: ["A-1"] },
    ]);
  });

  it("a credit note groups the same way: its lines bill a sample through the invoice line they take back", () => {
    // As the credit-note route stores them: no sample of their own.
    const lines = groupLinesByParameter([
      stored(lineDescription("E. coli", sample({ controlCode: "A-1" })), 100.1, { sampleId: null, creditedItem: { sampleId: "s1" } }),
      stored(lineDescription("E. coli", sample({ controlCode: "A-2" })), 100.1, { sampleId: null, creditedItem: { sampleId: "s2" } }),
      stored("Geste commercial", 20, { sampleId: null, creditedItem: null }),
    ]);
    expect(lines.map((line) => [line.description, line.quantity, line.lineTotal])).toEqual([
      ["E. coli (Alimentaire)", 2, 200.2],
      ["Geste commercial", 1, 20],
    ]);
  });

  it("an empty invoice gives no line", () => {
    expect(groupLinesByParameter([])).toEqual([]);
  });

  it("adds up to the invoice total HT to the centime, on prices floats get wrong", () => {
    // A large invoice: 6 parameters × 40 samples at awkward prices, plus free
    // lines, cleaned and totalled exactly as the invoice routes do.
    const parameters: [string, number][] = [
      ["E. coli", 0.1],
      ["Salmonelles", 0.2],
      ["Listeria monocytogenes", 33.33],
      ["Flore totale", 12.35],
      ["Levures et moisissures", 1.005],
      ["Staphylocoques", 99999.99],
    ];
    const typed: { description: string; quantity: number; unitPrice: number; sampleId?: string }[] = [];
    for (let s = 1; s <= 40; s++) {
      for (const [name, price] of parameters) {
        if ((s + name.length) % 7 === 0) continue; // not every sample has every analysis
        typed.push({
          description: lineDescription(name, sample({ controlCode: `T-${s}` })),
          quantity: s % 9 === 0 ? 2 : 1,
          unitPrice: price,
          sampleId: `s${s}`,
        });
      }
      if (s % 10 === 0) typed.push({ description: "Prélèvement", quantity: 1.5, unitPrice: 0.19 });
    }
    typed.push({ description: "Déplacement", quantity: 1, unitPrice: 145.5 });

    const checked = checkInvoiceLines(typed, { issue: false });
    if (!checked.ok) throw new Error(checked.error);
    const totals = computeInvoiceTotals(checked.lines, 20);
    const items: LayoutSourceLine[] = checked.lines.map((line) => ({
      description: line.description,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      lineTotal: line.lineTotal,
      fromSample: line.sampleId !== null,
    }));

    const grouped = groupLinesByParameter(items);
    // 6 parameter lines, the 4 « Prélèvement » and the « Déplacement ».
    expect(grouped).toHaveLength(11);
    expect(sumCents(grouped)).toBe(sumCents(items));
    expect(sumCents(grouped)).toBe(Math.round(totals.subtotal * 100));
    // Every grouped line reads right: quantity × unit price = its amount.
    for (const line of grouped.filter((entry) => entry.references.length > 0)) {
      expect(Math.round(line.quantity * line.unitPrice * 100)).toBe(Math.round(line.lineTotal * 100));
    }
    // The number of analyses is kept.
    const analyses = (lines: LayoutSourceLine[]) =>
      lines.filter((line) => line.fromSample).reduce((sum, line) => sum + line.quantity, 0);
    expect(grouped.filter((entry) => entry.references.length > 0).reduce((sum, line) => sum + line.quantity, 0)).toBe(
      analyses(items)
    );
  });
});
