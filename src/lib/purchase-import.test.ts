import { describe, expect, it } from "vitest";
import {
  addDays,
  importedFromLabel,
  importedFromValue,
  invoiceNumberKey,
  journalDay,
  parsePaymentCell,
  parsePurchaseJournal,
  paymentModeOf,
  planPurchaseJournal,
  EUR_RATE_PLAUSIBLE,
  type ExistingSupplier,
  type ImportedInvoice,
  type JournalOptions,
  type PlanContext,
  type PurchaseJournal,
} from "./purchase-import";
import type { SheetRow } from "./stock-import";
import type { WithholdingSettings } from "./withholding";

/**
 * Lot 6B, M15 (RETOUR-LABO-25-11.md §2.3, §6) — the « Journal Achat » read
 * into supplier invoices. Synthetic rows only: invented suppliers, numbers,
 * days and amounts, one case of §2.3 per test.
 */

const HEADER: SheetRow = [
  "Fournisseurs",
  "Délai de paiement ",
  "N° Facture",
  "Mois",
  "Date",
  "Echéance ",
  "Montant HT",
  "TVA 20%",
  "Montant TTC",
  "Euro",
  "Statut ",
  "Date paiement ",
  "Mode de paiement ",
];

type Row = {
  supplier?: string | null;
  term?: number | string | null;
  number?: string | null;
  month?: number | null;
  date?: string | number | null;
  due?: string | null;
  ht?: number | null;
  vat?: number | null;
  ttc?: number | null;
  euro?: number | null;
  status?: string | null;
  paidOn?: string | number | null;
  mode?: string | null;
};

const row = (r: Row): SheetRow => [
  r.supplier ?? null,
  r.term ?? null,
  r.number ?? null,
  r.month ?? null,
  r.date ?? null,
  r.due ?? null,
  r.ht ?? null,
  r.vat ?? null,
  r.ttc ?? null,
  r.euro ?? null,
  r.status ?? null,
  r.paidOn ?? null,
  r.mode ?? null,
];

const base: Row = { supplier: "Verrerie Alpha", term: 60, number: "FA-101", month: 3, date: "2026-03-10", due: "2026-05-09", ht: 1000, vat: 200, ttc: 1200, status: "Payée", paidOn: "2026-04-02", mode: "Virement" };

const OPTIONS: JournalOptions = { today: "2026-11-25", eurRate: null, defaultVatRate: 20, unnumbered: "GENERATE", emptyStatusUnpaid: true };

function parse(rows: Row[], options: Partial<JournalOptions> = {}): PurchaseJournal {
  const parsed = parsePurchaseJournal([HEADER, ...rows.map(row)], { ...OPTIONS, ...options });
  if ("error" in parsed) throw new Error(parsed.error);
  return parsed;
}

const kinds = (notes: { kind: string }[]) => notes.map((note) => note.kind);

describe("parsePurchaseJournal — the columns of the template", () => {
  it("reads a paid invoice: HT, TVA, TTC, its due day, one payment of the TTC, the mode", () => {
    const journal = parse([base]);
    expect(journal.rows).toBe(1);
    expect(journal.refused).toEqual([]);
    expect(journal.warnings).toEqual([]);
    const [draft] = journal.drafts;
    expect(draft).toMatchObject({
      line: 2,
      supplierName: "Verrerie Alpha",
      termDays: 60,
      generatedNumber: false,
      dueDay: "2026-05-09",
      status: "PAYEE",
      payments: [{ day: "2026-04-02", amount: 1200 }],
      paidAt: "2026-04-02",
      paymentMethod: "VIREMENT",
      paymentReference: null,
    });
    expect(draft.invoice).toMatchObject({ number: "FA-101", amountHT: 1000, vatAmount: 200, vatRate: 20, amount: 1200, currency: null });
    expect(draft.invoice.issueDate.toISOString().slice(0, 10)).toBe("2026-03-10");
  });

  it("finds the header below a title, and refuses a sheet without « Fournisseurs » + « N° Facture »", () => {
    const parsed = parsePurchaseJournal([["Journal des achats 2026"], [], HEADER, row(base)], OPTIONS);
    if ("error" in parsed) throw new Error(parsed.error);
    expect(parsed.drafts[0].line).toBe(4);
    expect(parsePurchaseJournal([["Date", "Libellé", "Entrée"]], OPTIONS)).toEqual({ error: expect.stringContaining("Fournisseurs") });
  });

  it("reads Excel serial days and « JJ/MM/AAAA »", () => {
    // 46091 = 2026-03-10 in Excel's 1900 system.
    const journal = parse([{ ...base, date: 46091, due: "09/05/2026", paidOn: "02/04/2026" }]);
    expect(journal.drafts[0]).toMatchObject({ dueDay: "2026-05-09", paidAt: "2026-04-02" });
  });
});

