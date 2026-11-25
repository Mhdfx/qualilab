import { describe, expect, it, vi } from "vitest";

/**
 * The switches of lot 6 (RETOUR-LABO-25-11.md §4) put back to OFF
 * (src/lib/lab-proposals.ts): 6A `STOCK_IMPORT_QUANTITY_FROM_PRICE`,
 * `STOCK_IMPORT_LEVEL_FROM_FILE`, `STOCK_EXPIRY_MONTH_END` — each must give
 * the file read as written; 6B `PURCHASE_IMPORT_UNNUMBERED` « SKIP »,
 * `PURCHASE_IMPORT_EMPTY_STATUS_UNPAID` off, `PURCHASE_IMPORT_WITHHOLDING`
 * « NEVER » — the way back the switches promise; 6C `ONSSA_EXPORT_LAYOUT`
 * « EXTRAIT_2025 », `ONSSA_CHEMISTRY_OWN_ROW`, `ONSSA_EMPTY_ORIGIN_AGRO`,
 * `ONSSA_SECTIONS_FROM_APP` off and `ONSSA_IV_NON_ACCREDITED` the other way
 * (on). The module
 * is mocked, so the pure rules read these values as the route would.
 * Synthetic sheets only.
 */
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  STOCK_IMPORT_QUANTITY_FROM_PRICE: false,
  STOCK_IMPORT_LEVEL_FROM_FILE: false,
  STOCK_EXPIRY_MONTH_END: false,
  PURCHASE_IMPORT_UNNUMBERED: "SKIP",
  PURCHASE_IMPORT_EMPTY_STATUS_UNPAID: false,
  PURCHASE_IMPORT_WITHHOLDING: "NEVER",
  ONSSA_EXPORT_LAYOUT: "EXTRAIT_2025",
  ONSSA_CHEMISTRY_OWN_ROW: false,
  ONSSA_EMPTY_ORIGIN_AGRO: false,
  ONSSA_SECTIONS_FROM_APP: false,
  ONSSA_IV_NON_ACCREDITED: true,
}));

const { expiryOf, parseStockWorkbook, planStockWorkbook, reconcile } = await import("./stock-workbook-import");
const { parsePurchaseJournal, planPurchaseJournal } = await import("./purchase-import");
const { buildOnssaCanevasWorkbook, canevasReportOptions, NOTHING } = await import("./onssa-canevas-workbook");
const { defaultOnssaExportFormat, onssaExportFormat } = await import("./onssa-access");
const { buildOnssaReport, NO_ORIGIN, ONSSA_CHEMISTRY_GROUP } = await import("./onssa-report");

const header = (entry: string, stock = "Stock") => ["Date", "Libellé", "Lot", "Expiration", entry, "Sortie", stock, "Prix (dh/ht)", null];
const sub = [null, null, null, null, null, null, null, "prix unitaire", "prix total"];

describe("lot 6A — the switches back to the file as written", () => {
  it("QUANTITY_FROM_PRICE off: quantities and the price titled « unitaire » as written, a mismatch still flagged", () => {
    expect(reconcile(4000, 250, 80, 1280)).toEqual({ quantity: 4000, unitPriceHT: 80, check: "non-departage" });
    expect(reconcile(4, 200, 0.5, 400)).toEqual({ quantity: 4, unitPriceHT: 0.5, check: "non-departage" });
    expect(reconcile(6, 100, 90, 15)).toEqual({ quantity: 6, unitPriceHT: 90, check: "non-departage" });
    // A consistent row is unchanged.
    expect(reconcile(3, 100, 42, 126)).toEqual({ quantity: 3, unitPriceHT: 42, check: "ok" });

    const parsed = parseStockWorkbook(
      [
        { name: "Boîtes", rows: [header("Entrée/250"), sub, ["2026-04-20", "12/26", null, null, 4000, null, 4000, 80, 1280]] },
        { name: "Huile", rows: [header("Entrée/1l", "Stock/ml"), sub, ["2021-02-08", "11/21", null, null, null, null, 4000, 85, 340]] },
      ],
      { today: "2026-11-25" }
    );
    expect(parsed.articles.map((article) => [article.movements[0].quantity, article.lastStock])).toEqual([
      [4000, 4000],
      [4000, 4000],
    ]);
  });

  it("LEVEL_FROM_FILE off: the level is entries − exits, no adjustment", () => {
    const parsed = parseStockWorkbook(
      [{ name: "Gants", rows: [header("Entrée"), sub, ["2026-03-02", "64/26", null, null, 3, null, 3, null, null], ["2026-05-11", "69/26", null, null, 2, null, 2, null, null]] }],
      { today: "2026-11-25" }
    );
    const [plan] = planStockWorkbook(parsed, new Map(), new Set(), "2026-11-25").articles;
    expect(plan).toMatchObject({ levelAfter: 5, adjustment: null });
  });

  it("EXPIRY_MONTH_END off: a month is its 1st day", () => {
    expect(expiryOf("02-2028", false)).toBe("2028-02-01");
    expect(expiryOf("11/2027", false)).toBe("2027-11-01");
    expect(expiryOf("2028-07-01", true)).toBe("2028-07-01");
    expect(expiryOf("14/05/27", false)).toBe("2027-05-14");
  });
});

