import { describe, expect, it } from "vitest";
import { buildInvoiceHtml, invoiceDocumentTitle, type InvoiceDocument } from "./invoice-html";

const issued: InvoiceDocument = {
  kind: "FACTURE",
  number: "FAC-2026-0042",
  issueDate: new Date("2026-10-07T10:00:00Z"),
  dueDate: new Date("2026-11-07T10:00:00Z"),
  status: "EN_ATTENTE",
  notes: null,
  taxRate: 20,
  subtotal: 1000,
  taxAmount: 200,
  total: 1200,
  client: {
    name: "Laiterie Exemple",
    address: "12 rue des Essais, Ville",
    contact: null,
    phone: null,
    email: null,
    ice: null,
  },
  items: [{ description: "Flore totale <30 °C>", quantity: 2, unitPrice: 500, lineTotal: 1000 }],
  paidAmount: 0,
  creditedAmount: 0,
};

/** The text of the page, tags removed and spaces collapsed. */
const text = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

/** fr-FR money: narrow no-break spaces as thousands separators. */
const dh = (value: string) => new RegExp(value.replace(/ /g, "[\\s\\u202f\\u00a0]") + " DH");

describe("invoiceDocumentTitle", () => {
  it("names the document after its kind and number", () => {
    expect(invoiceDocumentTitle({ kind: "FACTURE", number: "FAC-2026-0042" })).toBe("Facture FAC-2026-0042");
    expect(invoiceDocumentTitle({ kind: "AVOIR", number: "AV-2026-0003" })).toBe("Avoir AV-2026-0003");
    expect(invoiceDocumentTitle({ kind: "FACTURE", number: null })).toBe("Facture (brouillon)");
    expect(invoiceDocumentTitle({ number: "FAC-2026-0001" })).toBe("Facture FAC-2026-0001");
  });
});

describe("buildInvoiceHtml", () => {
  it("an issued invoice: number, due date, settled and left to pay", () => {
    const html = buildInvoiceHtml({ ...issued, paidAmount: 400 });
    const page = text(html);
    expect(page).toContain("N° FAC-2026-0042");
    expect(page).toContain("Échéance");
    expect(page).toContain("PARTIELLEMENT PAYÉE");
    expect(page).toContain("Réglé");
    expect(page).toMatch(dh("400,00"));
    expect(page).toContain("Reste à payer");
    expect(page).toMatch(dh("800,00"));
    expect(page).toContain("Arrêtée la présente facture");
    expect(page).toContain("Modalités de règlement");
    expect(html).not.toContain('class="watermark"');
    expect(html).not.toContain('class="cancelled"');
    // Values are escaped.
    expect(html).toContain("Flore totale &lt;30 °C&gt;");
  });

  it("lists the credit notes in the settlement block", () => {
    const page = text(buildInvoiceHtml({ ...issued, creditedAmount: 200, paidAmount: 1000, status: "PAYEE" }));
    expect(page).toContain("Avoirs");
    expect(page).toMatch(dh("− 200,00"));
    expect(page).toContain("PAYÉE");
    expect(page).toMatch(/Reste à payer 0,00 DH/);
  });

  it("a draft: « BROUILLON » watermark, no number, no settlement block", () => {
    const html = buildInvoiceHtml({ ...issued, number: null, status: "BROUILLON" });
    const page = text(html);
    expect(html).toContain('<div class="watermark">BROUILLON</div>');
    expect(page).toContain("Facture — brouillon");
    expect(page).toContain("N° non attribué — brouillon");
    expect(page).not.toContain("FAC-");
    expect(page).not.toContain("Reste à payer");
    expect(html).toContain("<title>Facture (brouillon)</title>");
  });

  it("a cancelled invoice: number kept, « ANNULÉE » stamp with date and reason", () => {
    const html = buildInvoiceHtml({
      ...issued,
      status: "ANNULEE",
      cancelledAt: new Date("2026-10-08T09:00:00Z"),
      cancelReason: "Erreur de client <test>",
    });
    const page = text(html);
    expect(html).toContain('<div class="stamp">ANNULÉE</div>');
    expect(page).toContain("N° FAC-2026-0042");
    expect(page).toMatch(/Facture annulée le 8 oct\. 2026/);
    expect(page).toContain("Motif : Erreur de client &lt;test&gt;");
    expect(page).not.toContain("Reste à payer");
    expect(page).toContain("(annulée)");
  });

  it("a credit note: « Avoir N° AV-… », the invoice it relates to, its reason", () => {
    const html = buildInvoiceHtml({
      ...issued,
      kind: "AVOIR",
      number: "AV-2026-0003",
      status: "EN_ATTENTE",
      dueDate: new Date("2026-11-07T10:00:00Z"),
      notes: "Analyse facturée deux fois",
      subtotal: 100,
      taxAmount: 20,
      total: 120,
      items: [{ description: "Reprise : Flore totale", quantity: 1, unitPrice: 100, lineTotal: 100 }],
      creditedInvoice: { number: "FAC-2026-0042", issueDate: new Date("2026-10-07T10:00:00Z") },
    });
    const page = text(html);
    expect(page).toContain("Avoir N° AV-2026-0003");
    expect(page).toMatch(/Se rapporte à la facture FAC-2026-0042 du 7 oct\. 2026/);
    expect(page).toContain("Motif de l'avoir : Analyse facturée deux fois");
    expect(page).toContain("Arrêté le présent avoir");
    expect(page).toContain("AVOIR");
    expect(page).not.toContain("Échéance");
    expect(page).not.toContain("Reste à payer");
    expect(page).not.toContain("RIB");
    expect(html).toContain("<title>Avoir AV-2026-0003</title>");
  });

  it("stays readable for an invoice built before drafts (no kind, no amounts)", () => {
    const legacy: InvoiceDocument = { ...issued };
    delete legacy.kind;
    delete legacy.paidAmount;
    delete legacy.creditedAmount;
    const page = text(buildInvoiceHtml(legacy));
    expect(page).toContain("EN ATTENTE DE RÈGLEMENT");
    expect(page).toMatch(/Reste à payer 1[\s  ]200,00 DH/);
  });
});