describe("parsePurchaseJournal — the rows of §2.3", () => {
  it("ignores empty rows and the template rows at zero; refuses an amount without a supplier", () => {
    const journal = parse([
      base,
      {},
      { supplier: null, number: null, term: null, month: 11, date: null, due: null, ht: null, vat: 0, ttc: 0, status: null, paidOn: null, mode: null },
      { supplier: null, number: null, term: null, month: null, date: null, due: null, ht: null, vat: 0, ttc: 0, status: null, paidOn: null, mode: null },
      { ...base, supplier: null, number: "FA-999" },
    ]);
    expect(journal.rows).toBe(4);
    expect(journal.templateRows).toBe(2);
    expect(journal.drafts).toHaveLength(1);
    expect(journal.refused).toMatchObject([{ line: 6, kind: "fournisseur" }]);
  });

  it("gives an unnumbered row a deterministic « SN-AAAA-MM-JJ-k » (rank per supplier and day)", () => {
    const rows = [
      { ...base, number: null },
      { ...base, number: null, ht: 50, vat: 10, ttc: 60 },
      { ...base, supplier: "Réactifs Beta", number: null },
      { ...base, number: null, date: "2026-03-11", due: null },
    ];
    const journal = parse(rows);
    expect(journal.drafts.map((draft) => [draft.invoice.number, draft.generatedNumber])).toEqual([
      ["SN-2026-03-10-1", true],
      ["SN-2026-03-10-2", true],
      ["SN-2026-03-10-1", true],
      ["SN-2026-03-11-1", true],
    ]);
    // The second of the day for one supplier: « à vérifier » (its rank depends on the file's order).
    expect(kinds(journal.warnings)).toEqual(["sans-numero", "sans-numero", "sans-numero-rang", "sans-numero", "sans-numero"]);
    // The same file read again gives the same numbers: the import stays idempotent.
    expect(parse(rows).drafts.map((draft) => draft.invoice.number)).toEqual(journal.drafts.map((draft) => draft.invoice.number));
    // « SKIP »: listed, not imported.
    const skipped = parse(rows, { unnumbered: "SKIP" });
    expect(skipped.drafts).toEqual([]);
    expect(kinds(skipped.refused)).toEqual(["sans-numero", "sans-numero", "sans-numero", "sans-numero"]);
  });

  it("imports identical duplicates once, and lists different ones « à trancher » without importing any", () => {
    const journal = parse([
      base,
      { ...base },
      { ...base, number: "FA-200", date: "2026-01-05", due: null, month: 1 },
      { ...base, number: "fa-200 ", date: "2026-02-05", due: null, month: 2 },
      { ...base, number: "FA-200", date: "2026-03-05", due: null },
    ]);
    expect(journal.drafts.map((draft) => draft.line)).toEqual([2]);
    expect(journal.warnings).toMatchObject([{ line: 3, kind: "doublon-identique" }]);
    expect(journal.conflicts).toEqual([{ supplierName: "Verrerie Alpha", number: "FA-200", lines: [4, 5, 6] }]);
    expect(kinds(journal.refused)).toEqual(["a-trancher", "a-trancher", "a-trancher"]);
    // A row not imported keeps only the note saying why.
    const repeated = parse([{ ...base, paidOn: "2026-03-01" }, { ...base, paidOn: "2026-03-01" }]);
    expect(repeated.warnings.map((note) => [note.line, note.kind])).toEqual([
      [2, "paiement-avant-facture"],
      [3, "doublon-identique"],
    ]);
  });

  it("rounds HT and TVA to the centime and takes TTC = HT + TVA; refuses a TTC more than a centime off", () => {
    const journal = parse([
      { ...base, ht: 333.333, vat: 66.6666, ttc: 400 },
      { ...base, number: "FA-102", ht: 1000, vat: 200, ttc: 2640 },
    ]);
    expect(journal.drafts[0].invoice).toMatchObject({ amountHT: 333.33, vatAmount: 66.67, amount: 400, vatRate: 20 });
    expect(journal.refused).toMatchObject([{ line: 3, kind: "ht-tva-ttc" }]);
  });

  it("keeps an exempt invoice at 0 % and a TTC-only invoice as « TTC seul »", () => {
    const journal = parse([
      { ...base, ht: 500, vat: 0, ttc: 500 },
      { ...base, number: "FA-103", ht: null, vat: 0, ttc: 913 },
      { ...base, number: "FA-104", ht: null, vat: 30, ttc: 180 },
    ]);
    expect(journal.drafts[0].invoice).toMatchObject({ amountHT: 500, vatRate: 0, vatAmount: 0, amount: 500 });
    expect(journal.drafts[1].invoice).toMatchObject({ amountHT: null, vatRate: null, vatAmount: null, amount: 913 });
    expect(journal.drafts[2].invoice).toMatchObject({ amountHT: null, amount: 180 });
    expect(journal.warnings).toMatchObject([{ line: 4, kind: "tva-sans-ht" }]);
  });

  it("an invoice in euros: with its DH amount, the rate is TTC ÷ euros; without, it needs the rate typed", () => {
    const rows = [
      { ...base, ht: null, vat: null, ttc: 1100, euro: 100 },
      { ...base, number: "FA-105", ht: null, vat: null, ttc: null, euro: 250 },
      { ...base, number: "FA-106", ht: null, vat: 0, ttc: 0, euro: 40 },
    ];
    const without = parse(rows);
    expect(without.drafts[0].invoice).toMatchObject({ amount: 1100, currency: "EUR", amountForeign: 100, exchangeRate: 11 });
    expect(without.refused).toMatchObject([
      { line: 3, kind: "dh-manquant" },
      { line: 4, kind: "dh-manquant" },
    ]);
    const withRate = parse(rows, { eurRate: 10.85 });
    expect(withRate.refused).toEqual([]);
    expect(withRate.drafts[1].invoice).toMatchObject({ amount: 2712.5, amountHT: null, currency: "EUR", amountForeign: 250, exchangeRate: 10.85 });
    expect(withRate.drafts[1].convertedFromEuro).toBe(true);
    expect(withRate.drafts[2].invoice).toMatchObject({ amount: 434, amountForeign: 40 });
    expect(kinds(withRate.warnings)).toEqual(["taux-eur", "taux-eur"]);
  });

  it("refuses a row without a readable date, a negative amount (an avoir), an unreadable one, one at zero", () => {
    const journal = parse([
      { ...base, date: null },
      { ...base, number: "FA-107", ht: -100, vat: -20, ttc: -120 },
      { ...base, number: "FA-108", ttc: "douze" as unknown as number },
      { ...base, number: null, month: 4, ht: null, vat: 0, ttc: 0 },
    ]);
    expect(kinds(journal.refused)).toEqual(["date", "montant", "montant", "montant"]);
    // A refused row keeps only its refusal (no « sans numéro », no « Mois » note).
    expect(journal.warnings).toEqual([]);
  });

  it("« Statut »: « Payée » and « Prélèvement » are paid; empty is to pay (switch) or refused; anything else refused", () => {
    const journal = parse([
      { ...base, status: "Prélevement", paidOn: "2026-04-02", mode: null },
      { ...base, number: "FA-109", status: null, paidOn: null, mode: "Virement" },
      { ...base, number: "FA-110", status: "en litige" },
    ]);
    expect(journal.drafts[0]).toMatchObject({ status: "PAYEE", paymentMethod: "VIREMENT", paymentReference: "Prélèvement" });
    // To pay: the mode written in advance is not a payment.
    expect(journal.drafts[1]).toMatchObject({ status: "A_PAYER", payments: [], paidAt: null, paymentMethod: null });
    expect(journal.refused).toMatchObject([{ line: 4, kind: "statut" }]);
    const strict = parse([{ ...base, status: null, paidOn: null }], { emptyStatusUnpaid: false });
    expect(strict.refused).toMatchObject([{ line: 2, kind: "statut" }]);
    // A payment day with an empty status: paid, flagged.
    const dated = parse([{ ...base, status: null }]);
    expect(dated.drafts[0].status).toBe("PAYEE");
    expect(kinds(dated.warnings)).toEqual(["statut-vide-paiement"]);
  });

  it("a paid invoice without a payment day is paid without a payment row (« payée en totalité »)", () => {
    const journal = parse([{ ...base, paidOn: null, mode: "Virement" }]);
    expect(journal.drafts[0]).toMatchObject({ status: "PAYEE", payments: [], paidAt: null, paymentMethod: "VIREMENT" });
    expect(journal.warnings).toEqual([]);
  });

  it("payments in several times: « date montant + date montant » adding up to the TTC; otherwise no payment row", () => {
    const journal = parse([
      { ...base, paidOn: "12/04/26 700 + 3/5/26 500" },
      { ...base, number: "FA-111", paidOn: "12/04/2026+03/05/2026" },
      { ...base, number: "FA-112", paidOn: "12/04/26 700 + 3/5/26 400" },
      { ...base, number: "FA-113", paidOn: "12/04 et comp 3/05" },
    ]);
    expect(journal.drafts[0]).toMatchObject({
      payments: [
        { day: "2026-04-12", amount: 700 },
        { day: "2026-05-03", amount: 500 },
      ],
      paidAt: "2026-05-03",
    });
    expect(journal.drafts[1]).toMatchObject({ payments: [], paidAt: "2026-05-03" });
    expect(journal.drafts[2]).toMatchObject({ payments: [], paidAt: "2026-05-03" });
    expect(journal.drafts[3]).toMatchObject({ status: "PAYEE", payments: [], paidAt: null });
    expect(kinds(journal.warnings)).toEqual(["paiement-montants", "paiement-montants", "paiement-illisible"]);
  });

  it("a payment dated before the invoice, or in the future, is not recorded: paid, flagged", () => {
    const journal = parse([
      { ...base, paidOn: "2026-03-01" },
      { ...base, number: "FA-114", paidOn: "2026-12-01" },
    ]);
    expect(journal.drafts[0]).toMatchObject({ status: "PAYEE", payments: [], paidAt: "2026-03-01" });
    expect(journal.drafts[1]).toMatchObject({ status: "PAYEE", payments: [], paidAt: null });
    expect(kinds(journal.warnings)).toEqual(["paiement-avant-facture", "paiement-futur"]);
  });

  it("the due day: the file's; else date + the row's délai; a disagreement is flagged, an échéance before the date replaced", () => {
    const journal = parse([
      { ...base, due: "2026-04-09" },
      { ...base, number: "FA-115", due: null },
      { ...base, number: "FA-116", due: null, term: null },
      { ...base, number: "FA-117", due: "2026-03-01" },
    ]);
    expect(journal.drafts.map((draft) => draft.dueDay)).toEqual(["2026-04-09", "2026-05-09", null, "2026-05-09"]);
    expect(kinds(journal.warnings)).toEqual(["echeance", "echeance"]);
  });

  it("reads a date cell left at Excel's day 0 (« 1899-12-30 ») as empty, never as a day of 1899", () => {
    const journal = parse([
      { ...base, due: "1899-12-30", term: 60 },
      { ...base, number: "FA-125", paidOn: "1899-12-30" },
      { ...base, number: "FA-126", date: "1899-12-30" },
    ]);
    expect(journal.drafts[0]).toMatchObject({ dueDay: "2026-05-09" });
    expect(journal.drafts[1]).toMatchObject({ status: "PAYEE", payments: [], paidAt: null });
    expect(journal.refused).toMatchObject([{ line: 4, kind: "date", message: expect.stringContaining("vide") }]);
    expect(journal.warnings).toEqual([]);
    expect(journalDay(0)).toBeNull();
    expect(journalDay(46091)).toBe("2026-03-10");
  });

  it("flags a « Mois » that is not the date's month, never blocking", () => {
    const journal = parse([{ ...base, month: 4 }]);
    expect(journal.drafts).toHaveLength(1);
    expect(journal.warnings).toMatchObject([{ line: 2, kind: "mois" }]);
  });

  it("proposes each supplier's délai: its most frequent, else the most frequent gap, else 30", () => {
    const journal = parse([
      { ...base, supplier: "Verrerie Alpha", term: 60 },
      { ...base, supplier: "VERRERIE  alpha", number: "FA-118", term: 60 },
      { ...base, supplier: "Verrerie Alpha", number: "FA-119", term: 90 },
      { ...base, supplier: "Réactifs Beta", term: null, due: "2026-04-09" },
      { ...base, supplier: "Gaz Gamma", term: null, due: null },
    ]);
    const proposed = [...journal.suppliers.values()].map((supplier) => [supplier.name, supplier.paymentTermDays, supplier.rows]);
    expect(proposed).toEqual([
      ["Verrerie Alpha", 60, 3],
      ["Réactifs Beta", 30, 1],
      ["Gaz Gamma", 30, 1],
    ]);
  });
});

