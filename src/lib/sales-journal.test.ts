import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  EXPORT_PRESET_LABELS,
  attachmentFileName,
  excelDay,
  exportPeriodError,
  exportPresets,
  salesJournalFileName,
  salesJournalHref,
  salesJournalColumns,
  salesJournalRows,
  salesJournalTotals,
  settlementRows,
  settlementsTotal,
  type SalesJournalInvoice,
} from "./sales-journal";
import { invoiceClientIdentity } from "./invoice-client-identity";

const invoice = (overrides: Partial<SalesJournalInvoice> = {}): SalesJournalInvoice => ({
  number: "FAC-2026-0001",
  kind: "FACTURE",
  status: "EN_ATTENTE",
  issuedAt: new Date("2026-10-05T10:00:00.000Z"),
  subtotal: "1000.00",
  taxAmount: "200.00",
  total: "1200.00",
  client: { name: "Labo Test", ice: "001234567000089", fiscalId: "40123456", tradeRegister: "12345 Ville" },
  creditedInvoice: null,
  payments: [],
  creditNotes: [],
  ...overrides,
});

describe("excelDay", () => {
  it("is the lab's calendar day as a UTC midnight", () => {
    expect(excelDay(new Date("2026-10-09T23:30:00.000Z"))).toEqual(new Date("2026-10-09T00:00:00.000Z"));
    // Before 20/09/2026 the lab's clock was UTC+1 (outside Ramadan): 23:30 UTC was already the next day.
    expect(excelDay(new Date("2026-01-10T23:30:00.000Z"))).toEqual(new Date("2026-01-11T00:00:00.000Z"));
  });
});

describe("salesJournalRows", () => {
  it("writes an issued invoice with what is left to pay today", () => {
    const [row] = salesJournalRows([invoice({ payments: ["200.00", "100.10"], creditNotes: ["120.00"] })]);
    expect(row).toEqual({
      day: new Date("2026-10-05T00:00:00.000Z"),
      number: "FAC-2026-0001",
      type: "Facture",
      originNumber: "",
      client: "Labo Test",
      ice: "001234567000089",
      fiscalId: "40123456",
      tradeRegister: "12345 Ville",
      ht: 1000,
      tva: 200,
      ttc: 1200,
      state: "Partiellement payée",
      cancelled: false,
      remaining: 779.9,
    });
  });

  it("writes a credit note in negative, with the invoice it corrects and nothing to collect", () => {
    const [row] = salesJournalRows([
      invoice({
        number: "AV-2026-0001",
        kind: "AVOIR",
        status: "PAYEE",
        subtotal: "100.00",
        taxAmount: "20.00",
        total: "120.00",
        creditedInvoice: { number: "FAC-2026-0001" },
      }),
    ]);
    expect(row).toMatchObject({
      number: "AV-2026-0001",
      type: "Avoir",
      originNumber: "FAC-2026-0001",
      ht: -100,
      tva: -20,
      ttc: -120,
      state: "Avoir",
      cancelled: false,
      remaining: null,
    });
  });

  it("keeps a cancelled invoice, marked, with nothing to collect", () => {
    const [row] = salesJournalRows([invoice({ status: "ANNULEE" })]);
    expect(row).toMatchObject({ state: "Annulée", cancelled: true, remaining: null, ttc: 1200 });
  });

  it("reads a fully settled invoice and one of 0,00 as « Payée »", () => {
    const rows = salesJournalRows([
      invoice({ status: "PAYEE", payments: ["1200.00"] }),
      invoice({ status: "PAYEE", subtotal: 0, taxAmount: 0, total: 0 }),
    ]);
    expect(rows.map((row) => [row.state, row.remaining])).toEqual([
      ["Payée", 0],
      ["Payée", 0],
    ]);
  });

  it("prints an empty ICE when the client has none", () => {
    expect(
      salesJournalRows([invoice({ client: { name: "Sans ICE", ice: null, fiscalId: null, tradeRegister: null } })])[0].ice
    ).toBe("");
  });

  it("prints an empty IF and RC when the document holds none (a snapshot before 20/10, H2)", () => {
    const [row] = salesJournalRows([
      invoice({ client: { name: "TEST UI Client", ice: "001234567000089", fiscalId: null, tradeRegister: null } }),
    ]);
    expect(row).toMatchObject({ ice: "001234567000089", fiscalId: "", tradeRegister: "" });
  });
});

