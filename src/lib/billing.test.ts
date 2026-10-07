import { describe, it, expect } from "vitest";
import {
  proposeLines,
  lineDescription,
  buildCatalogueIndex,
  checkInvoiceLines,
  cleanCreditNoteLines,
  cleanTaxRate,
  creditNoteLinesRefusal,
  creditNoteRefusal,
  holdingInvoiceItemWhere,
  holdsSamples,
  invoiceActions,
  invoiceAmounts,
  isLockConflict,
  LOCK_CONFLICT_MESSAGE,
  parsePaidAt,
  paymentRefusal,
  unpricedLineRefusal,
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

describe("which invoices hold their samples (FACTURATION.md §1–2)", () => {
  it("a draft reserves, an issued invoice bills, paid or not", () => {
    expect(holdsSamples({ kind: "FACTURE", status: "BROUILLON" })).toBe(true);
    expect(holdsSamples({ kind: "FACTURE", status: "EN_ATTENTE" })).toBe(true);
    expect(holdsSamples({ kind: "FACTURE", status: "PAYEE" })).toBe(true);
  });

  it("a cancelled invoice releases its samples; a credit note never holds one", () => {
    expect(holdsSamples({ kind: "FACTURE", status: "ANNULEE" })).toBe(false);
    expect(holdsSamples({ kind: "AVOIR", status: "EN_ATTENTE" })).toBe(false);
  });

  it("the Prisma filter says the same, and can leave the edited draft out", () => {
    expect(holdingInvoiceItemWhere()).toEqual({
      invoice: { is: { kind: "FACTURE", status: { in: ["BROUILLON", "EN_ATTENTE", "PAYEE"] } } },
    });
    expect(holdingInvoiceItemWhere("inv1")).toEqual({
      invoice: {
        is: { kind: "FACTURE", status: { in: ["BROUILLON", "EN_ATTENTE", "PAYEE"] }, id: { not: "inv1" } },
      },
    });
  });
});

describe("checkInvoiceLines", () => {
  it("cleans the lines: blank ones dropped, prices to the centime, totals per line", () => {
    const result = checkInvoiceLines(
      [
        { description: "  Flore totale  ", quantity: 2, unitPrice: 12.345, sampleId: "s1" },
        { description: "", quantity: 1, unitPrice: 10 },
        { description: "Déplacement", quantity: "1", unitPrice: "150,5" },
      ],
      { issue: true }
    );
    expect(result).toEqual({
      ok: true,
      lines: [
        { description: "Flore totale", quantity: 2, unitPrice: 12.35, lineTotal: 24.7, sampleId: "s1" },
        { description: "Déplacement", quantity: 1, unitPrice: 150.5, lineTotal: 150.5, sampleId: null },
      ],
    });
  });

  it("needs at least one line", () => {
    expect(checkInvoiceLines([], { issue: false })).toEqual({
      ok: false,
      error: "Ajoutez au moins une ligne de prestation valide.",
    });
    expect(checkInvoiceLines(undefined, { issue: false }).ok).toBe(false);
    expect(checkInvoiceLines("n'importe quoi", { issue: false }).ok).toBe(false);
  });

  it("refuses a nonsensical quantity or price, and out-of-bounds amounts", () => {
    expect(checkInvoiceLines([{ description: "A", quantity: 0, unitPrice: 1 }], { issue: false })).toMatchObject({
      ok: false,
      error: "Quantité invalide pour « A ».",
    });
    expect(checkInvoiceLines([{ description: "A", quantity: 1, unitPrice: -1 }], { issue: false })).toMatchObject({
      ok: false,
      error: "Prix unitaire invalide pour « A ».",
    });
    expect(checkInvoiceLines([{ description: "A", quantity: 1, unitPrice: 2e7 }], { issue: false })).toMatchObject({
      ok: false,
      error: "Montant hors limites pour « A ».",
    });
    expect(checkInvoiceLines([{ description: "x".repeat(192), quantity: 1, unitPrice: 1 }], { issue: false }).ok).toBe(false);
  });

  it("a draft may keep an analysis at 0; issuing may not", () => {
    const lines = [{ description: "Salmonelles", quantity: 1, unitPrice: 0, sampleId: "s1" }];
    expect(checkInvoiceLines(lines, { issue: false }).ok).toBe(true);
    const issued = checkInvoiceLines(lines, { issue: true });
    expect(issued.ok).toBe(false);
    expect(!issued.ok && issued.error).toMatch(/^Tarif manquant pour « Salmonelles »/);
    // A free line typed by hand at 0 is the accountant's call.
    expect(checkInvoiceLines([{ description: "Geste commercial", quantity: 1, unitPrice: 0 }], { issue: true }).ok).toBe(true);
  });

  it("unpricedLineRefusal reads the stored lines of a draft", () => {
    expect(unpricedLineRefusal([{ description: "Libre", unitPrice: "0.00", sampleId: null }])).toBeNull();
    expect(unpricedLineRefusal([{ description: "E. coli", unitPrice: "0.00", sampleId: "s1" }])).toMatch(/E\. coli/);
    expect(unpricedLineRefusal([{ description: "E. coli", unitPrice: "320.00", sampleId: "s1" }])).toBeNull();
  });
});

describe("cleanTaxRate", () => {
  it("clamps VAT to 0–100 and rounds it", () => {
    expect(cleanTaxRate(20)).toBe(20);
    expect(cleanTaxRate("7.555")).toBe(7.56);
    expect(cleanTaxRate(-5)).toBe(0);
    expect(cleanTaxRate(250)).toBe(100);
    expect(cleanTaxRate("abc")).toBe(0);
    expect(cleanTaxRate(undefined)).toBe(0);
  });
});

describe("invoiceAmounts", () => {
  it("an issued invoice: settled, credited, left to pay, state", () => {
    expect(
      invoiceAmounts({ kind: "FACTURE", status: "EN_ATTENTE", total: "1200.00", payments: ["300.10", 99.9], creditNotes: ["200"] })
    ).toEqual({ paidAmount: 400, creditedAmount: 200, balance: 600, remainingCreditable: 1000, state: "PARTIELLEMENT_PAYEE" });
  });

  it("nothing to collect nor to credit on a draft, a cancelled invoice or a credit note", () => {
    for (const invoice of [
      { kind: "FACTURE" as const, status: "BROUILLON" as const },
      { kind: "FACTURE" as const, status: "ANNULEE" as const },
      { kind: "AVOIR" as const, status: "EN_ATTENTE" as const },
    ]) {
      const amounts = invoiceAmounts({ ...invoice, total: 500, payments: [], creditNotes: [] });
      expect(amounts.balance).toBe(0);
      expect(amounts.remainingCreditable).toBe(0);
    }
  });

  it("a paid invoice later credited reads « Payée » with nothing left", () => {
    const amounts = invoiceAmounts({ kind: "FACTURE", status: "PAYEE", total: 100, payments: [100], creditNotes: [30] });
    expect(amounts.balance).toBe(0);
    expect(amounts.state).toBe("PAYEE");
    expect(amounts.remainingCreditable).toBe(70);
  });
});

describe("invoiceActions", () => {
  const amounts = (balance: number, remainingCreditable: number, creditedAmount = 0) => ({
    balance,
    remainingCreditable,
    creditedAmount,
  });

  it("a draft: edit, delete, issue — nothing else", () => {
    expect(invoiceActions({ kind: "FACTURE", status: "BROUILLON" }, amounts(0, 0), 0)).toEqual({
      canEdit: true,
      canDelete: true,
      canIssue: true,
      canCancel: false,
      canCreditNote: false,
      canRecordPayment: false,
    });
  });

  it("an issued invoice without settlement: cancel, credit note, settlement", () => {
    expect(invoiceActions({ kind: "FACTURE", status: "EN_ATTENTE" }, amounts(100, 100), 0)).toEqual({
      canEdit: false,
      canDelete: false,
      canIssue: false,
      canCancel: true,
      canCreditNote: true,
      canRecordPayment: true,
    });
  });

  it("a settled invoice is no longer cancelled; one fully credited takes no more credit note", () => {
    const paid = invoiceActions({ kind: "FACTURE", status: "PAYEE" }, amounts(0, 100), 1);
    expect(paid.canCancel).toBe(false);
    expect(paid.canRecordPayment).toBe(false);
    expect(paid.canCreditNote).toBe(true);
    const credited = invoiceActions({ kind: "FACTURE", status: "PAYEE" }, amounts(0, 0, 100), 0);
    expect(credited.canCreditNote).toBe(false);
    expect(credited.canCancel).toBe(false);
  });

  it("a cancelled invoice and a credit note offer nothing", () => {
    for (const invoice of [
      { kind: "FACTURE" as const, status: "ANNULEE" as const },
      { kind: "AVOIR" as const, status: "EN_ATTENTE" as const },
    ]) {
      expect(Object.values(invoiceActions(invoice, amounts(0, 0), 0)).some(Boolean)).toBe(false);
    }
  });
});

describe("paymentRefusal / creditNoteRefusal", () => {
  it("only an issued, non-cancelled invoice takes a settlement or a credit note", () => {
    expect(paymentRefusal({ kind: "FACTURE", status: "EN_ATTENTE" })).toBeNull();
    expect(paymentRefusal({ kind: "FACTURE", status: "PAYEE" })).toBeNull();
    expect(paymentRefusal({ kind: "FACTURE", status: "BROUILLON" })).toMatch(/Émettez la facture/);
    expect(paymentRefusal({ kind: "FACTURE", status: "ANNULEE" })).toMatch(/annulée/);
    expect(paymentRefusal({ kind: "AVOIR", status: "EN_ATTENTE" })).toMatch(/avoir/);

    expect(creditNoteRefusal({ kind: "FACTURE", status: "PAYEE" })).toBeNull();
    expect(creditNoteRefusal({ kind: "FACTURE", status: "BROUILLON" })).toMatch(/brouillon/);
    expect(creditNoteRefusal({ kind: "FACTURE", status: "ANNULEE" })).toMatch(/annulée/);
    expect(creditNoteRefusal({ kind: "AVOIR", status: "EN_ATTENTE" })).toMatch(/autre avoir/);
  });
});

describe("credit-note lines", () => {
  const items = [{ id: "it1", quantity: 2, unitPrice: "320.00" }];

  it("cleans the typed lines and never keeps a sample", () => {
    const result = cleanCreditNoteLines([
      { description: " Remise ", quantity: "1", unitPrice: "50,555", invoiceItemId: "it1", sampleId: "s1" },
      { description: "  ", quantity: 1, unitPrice: 1 },
    ]);
    expect(result).toEqual({
      ok: true,
      lines: [{ description: "Remise", quantity: 1, unitPrice: 50.56, invoiceItemId: "it1" }],
    });
    expect(cleanCreditNoteLines("rien").ok).toBe(false);
  });

  it("a line taken back may lower quantity or price, never raise them", () => {
    expect(creditNoteLinesRefusal([{ description: "A", quantity: 1, unitPrice: 320, invoiceItemId: "it1" }], items)).toBeNull();
    expect(creditNoteLinesRefusal([{ description: "A", quantity: 3, unitPrice: 100, invoiceItemId: "it1" }], items)).toMatch(
      /quantité reprise \(3\) dépasse/
    );
    expect(creditNoteLinesRefusal([{ description: "A", quantity: 1, unitPrice: 320.01, invoiceItemId: "it1" }], items)).toMatch(
      /prix repris dépasse/
    );
    expect(creditNoteLinesRefusal([{ description: "A", quantity: 1, unitPrice: 1, invoiceItemId: "autre" }], items)).toMatch(
      /n'appartient pas à cette facture/
    );
  });

  it("a free line is bounded by the total only", () => {
    expect(creditNoteLinesRefusal([{ description: "Geste", quantity: 10, unitPrice: 9999, invoiceItemId: null }], items)).toBeNull();
  });
});

describe("parsePaidAt", () => {
  const now = new Date("2026-10-07T15:00:00Z");

  it("takes a day or a full time, up to today", () => {
    const day = parsePaidAt("2026-10-07", now);
    expect(day.ok && day.date.toISOString()).toBe("2026-10-07T00:00:00.000Z");
    expect(parsePaidAt("2026-09-30T10:00:00Z", now).ok).toBe(true);
  });

  it("refuses a missing, invalid or future date", () => {
    expect(parsePaidAt(undefined, now)).toEqual({ ok: false, error: "Indiquez la date du règlement." });
    expect(parsePaidAt("demain", now)).toEqual({ ok: false, error: "Date du règlement invalide." });
    expect(parsePaidAt("1999-12-31", now)).toEqual({ ok: false, error: "Date du règlement invalide." });
    expect(parsePaidAt("2026-10-08", now)).toEqual({ ok: false, error: "La date du règlement est dans le futur." });
  });
});

describe("money rounding of the stored lines (review 08/10)", () => {
  it("stores a line total that adds up with computeInvoiceTotals, half-centimes up", () => {
    // 1,5 × 0,19 = 0,285 is held by floating point as 0.28499999999999998:
    // the line used to be stored at 0,28 while it reads 0,29 on paper.
    const checked = checkInvoiceLines([{ description: "Prélèvement", quantity: 1.5, unitPrice: 0.19 }], {
      issue: true,
    });
    expect(checked.ok && checked.lines[0].lineTotal).toBe(0.29);
  });

  it("rounds a typed price to the centime, half up", () => {
    const checked = checkInvoiceLines([{ description: "Analyse", quantity: 1, unitPrice: "1,005" }], {
      issue: true,
    });
    expect(checked.ok && checked.lines[0].unitPrice).toBe(1.01);
  });
});

describe("isLockConflict", () => {
  it("recognises a deadlock, a lock wait timeout and an expired transaction", () => {
    expect(isLockConflict({ code: "P2034", message: "Transaction failed due to a write conflict or a deadlock" })).toBe(true);
    expect(isLockConflict({ code: "P2028", message: "Transaction already closed" })).toBe(true);
    expect(isLockConflict({ code: "P2010", meta: { code: "1213" }, message: "Raw query failed" })).toBe(true);
    expect(isLockConflict({ code: "P2010", meta: { code: 1205 }, message: "Raw query failed" })).toBe(true);
    expect(isLockConflict(new Error("Deadlock found when trying to get lock; try restarting transaction"))).toBe(true);
  });

  it("leaves every other failure to the 500", () => {
    expect(isLockConflict({ code: "P2002", meta: { target: ["number"] } })).toBe(false);
    expect(isLockConflict(new Error("Connection refused"))).toBe(false);
    expect(isLockConflict(null)).toBe(false);
    expect(isLockConflict("Deadlock")).toBe(false);
  });

  it("tells the accountant nothing was written", () => {
    expect(LOCK_CONFLICT_MESSAGE).toMatch(/Rien n'a été enregistré : réessayez\./);
  });
});