describe("paymentModeOf — the « Mode de paiement » column", () => {
  it.each([
    ["Virement", "VIREMENT", null, true],
    ["TRF0012345", "VIREMENT", "TRF0012345", true],
    ["TRF 0012345", "VIREMENT", "TRF 0012345", true],
    ["Prélevement", "VIREMENT", "Prélèvement", true],
    ["CAISSE", "ESPECES", null, true],
    ["Espèce", "ESPECES", null, true],
    ["Carte Zeta", "CARTE", "Carte Zeta", true],
    ["chèque", "CHEQUE", null, true],
    ["Chèque 0001234", "CHEQUE", "Chèque 0001234", true],
    ["LCN", "EFFET", null, true],
    ["XYZ 0001", "AUTRE", "XYZ 0001", false],
    ["Versement compte", "AUTRE", "Versement compte", false],
    ["Virement + avance espèce", "AUTRE", "Virement + avance espèce", false],
    ["Espèce carte", "AUTRE", "Espèce carte", false],
  ])("« %s » → %s", (cell, method, reference, known) => {
    expect(paymentModeOf(cell)).toEqual({ method, reference, known });
  });

  it("is null for an empty cell", () => {
    expect(paymentModeOf(null)).toBeNull();
    expect(paymentModeOf("  ")).toBeNull();
  });
});