describe("salesJournalColumns — the « Journal des ventes » sheet (H2, Q85)", () => {
  const columns = salesJournalColumns("20/10/2026");

  it("names the client with its three identifiers, ICE, IF, RC, right after its name", () => {
    const headers = columns.map((column) => column.header);
    const at = headers.indexOf("Client");
    expect(headers.slice(at, at + 4)).toEqual(["Client", "ICE", "IF", "RC"]);
    expect(columns.slice(at + 1, at + 4).map((column) => column.key)).toEqual(["ice", "fiscalId", "tradeRegister"]);
  });

  it("does not export the client's address (re-ask R-2)", () => {
    expect(columns.map((column) => column.header.toLowerCase())).not.toContain("adresse");
    expect(columns.map((column) => column.key as string)).not.toContain("address");
  });

  it("keeps the other columns in their order, money and day formats included", () => {
    expect(columns.map((column) => column.header)).toEqual([
      "Date",
      "N°",
      "Facture / Avoir",
      "N° de facture d'origine",
      "Client",
      "ICE",
      "IF",
      "RC",
      "HT",
      "TVA",
      "TTC",
      "État",
      "Annulée",
      "Reste à payer au 20/10/2026",
    ]);
    expect(columns.filter((column) => column.format === "money").map((column) => column.key)).toEqual([
      "ht",
      "tva",
      "ttc",
      "remaining",
    ]);
    expect(columns.filter((column) => column.format === "day").map((column) => column.key)).toEqual(["day"]);
  });

  it("every column reads a key of the row", () => {
    const [row] = salesJournalRows([invoice()]);
    for (const column of columns) expect(row, column.header).toHaveProperty(column.key);
  });

  it("is what GET /api/invoices/export writes: no inline column list, the identity the document keeps", () => {
    const route = readFileSync(fileURLToPath(new URL("../app/api/invoices/export/route.ts", import.meta.url)), "utf8");
    expect(route).toMatch(/journal\.columns = salesJournalColumns\(/);
    // An inline list (as before H2) would drop the IF and the RC with every test still green.
    expect(route).not.toContain('header: "ICE"');
    expect(route).not.toContain('key: "ice"');
    // The rows' client is the identity frozen on the document (snapshot, else the live client).
    expect(route).toContain("client: { select: CLIENT_IDENTITY_SELECT }");
    expect(route).toContain("client: invoiceClientIdentity(invoice)");
  });
});

describe("salesJournalTotals", () => {
  it("nets the credit notes and leaves the cancelled invoices out, in centimes", () => {
    const rows = salesJournalRows([
      invoice({ subtotal: "0.10", taxAmount: "0.02", total: "0.12" }),
      invoice({ subtotal: "0.20", taxAmount: "0.04", total: "0.24" }),
      invoice({ status: "ANNULEE", subtotal: "500.00", taxAmount: "100.00", total: "600.00" }),
      invoice({ kind: "AVOIR", status: "PAYEE", subtotal: "0.10", taxAmount: "0.02", total: "0.12" }),
    ]);
    expect(salesJournalTotals(rows)).toEqual({ ht: 0.2, tva: 0.04, ttc: 0.24, remaining: 0.36, cancelledCount: 1 });
  });

  it("is zero for an empty period", () => {
    expect(salesJournalTotals([])).toEqual({ ht: 0, tva: 0, ttc: 0, remaining: 0, cancelledCount: 0 });
  });
});

describe("settlements", () => {
  it("writes one row per settlement with its mode in French", () => {
    const rows = settlementRows([
      {
        paidAt: new Date("2026-10-06T09:00:00.000Z"),
        amount: "300.10",
        mode: "CHEQUE",
        reference: "CHQ 123456",
        invoice: { number: "FAC-2026-0001", client: { name: "Labo Test" } },
      },
      {
        paidAt: new Date("2026-10-07T09:00:00.000Z"),
        amount: 0.2,
        mode: "VIREMENT",
        reference: null,
        invoice: { number: "FAC-2026-0002", client: { name: "Autre" } },
      },
    ]);
    expect(rows[0]).toEqual({
      day: new Date("2026-10-06T00:00:00.000Z"),
      invoice: "FAC-2026-0001",
      client: "Labo Test",
      mode: "Chèque",
      amount: 300.1,
      reference: "CHQ 123456",
    });
    expect(rows[1]).toMatchObject({ mode: "Virement", reference: "" });
    expect(settlementsTotal(rows)).toBe(300.3);
  });
});

describe("period and links", () => {
  it("refuses a date that is present but not a real day", () => {
    expect(exportPeriodError("2026-10-01", "2026-10-31")).toBeNull();
    expect(exportPeriodError(null, "")).toBeNull();
    expect(exportPeriodError("2026-02-30", null)).toMatch(/début/);
    expect(exportPeriodError(null, "31/10/2026")).toMatch(/fin/);
  });

  it("builds the export's address", () => {
    expect(salesJournalHref({ du: "2026-10-01", au: "2026-10-31" })).toBe("/api/invoices/export?du=2026-10-01&au=2026-10-31");
    expect(salesJournalHref({ du: "", au: "2026-10-31" })).toBe("/api/invoices/export?au=2026-10-31");
    expect(salesJournalHref({})).toBe("/api/invoices/export");
  });

  it("names the file after the period", () => {
    expect(salesJournalFileName("2026-10-01", "2026-10-31", "2026-10-10")).toBe("journal-des-ventes-2026-10-01-au-2026-10-31.xlsx");
    expect(salesJournalFileName("2026-10-01", null, "2026-10-10")).toBe("journal-des-ventes-depuis-2026-10-01.xlsx");
    expect(salesJournalFileName(null, "2026-10-31", "2026-10-10")).toBe("journal-des-ventes-jusqu-au-2026-10-31.xlsx");
    expect(salesJournalFileName(null, null, "2026-10-10")).toBe("journal-des-ventes-au-2026-10-10.xlsx");
  });

  it("reads the file name back from the response", () => {
    expect(attachmentFileName('attachment; filename="journal-des-ventes-au-2026-10-10.xlsx"')).toBe(
      "journal-des-ventes-au-2026-10-10.xlsx"
    );
    expect(attachmentFileName(null)).toBeNull();
    expect(attachmentFileName("inline")).toBeNull();
  });

  it("offers the month so far, the previous month and the year so far", () => {
    expect(exportPresets("2026-10-10")).toEqual([
      { label: "Mois en cours", du: "2026-10-01", au: "2026-10-10" },
      { label: "Mois précédent", du: "2026-09-01", au: "2026-09-30" },
      { label: "Année en cours", du: "2026-01-01", au: "2026-10-10" },
    ]);
    // January: the previous month is last year's December.
    expect(exportPresets("2027-01-05")[1]).toEqual({ label: "Mois précédent", du: "2026-12-01", au: "2026-12-31" });
    // March of a leap year: February has 29 days.
    expect(exportPresets("2028-03-02")[1]).toEqual({ label: "Mois précédent", du: "2028-02-01", au: "2028-02-29" });
    expect(exportPresets("pas une date")).toEqual([]);
    expect(exportPresets("2026-10-10").map((choice) => choice.label)).toEqual([...EXPORT_PRESET_LABELS]);
  });
});

describe("the export reads the IF and the RC frozen on the document (H2)", () => {
  const live = {
    name: "TEST UI Client (renommé)",
    address: null,
    contact: null,
    phone: null,
    email: null,
    ice: "001234567000089",
    fiscalId: "99999999",
    tradeRegister: "9999 Ville",
  };

  it("an invoice issued with them exports them, whatever the client has become", () => {
    const frozen = { ...live, name: "TEST UI Client", fiscalId: "40123456", tradeRegister: "12345 Ville" };
    const client = invoiceClientIdentity({ number: "FAC-2026-0001", clientSnapshot: frozen, client: live });
    expect(salesJournalRows([invoice({ client })])[0]).toMatchObject({
      client: "TEST UI Client",
      fiscalId: "40123456",
      tradeRegister: "12345 Ville",
    });
  });

  it("an invoice frozen before they existed exports them empty, not the live client's", () => {
    const client = invoiceClientIdentity({
      number: "FAC-2026-0001",
      clientSnapshot: { name: "TEST UI Client", ice: "001234567000089" },
      client: live,
    });
    expect(salesJournalRows([invoice({ client })])[0]).toMatchObject({ client: "TEST UI Client", fiscalId: "", tradeRegister: "" });
  });
});
