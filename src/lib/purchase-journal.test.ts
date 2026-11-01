import { describe, expect, it } from "vitest";
import { parseIsoDay } from "./date-only";
import {
  EXTRA_PURCHASE_COLUMNS,
  LAB_PURCHASE_COLUMNS,
  monthLabel,
  paymentTermLabel,
  purchaseJournalFileName,
  purchaseJournalHref,
  purchaseJournalRows,
  purchaseJournalTotals,
  purchasePaymentRows,
  purchasePaymentsTotal,
  purchasePeriod,
  withholdingRows,
  withholdingTotal,
  type PurchaseJournalInvoice,
} from "./purchase-journal";

/**
 * Lot 3D, M2 — le « Journal des achats »: the laboratory's 13 columns in
 * their order (the template « Journal Achat », fichier 3.3), then ours; the
 * month / year filter; the totals; the état des retenues (M7).
 */

const d = (day: string) => parseIsoDay(day) as Date;
const labDay = (at: Date) => at.toISOString().slice(0, 10);
const now = d("2026-11-01");

const invoice = (patch: Partial<PurchaseJournalInvoice> = {}): PurchaseJournalInvoice => ({
  supplier: { name: "Fournisseur A", ice: "001234567000011", paymentTermDays: 30 },
  number: "F-1",
  label: null,
  issueDate: d("2026-10-05"),
  dueDate: d("2026-11-04"),
  status: "A_PAYER",
  paidAt: null,
  amount: 1200,
  amountHT: 1000,
  vatRate: 20,
  vatAmount: 200,
  currency: null,
  amountForeign: null,
  exchangeRate: null,
  paymentMethod: null,
  paymentReference: null,
  withholdingRate: null,
  withholdingAmount: null,
  certificate: "ABSENTE",
  payments: [],
  ...patch,
});

describe("the journal's columns", () => {
  it("keeps the laboratory's 13 columns, in their order, first", () => {
    expect(LAB_PURCHASE_COLUMNS.map((column) => column.header)).toEqual([
      "Fournisseurs",
      "Délai de paiement",
      "N° Facture",
      "Mois",
      "Date",
      "Échéance",
      "Montant HT",
      "TVA",
      "Montant TTC",
      "Euro",
      "Statut",
      "Date paiement",
      "Mode de paiement",
    ]);
  });

  it("adds the retenue, the net à payer and the attestation after them (M7)", () => {
    const headers = EXTRA_PURCHASE_COLUMNS.map((column) => column.header);
    expect(headers).toContain("Retenue à la source");
    expect(headers).toContain("Net à payer");
    expect(headers).toContain("Attestation fiscale");
  });
});

describe("purchaseJournalRows", () => {
  it("fills the 13 columns of an invoice still to pay", () => {
    const [row] = purchaseJournalRows([invoice()], { now, labDay });
    expect(row).toMatchObject({
      supplier: "Fournisseur A",
      paymentTerm: "30 jours",
      number: "F-1",
      month: "octobre 2026",
      ht: 1000,
      tva: 200,
      ttc: 1200,
      euro: null,
      status: "À payer",
      paidDay: null,
      paymentMode: "",
      net: 1200,
      remaining: 1200,
      certificate: "Sans attestation",
    });
    expect(row.day.toISOString().slice(0, 10)).toBe("2026-10-05");
  });

  it("dates the payment by the last one, with its method and reference; partly paid reads so", () => {
    const [partly] = purchaseJournalRows(
      [invoice({ payments: [{ paidOn: d("2026-10-20"), amount: 200, method: "CHEQUE", reference: "CHQ 1" }] })],
      { now, labDay }
    );
    expect(partly).toMatchObject({ status: "Partiellement payée", paymentMode: "Chèque", reference: "CHQ 1", paid: 200, remaining: 1000 });
    expect(partly.paidDay?.toISOString().slice(0, 10)).toBe("2026-10-20");
  });

  it("reads an invoice paid before lot 3D by its paidAt, paid in full", () => {
    const [row] = purchaseJournalRows([invoice({ status: "PAYEE", paidAt: new Date("2026-10-21T15:00:00Z"), amountHT: null, vatAmount: null, vatRate: null })], {
      now,
      labDay,
    });
    expect(row).toMatchObject({ status: "Payée", ht: null, tva: null, paid: 1200, remaining: 0 });
    expect(row.paidDay?.toISOString().slice(0, 10)).toBe("2026-10-21");
  });

  it("puts euros in « Euro », another currency in « Devise »", () => {
    const [eur, usd] = purchaseJournalRows(
      [invoice({ currency: "EUR", amountForeign: 110.5 }), invoice({ number: "F-2", currency: "USD", amountForeign: 120 })],
      { now, labDay }
    );
    expect(eur).toMatchObject({ euro: 110.5, currency: "", amountForeign: null });
    expect(usd).toMatchObject({ euro: null, currency: "USD", amountForeign: 120 });
  });

  it("nets the retenue and says « En retard » past the due day", () => {
    const [row] = purchaseJournalRows(
      [invoice({ dueDate: d("2026-10-20"), withholdingRate: 75, withholdingAmount: 150, certificate: "VALIDE" })],
      { now, labDay }
    );
    expect(row).toMatchObject({ status: "En retard", withholding: 150, net: 1050, remaining: 1050, certificate: "Attestation valide" });
  });

  it("labels the payment term and the month", () => {
    expect(paymentTermLabel(0)).toBe("Comptant");
    expect(paymentTermLabel(1)).toBe("1 jour");
    expect(paymentTermLabel(60)).toBe("60 jours");
    expect(monthLabel(d("2026-02-01"))).toBe("février 2026");
  });
});