describe("parsePaymentCell", () => {
  it("reads one day, several days, days with amounts; a day without its year is unreadable", () => {
    expect(parsePaymentCell("2026-04-02")).toEqual({ kind: "dates", entries: [{ day: "2026-04-02", amount: null }] });
    expect(parsePaymentCell(46114)).toEqual({ kind: "dates", entries: [{ day: "2026-04-02", amount: null }] });
    expect(parsePaymentCell("02/04/2026 + 05/04/2026")).toMatchObject({ kind: "dates", entries: [{ day: "2026-04-02" }, { day: "2026-04-05" }] });
    expect(parsePaymentCell("2/4/26 1 500,50 + 5/4/26 99")).toEqual({
      kind: "dates",
      entries: [
        { day: "2026-04-02", amount: 1500.5 },
        { day: "2026-04-05", amount: 99 },
      ],
    });
    expect(parsePaymentCell("02/04 et comp 05/04")).toMatchObject({ kind: "illisible" });
    expect(parsePaymentCell(null)).toEqual({ kind: "vide" });
  });
});

describe("planPurchaseJournal — against what the database holds", () => {
  const settings: WithholdingSettings = { scope: "AUCUN", base: "TVA", rateWithCertificate: 75, rateWithoutCertificate: 100, certificateValidityMonths: 6 };
  const known = (over: Partial<ExistingSupplier> = {}): ExistingSupplier => ({
    id: "sup-alpha",
    name: "VERRERIE ALPHA",
    archived: false,
    paymentTermDays: 45,
    withholdingSubject: false,
    taxCertificateDate: null,
    taxCertificateValidUntil: null,
    ...over,
  });
  const context = (over: Partial<PlanContext> = {}): PlanContext => ({
    today: "2026-11-25",
    suppliers: new Map(),
    invoices: new Map(),
    settings,
    withholding: "UNPAID_ONLY",
    ...over,
  });

  it("creates the unknown suppliers with their proposed délai, matches the known ones by name", () => {
    const journal = parse([base, { ...base, supplier: "Réactifs Beta", number: "RB-1" }]);
    const plan = planPurchaseJournal(journal, context({ suppliers: new Map([["verrerie alpha", known()]]) }));
    expect(plan.suppliersToCreate.map((supplier) => [supplier.name, supplier.paymentTermDays])).toEqual([["Réactifs Beta", 60]]);
    expect(plan.suppliersMatched).toBe(1);
    expect(plan.invoices.map((invoice) => invoice.supplierId)).toEqual(["sup-alpha", null]);
  });

  it("skips an invoice already there (supplier + number, case ignored), same or different — never modified", () => {
    const journal = parse([base, { ...base, number: "FA-120", ttc: 1200 }]);
    const plan = planPurchaseJournal(
      journal,
      context({
        suppliers: new Map([["verrerie alpha", known()]]),
        invoices: new Map([
          [`sup-alpha|${invoiceNumberKey("fa-101")}`, { issueDay: "2026-03-10", amount: 1200, status: "PAYEE" as const }],
          [`sup-alpha|${invoiceNumberKey("FA-120")}`, { issueDay: "2026-03-10", amount: 999, status: "A_PAYER" as const }],
        ]),
      })
    );
    expect(plan.invoices).toEqual([]);
    expect(plan.suppliersMatched).toBe(1);
    expect(plan.existing).toEqual([
      { line: 2, supplierName: "VERRERIE ALPHA", number: "FA-101", same: true },
      { line: 3, supplierName: "VERRERIE ALPHA", number: "FA-120", same: false },
    ]);
    expect(plan.totals.invoices).toBe(0);
  });

  it("the due day falls back on the supplier's délai (known: its own; created: the proposed one)", () => {
    const journal = parse([
      { ...base, due: null, term: null, status: null, paidOn: null },
      { ...base, supplier: "Réactifs Beta", number: "RB-2", due: null, term: null, status: null, paidOn: null },
    ]);
    const plan = planPurchaseJournal(journal, context({ suppliers: new Map([["verrerie alpha", known()]]) }));
    expect(plan.invoices.map((invoice) => invoice.dueDay)).toEqual([addDays("2026-03-10", 45), addDays("2026-03-10", 30)]);
    expect(plan.totals).toMatchObject({ toPay: 2, late: 2, paid: 0 });
  });

  it("flags an archived supplier once, and still attaches its invoices", () => {
    const journal = parse([base, { ...base, number: "FA-121" }]);
    const plan = planPurchaseJournal(journal, context({ suppliers: new Map([["verrerie alpha", known({ archived: true })]]) }));
    expect(plan.invoices).toHaveLength(2);
    expect(kinds(plan.warnings)).toEqual(["fournisseur-archive"]);
  });

  it("the retenue (§2.5): none on a paid invoice; the form's rule on one to pay — a TTC-only one of a supplier withheld on the TVA is refused", () => {
    const subject = context({
      settings: { ...settings, scope: "FOURNISSEURS_SOUMIS" },
      suppliers: new Map([["verrerie alpha", known({ withholdingSubject: true })]]),
    });
    const journal = parse([
      base,
      { ...base, number: "FA-122", status: null, paidOn: null },
      { ...base, number: "FA-123", status: null, paidOn: null, ht: null, vat: null, ttc: 960 },
    ]);
    const plan = planPurchaseJournal(journal, subject);
    expect(plan.invoices.map((invoice) => [invoice.draft.invoice.number, invoice.withholding.rate, invoice.withholding.amount, invoice.withholding.certificate])).toEqual([
      ["FA-101", null, null, "ABSENTE"],
      ["FA-122", 100, 200, "ABSENTE"],
    ]);
    expect(plan.refused).toMatchObject([{ line: 4, kind: "retenue" }]);
    expect(plan.totals.withheld).toBe(200);
    // « NEVER »: nothing withheld, nothing refused.
    const never = planPurchaseJournal(journal, { ...subject, withholding: "NEVER" });
    expect(never.invoices.map((invoice) => invoice.withholding.amount)).toEqual([null, null, null]);
    expect(never.refused).toEqual([]);
  });

  it("totals what will be created: HT, TVA, TTC, payments", () => {
    const journal = parse([base, { ...base, number: "FA-124", ht: 50, vat: 10, ttc: 60, paidOn: "12/04/26 20 + 13/04/26 40" }]);
    const plan = planPurchaseJournal(journal, context());
    expect(plan.totals).toMatchObject({ invoices: 2, paid: 2, toPay: 0, payments: 3, ht: 1050, vat: 210, ttc: 1260, withheld: 0 });
  });
});