describe("lot 6B — the switches of the purchase journal, the other way", () => {
  const header = ["Fournisseurs", "Délai de paiement", "N° Facture", "Mois", "Date", "Echéance", "Montant HT", "TVA 20%", "Montant TTC", "Euro", "Statut", "Date paiement", "Mode de paiement"];
  const rows = [
    header,
    ["Verrerie Alpha", 30, null, 3, "2026-03-10", null, 100, 20, 120, null, "Payée", "2026-03-20", "Virement"],
    ["Verrerie Alpha", 30, "FA-1", 3, "2026-03-10", null, 100, 20, 120, null, null, null, null],
    ["Verrerie Alpha", 30, "FA-2", 3, "2026-03-11", null, 100, 20, 120, null, "Payée", "2026-03-20", "Virement"],
  ];

  it("UNNUMBERED « SKIP »: a row without a number is listed, not imported; EMPTY_STATUS_UNPAID off: an empty status is « à préciser »", () => {
    const journal = parsePurchaseJournal(rows, { today: "2026-11-25", eurRate: null, defaultVatRate: 20 });
    if ("error" in journal) throw new Error(journal.error);
    expect(journal.drafts.map((draft) => draft.invoice.number)).toEqual(["FA-2"]);
    expect(journal.refused.map((note) => [note.line, note.kind])).toEqual([
      [2, "sans-numero"],
      [3, "statut"],
    ]);
  });

  it("WITHHOLDING « NEVER »: an invoice to pay of a supplier « soumis » withholds nothing", () => {
    const journal = parsePurchaseJournal(rows, { today: "2026-11-25", eurRate: null, defaultVatRate: 20, emptyStatusUnpaid: true });
    if ("error" in journal) throw new Error(journal.error);
    const plan = planPurchaseJournal(journal, {
      today: "2026-11-25",
      suppliers: new Map([
        ["verrerie alpha", { id: "s1", name: "Verrerie Alpha", archived: false, paymentTermDays: 30, withholdingSubject: true, taxCertificateDate: null, taxCertificateValidUntil: null }],
      ]),
      invoices: new Map(),
      settings: { scope: "TOUS", base: "TVA", rateWithCertificate: 75, rateWithoutCertificate: 100, certificateValidityMonths: 6 },
    });
    expect(plan.invoices.map((invoice) => [invoice.draft.invoice.number, invoice.draft.status, invoice.withholding.amount])).toEqual([
      ["FA-1", "A_PAYER", null],
      ["FA-2", "PAYEE", null],
    ]);
  });
});

describe("lot 6C — the switches of the canevas of 2026, the other way", () => {
  const group = { id: "g", name: "Groupe test", domain: "ALIMENTAIRE" as const, sortOrder: 0, active: true };
  const samples = [
    {
      id: "s",
      reference: "1/26",
      clientName: "Client Fictif",
      siteName: null,
      natureLabel: "Aliments",
      familyName: "Famille test",
      groupId: group.id,
      controleOfficiel: false,
      organismePreleveur: null,
      etablissement: null,
      origine: null,
      results: [
        { parameterName: "Histamine", parameterColumn: "CHIMIE_ALIMENTAIRE", normCode: null, value: "5", interpretation: null, informalInterpretation: null, conform: true },
      ],
    },
  ];
  const meta = { monthLabel: "Octobre 2026", labName: "Laboratoire Test", generatedAt: "—", countBasis: "date de réception", pendingSamples: null };
  const sections = {
    eil: [{ parameter: "EIL test", method: "", validation: "", organizer: "Organisateur test", date: "En cours", result: "En cours" }],
    strains: [{ day: "02/10/2026", germ: "Salmonella", product: "Famille test", region: "Ville test" }],
    regulations: [{ label: "Texte test", samples: 1 }],
    reception: [{ label: "Quantité insuffisante", samples: 1 }],
    nonAccredited: ["Paramètre non accrédité test"],
  };
  const texts = (sheet: import("exceljs").Worksheet) => {
    const all: unknown[] = [];
    sheet.eachRow((row) => row.eachCell((cell) => all.push(cell.value)));
    return all;
  };

  it("EXPORT_LAYOUT « EXTRAIT_2025 »: the download without a format is the extract of 28/10", () => {
    expect(defaultOnssaExportFormat()).toBe("extrait");
    expect(onssaExportFormat(null)).toBe("extrait");
    expect(onssaExportFormat("canevas")).toBe("canevas");
  });

  it("CHEMISTRY_OWN_ROW and EMPTY_ORIGIN_AGRO off: the chemistry stays in its group, an empty origin « Non précisée »", () => {
    expect(canevasReportOptions()).toEqual({ chemistryOwnRow: false, emptyOrigin: NO_ORIGIN });
    const report = buildOnssaReport(samples, [group], canevasReportOptions());
    expect(report.groups.map((block) => block.group.id)).toEqual([group.id]);
    expect(report.groups.some((block) => block.group.id === ONSSA_CHEMISTRY_GROUP.id)).toBe(false);
    expect(report.groups[0].self).toEqual([{ origine: NO_ORIGIN, analyses: 1, samples: 1 }]);
  });

  it("SECTIONS_FROM_APP off: III left empty to fill; IV_NON_ACCREDITED on: IV lists the parameters « non accrédité »", () => {
    const workbook = buildOnssaCanevasWorkbook(buildOnssaReport(samples, [group], canevasReportOptions()), sections, meta);
    const ad = texts(workbook.getWorksheet("III-AD ")!);
    expect(ad).not.toContain(NOTHING);
    expect(ad).not.toContain("EIL test");
    expect(ad).not.toContain("Ville test");
    expect(ad).not.toContain("Texte test");
    const iv = workbook.getWorksheet("IV-Autres informations ")!;
    expect([iv.getCell("B8").value, iv.getCell("F8").value]).toEqual(["Paramètre non accrédité test", "non"]);
  });
});