describe("the totals", () => {
  it("sums HT, TVA, TTC, retenue, net, paid and left; counts the TTC-only invoices", () => {
    const rows = purchaseJournalRows(
      [
        invoice(),
        invoice({ number: "F-2", amount: 0.3, amountHT: 0.25, vatAmount: 0.05, withholdingAmount: 0.1 }),
        invoice({ number: "F-3", amount: 100, amountHT: null, vatAmount: null, currency: "EUR", amountForeign: 9.2 }),
      ],
      { now, labDay }
    );
    expect(purchaseJournalTotals(rows)).toEqual({
      ht: 1000.25,
      tva: 200.05,
      ttc: 1300.3,
      euro: 9.2,
      withholding: 0.1,
      net: 1300.2,
      paid: 0,
      remaining: 1300.2,
      ttcOnly: 1,
    });
  });
});

describe("the état des retenues and the payments (M7)", () => {
  it("lists the invoices with an amount withheld, on the settings' base", () => {
    const invoices = [invoice({ withholdingRate: 75, withholdingAmount: 150, certificate: "VALIDE" }), invoice({ number: "F-2" })];
    const rows = withholdingRows(invoices, "TVA");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ supplier: "Fournisseur A", ice: "001234567000011", base: "Montant de la TVA", baseAmount: 200, rate: 75, amount: 150 });
    expect(withholdingTotal(rows)).toBe(150);
  });

  it("reads each invoice on the base stored with its retenue, the settings' only for an older one (review of 01/11)", () => {
    // Computed on the TVA, then the settings moved to the HT: the row keeps the TVA.
    const kept = withholdingRows([invoice({ withholdingRate: 75, withholdingAmount: 150, withholdingBase: "TVA" })], "HT");
    expect(kept[0]).toMatchObject({ base: "Montant de la TVA", baseAmount: 200, rate: 75, amount: 150 });
    const older = withholdingRows([invoice({ withholdingRate: 1.5, withholdingAmount: 15, withholdingBase: null })], "HT");
    expect(older[0]).toMatchObject({ base: "Montant HT", baseAmount: 1000, amount: 15 });
  });

  it("lists the payments of the period with their supplier and invoice", () => {
    const rows = purchasePaymentRows([
      { paidOn: d("2026-10-20"), amount: 0.1, method: "VIREMENT", reference: null, invoice: { number: "F-1", supplier: { name: "A" } } },
      { paidOn: d("2026-10-21"), amount: 0.2, method: "ESPECES", reference: "R", invoice: { number: "F-2", supplier: { name: "B" } } },
    ]);
    expect(rows.map((row) => row.method)).toEqual(["Virement", "Espèces"]);
    expect(purchasePaymentsTotal(rows)).toBe(0.3);
  });
});

describe("the period and the file", () => {
  it("reads a month, a year or a range of days; refuses what it cannot read", () => {
    const month = purchasePeriod({ mois: "2026-10" });
    expect(month.ok && [month.period.from?.toISOString().slice(0, 10), month.period.until?.toISOString().slice(0, 10), month.period.slug]).toEqual([
      "2026-10-01",
      "2026-11-01",
      "2026-10",
    ]);
    const december = purchasePeriod({ mois: "2026-12" });
    expect(december.ok && december.period.until?.toISOString().slice(0, 10)).toBe("2027-01-01");
    const year = purchasePeriod({ annee: "2026" });
    expect(year.ok && year.period.until?.toISOString().slice(0, 10)).toBe("2027-01-01");
    const range = purchasePeriod({ du: "2026-10-01", au: "2026-10-15" });
    expect(range.ok && [range.period.until?.toISOString().slice(0, 10), range.period.slug]).toEqual(["2026-10-16", "2026-10-01-au-2026-10-15"]);
    const all = purchasePeriod({});
    expect(all.ok && all.period).toEqual({ from: null, until: null, slug: null });
    expect(purchasePeriod({ mois: "2026-13" }).ok).toBe(false);
    expect(purchasePeriod({ annee: "26" }).ok).toBe(false);
    expect(purchasePeriod({ du: "2026-02-30" }).ok).toBe(false);
    expect(purchasePeriod({ du: "2026-10-15", au: "2026-10-01" }).ok).toBe(false);
  });

  it("names the file after the period and builds the export's address", () => {
    expect(purchaseJournalFileName({ from: null, until: null, slug: "2026-10" }, "2026-11-01")).toBe("journal-des-achats-2026-10.xlsx");
    expect(purchaseJournalFileName({ from: null, until: null, slug: null }, "2026-11-01")).toBe("journal-des-achats-au-2026-11-01.xlsx");
    expect(purchaseJournalHref({ mois: "2026-10" })).toBe("/api/purchase-invoices/export?mois=2026-10");
    expect(purchaseJournalHref({ annee: "2026" })).toBe("/api/purchase-invoices/export?annee=2026");
    expect(purchaseJournalHref({})).toBe("/api/purchase-invoices/export");
  });
});