describe("importedFrom", () => {
  it("holds the day and the file; the screen reads a sentence", () => {
    const value = importedFromValue("2026-11-25", "Journal des achats.xlsx");
    expect(value).toBe("2026-11-25|Journal des achats.xlsx");
    expect(importedFromLabel(value)).toBe("Reprise du journal des achats (Journal des achats.xlsx, 25/11/2026)");
    expect(importedFromLabel(null)).toBeNull();
    expect(importedFromValue("2026-11-25", "x".repeat(400))).toHaveLength(191);
  });
});

/**
 * Relecture du lot 6, constats 6 et 7 and the low ones — the import key that
 * survives a renamed supplier and a number filled in later, the generated
 * numbers that never collide, the euro rate checked, the « Statut » read
 * whole, the payments the status contradicts, the centimes.
 */
describe("parsePurchaseJournal — relecture du lot 6", () => {
  it("reads « Statut » whole: « payée partiellement », « payé 50 % » are refused, not paid", () => {
    const journal = parse([
      { ...base, status: "Payée partiellement" },
      { ...base, number: "FA-102", status: "payé 50 %" },
      { ...base, number: "FA-103", status: "Réglée" },
      { ...base, number: "FA-104", status: "Payée en totalité" },
    ]);
    expect(journal.refused.map((note) => [note.line, note.kind])).toEqual([
      [2, "statut"],
      [3, "statut"],
    ]);
    expect(journal.drafts.map((draft) => draft.status)).toEqual(["PAYEE", "PAYEE"]);
  });

  it("an explicit « À payer » with a payment day stays to pay, the payment left out and flagged", () => {
    const journal = parse([{ ...base, status: "À payer", paidOn: "2026-04-02" }]);
    expect(journal.drafts[0]).toMatchObject({ status: "A_PAYER", payments: [], paidAt: null });
    expect(kinds(journal.warnings)).toContain("paiement-ignore");
  });

  it("a single « date montant » whose amount is not the TTC records no payment row, flagged", () => {
    const partial = parse([{ ...base, paidOn: "02/04/2026 500" }]);
    expect(partial.drafts[0]).toMatchObject({ status: "PAYEE", payments: [], paidAt: "2026-04-02" });
    expect(kinds(partial.warnings)).toContain("paiement-montants");
    const whole = parse([{ ...base, paidOn: "02/04/2026 1200" }]);
    expect(whole.drafts[0].payments).toEqual([{ day: "2026-04-02", amount: 1200 }]);
  });

  it("the euro rate: the file's on the HT, kept when plausible; else the screen's (or none), flagged", () => {
    // 1 100 DH HT for 100 EUR (TTC 1 320): 11 on the HT, not 13,2 on the TTC.
    const onHT = parse([{ ...base, ht: 1100, vat: 220, ttc: 1320, euro: 100 }]);
    expect(onHT.drafts[0].invoice.exchangeRate).toBe(11);
    // 1 200 DH for 10 EUR: 120 DH per euro — a slip.
    const slip = parse([{ ...base, ht: null, vat: null, ttc: 1200, euro: 10 }]);
    expect(slip.drafts[0].invoice.exchangeRate).toBeNull();
    expect(slip.warnings.find((note) => note.kind === "taux-eur-improbable")?.message).toContain("120 DH pour 1 EUR — aucun taux enregistré");
    const typed = parse([{ ...base, ht: null, vat: null, ttc: 1200, euro: 10 }], { eurRate: 10.9 });
    expect(typed.drafts[0].invoice.exchangeRate).toBe(10.9);
    expect(EUR_RATE_PLAUSIBLE).toEqual({ min: 8, max: 14 });
  });

  it("rounds a half-centime held below the half by the floating point up, as written", () => {
    // 1 000,005 is held a hair below: rounded on its decimal, it is 1 000,01 — HT + TVA = TTC to the centime.
    const journal = parse([{ ...base, ht: 1000.005, vat: 200, ttc: 1200.01 }]);
    expect(journal.refused).toEqual([]);
    expect(journal.drafts[0].invoice).toMatchObject({ amountHT: 1000.01, amount: 1200.01 });
  });

  it("keys a numbered row by its supplier and number, an unnumbered one by its fingerprint and rank", () => {
    const journal = parse([base, { ...base, number: null }, { ...base, number: null }]);
    const [numbered, sn1, sn2] = journal.drafts;
    expect(numbered.importKey).not.toBe(numbered.printKey);
    expect(sn1.importKey).toBe(sn1.printKey);
    // Two identical unnumbered invoices: two keys.
    expect(sn2.importKey).not.toBe(sn1.importKey);
    expect(parse([{ ...base, supplier: "VERRERIE  alpha" }]).drafts[0].importKey).toBe(numbered.importKey);
    expect(numbered.importKey).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("planPurchaseJournal — import keys (constat 6)", () => {
  const settings: WithholdingSettings = { scope: "AUCUN", base: "TVA", rateWithCertificate: 75, rateWithoutCertificate: 100, certificateValidityMonths: 6 };
  const renamed: ExistingSupplier = {
    id: "sup-alpha",
    name: "Alpha Verrerie SARL",
    archived: false,
    paymentTermDays: 45,
    withholdingSubject: false,
    taxCertificateDate: null,
    taxCertificateValidUntil: null,
  };
  const context = (over: Partial<PlanContext> = {}): PlanContext => ({ today: "2026-11-25", suppliers: new Map(), invoices: new Map(), settings, ...over });
  const importedAs = (key: string, number: string, over: Partial<ImportedInvoice> = {}): [string, ImportedInvoice] => [
    key,
    { supplierId: "sup-alpha", supplierName: renamed.name, number, issueDay: "2026-03-10", amount: 1200, ...over },
  ];

  it("finds an imported invoice whatever its supplier is called now, and attaches the supplier's new ones to it", () => {
    const first = parse([base]);
    const again = parse([base, { ...base, number: "FA-102" }]);
    const plan = planPurchaseJournal(
      again,
      context({
        imported: new Map([importedAs(first.drafts[0].importKey, "FA-101")]),
        suppliersById: new Map([["sup-alpha", renamed]]),
      })
    );
    expect(plan.existing).toEqual([{ line: 2, supplierName: "Alpha Verrerie SARL", number: "FA-101", same: true }]);
    expect(plan.suppliersToCreate).toEqual([]);
    expect(plan.invoices.map((invoice) => [invoice.draft.invoice.number, invoice.supplierId])).toEqual([["FA-102", "sup-alpha"]]);
  });

  it("does not import twice an unnumbered row numbered since: skipped, the number to report by hand", () => {
    const before = parse([{ ...base, number: null }]);
    const after = parse([base]);
    const plan = planPurchaseJournal(
      after,
      context({ imported: new Map([importedAs(before.drafts[0].importKey, "SN-2026-03-10-1")]), suppliersById: new Map([["sup-alpha", renamed]]) })
    );
    expect(plan.invoices).toEqual([]);
    expect(plan.existing).toEqual([{ line: 2, supplierName: renamed.name, number: "SN-2026-03-10-1", same: true }]);
    expect(plan.warnings.map((note) => [note.kind, note.message])).toContainEqual(["numero-ajoute", expect.stringContaining("(SN-2026-03-10-1 → FA-101)")]);
  });

  it("an unnumbered row removed from the file: the kept one is found, a new one takes the next free « SN-… »", () => {
    const original = parse([{ ...base, number: null }, { ...base, number: null, ht: 50, vat: 10, ttc: 60 }]);
    const [, second] = original.drafts;
    // The first row is gone and a new one comes: the kept row is found by its fingerprint; the new one cannot take « -1 », held by the removed row's invoice.
    const edited = parse([{ ...base, number: null, ht: 50, vat: 10, ttc: 60 }, { ...base, number: null, ht: 70, vat: 14, ttc: 84 }]);
    const plan = planPurchaseJournal(
      edited,
      context({
        suppliers: new Map([["verrerie alpha", { ...renamed, name: "Verrerie Alpha" }]]),
        imported: new Map([importedAs(second.importKey, "SN-2026-03-10-2", { amount: 60 })]),
        invoices: new Map([
          ["sup-alpha|sn-2026-03-10-1", { issueDay: "2026-03-10", amount: 1200, status: "PAYEE" as const }],
          ["sup-alpha|sn-2026-03-10-2", { issueDay: "2026-03-10", amount: 60, status: "PAYEE" as const }],
        ]),
      })
    );
    expect(plan.existing.map((row) => row.number)).toEqual(["SN-2026-03-10-2"]);
    expect(plan.invoices.map((invoice) => invoice.draft.invoice.number)).toEqual(["SN-2026-03-10-3"]);
  });

  it("an « SN-… » imported before the keys were kept is found by its number, day and TTC", () => {
    const journal = parse([{ ...base, number: null }]);
    const plan = planPurchaseJournal(
      journal,
      context({
        suppliers: new Map([["verrerie alpha", { ...renamed, name: "Verrerie Alpha" }]]),
        invoices: new Map([["sup-alpha|sn-2026-03-10-1", { issueDay: "2026-03-10", amount: 1200, status: "PAYEE" as const }]]),
      })
    );
    expect(plan.invoices).toEqual([]);
    expect(plan.existing).toEqual([{ line: 2, supplierName: "Verrerie Alpha", number: "SN-2026-03-10-1", same: true }]);
  });
});
