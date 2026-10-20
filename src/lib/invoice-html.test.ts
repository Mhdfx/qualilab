import { describe, expect, it } from "vitest";
import { buildInvoiceHtml, invoiceDocumentTitle, type InvoiceDocument } from "./invoice-html";
import { clientSnapshotOf, invoiceClientIdentity } from "./invoice-client-identity";
import { lineDescription } from "./billing";
import { layoutSourceLine } from "./invoice-html-layout";

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

  it("prints a decimal VAT rate and quantity the French way (5,5 %, 1,5)", () => {
    const page = text(
      buildInvoiceHtml({
        ...issued,
        taxRate: 5.5,
        items: [{ description: "Prélèvement", quantity: 1.5, unitPrice: 100, lineTotal: 150 }],
      })
    );
    expect(page).toContain("TVA (5,5 %)");
    expect(page).toContain("Prélèvement 1,5 ");
    expect(page).not.toMatch(/5\.5 %|1\.5 /);
    expect(text(buildInvoiceHtml(issued))).toContain("TVA (20 %)");
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

describe("the client an issued invoice prints (clientSnapshot)", () => {
  // The client as it was when FAC-2026-0042 was issued: what the issuing
  // routes store (`clientSnapshotOf`) …
  const atIssue = clientSnapshotOf({
    name: "Laiterie Exemple",
    address: "12 rue des Essais, Ville",
    contact: null,
    phone: null,
    email: null,
    ice: "000000000000012",
  });
  // … and the same fiche after a rename, a move and a merge.
  const renamed = {
    id: "client-1",
    name: "Groupe Renommé",
    address: "1 boulevard Après, Autre ville",
    contact: "Mme Après",
    phone: "0500000000",
    email: "apres@example.test",
    ice: "000000000000099",
  };

  it("renaming the client after issue does not change the PDF", () => {
    const client = invoiceClientIdentity({ number: issued.number, clientSnapshot: atIssue, client: renamed });
    const page = text(buildInvoiceHtml({ ...issued, client }));
    expect(page).toContain("Laiterie Exemple");
    expect(page).toContain("12 rue des Essais, Ville");
    expect(page).toContain("ICE 000000000000012");
    expect(page).not.toContain("Groupe Renommé");
    expect(page).not.toContain("Autre ville");
    expect(page).not.toContain("000000000000099");
  });

  it("a credit note copying the invoice's snapshot prints the same client", () => {
    const invoiceIdentity = invoiceClientIdentity({ number: issued.number, clientSnapshot: atIssue, client: renamed });
    const client = invoiceClientIdentity({
      number: "AV-2026-0003",
      clientSnapshot: clientSnapshotOf(invoiceIdentity),
      client: renamed,
    });
    const page = text(
      buildInvoiceHtml({
        ...issued,
        kind: "AVOIR",
        number: "AV-2026-0003",
        client,
        creditedInvoice: { number: "FAC-2026-0042", issueDate: new Date("2026-10-07T10:00:00Z") },
      })
    );
    expect(page).toContain("Laiterie Exemple");
    expect(page).not.toContain("Groupe Renommé");
  });

  it("a draft follows the live client until it is issued", () => {
    const client = invoiceClientIdentity({ number: null, clientSnapshot: null, client: renamed });
    const page = text(buildInvoiceHtml({ ...issued, number: null, status: "BROUILLON", client }));
    expect(page).toContain("Groupe Renommé");
    expect(page).toContain("1 boulevard Après, Autre ville");
  });

  it("an invoice issued before the snapshot existed keeps printing the live client", () => {
    const client = invoiceClientIdentity({ number: issued.number, clientSnapshot: null, client: renamed });
    expect(text(buildInvoiceHtml({ ...issued, client }))).toContain("Groupe Renommé");
  });
});

describe("the « par paramètre » layout (Q30)", () => {
  const at = (controlCode: string) => ({
    id: controlCode,
    controlCode,
    code: controlCode,
    type: "ALIMENTAIRE" as const,
    produit: "Plat cuisiné",
    parameters: [],
  });
  const line = (name: string, controlCode: string, unitPrice: number) => ({
    description: lineDescription(name, at(controlCode)),
    quantity: 1,
    unitPrice,
    lineTotal: unitPrice,
    fromSample: true,
  });
  // Three samples, two parameters, a free line: 3 × 320 + 2 × 450 + 145,50.
  const perSample: InvoiceDocument = {
    ...issued,
    client: { ...issued.client, name: "TEST UI V17 Traiteur" },
    subtotal: 2005.5,
    taxAmount: 401.1,
    total: 2406.6,
    items: [
      line("E. coli", "480/26-2", 320),
      line("Salmonelles", "480/26-2", 450),
      line("E. coli", "480/26-3", 320),
      { description: "Déplacement", quantity: 1, unitPrice: 145.5, lineTotal: 145.5 },
      line("E. coli", "480/26-4", 320),
      line("Salmonelles", "480/26-4", 450),
    ],
  };

  /** The page without its table of lines (and the layout's caption and styles). */
  const withoutLines = (html: string) =>
    html
      .replace(/<tbody>[\s\S]*?<\/tbody>/, "<tbody></tbody>")
      .replace(/<p class="layout">[^<]*<\/p>\n/, "")
      .replace(/\n {2}\.layout \{[^}]*\}\n {2}\.refs \{[^}]*\}/, "");

  it("absent, the document is the per-line one, untouched", () => {
    const html = buildInvoiceHtml(perSample);
    expect(buildInvoiceHtml(perSample, undefined, { layout: "ligne" })).toBe(html);
    expect(html).not.toContain('class="layout"');
    expect(html).not.toContain(".refs");
    expect(text(html)).toContain("E. coli (Alimentaire) — Plat cuisiné · 480/26-3");
  });

  it("absent, the markup is the one printed before the layout existed, byte for byte", () => {
    // Pinned on the renderer as it was before Q30: nothing after the last
    // style, nothing between the parties and the table, one row per stored
    // line written exactly as before.
    const html = buildInvoiceHtml(perSample);
    expect(html).toContain("padding-top: 4px; }\n</style>");
    expect(html).toContain("</div>\n\n<table>\n  <thead>");
    expect(html).toContain(
      "<tbody>\n      <tr>\n" +
        '        <td class="desc">E. coli (Alimentaire) — Plat cuisiné · 480/26-2</td>\n' +
        '        <td class="num">1</td>\n' +
        '        <td class="num">320,00 DH</td>\n' +
        '        <td class="num strong">320,00 DH</td>\n' +
        "      </tr>\n      <tr>\n" +
        '        <td class="desc">Salmonelles (Alimentaire) — Plat cuisiné · 480/26-2</td>'
    );
    expect(html).toContain(
      "      <tr>\n" +
        '        <td class="desc">Déplacement</td>\n' +
        '        <td class="num">1</td>\n' +
        '        <td class="num">145,50 DH</td>\n' +
        '        <td class="num strong">145,50 DH</td>\n' +
        "      </tr>\n      <tr>\n" +
        '        <td class="desc">E. coli (Alimentaire) — Plat cuisiné · 480/26-4</td>'
    );
    expect(html).toContain('<td class="num strong">450,00 DH</td>\n      </tr></tbody>');
    expect(html.match(/<tr>\s*<td class="desc">/g)).toHaveLength(perSample.items.length);
  });

  it("one line per parameter and price: number of analyses, unit price, amount, the samples", () => {
    const html = buildInvoiceHtml(perSample, undefined, { layout: "parametre" });
    const page = text(html);
    expect(page).toContain("Présentation par paramètre");
    expect(page).toMatch(
      /E\. coli \(Alimentaire\) Échantillons : 480\/26-2, 480\/26-3, 480\/26-4 3 320,00 DH 960,00 DH/
    );
    expect(page).toMatch(/Salmonelles \(Alimentaire\) Échantillons : 480\/26-2, 480\/26-4 2 450,00 DH 900,00 DH/);
    expect(page).toMatch(/Déplacement 1 145,50 DH 145,50 DH/);
    expect(page).not.toContain("Plat cuisiné");
    expect(html.match(/<tr>\s*<td class="desc">/g)).toHaveLength(3);
  });

  it("only the table differs: totals, VAT, number, client, payment and words are the same", () => {
    const perLine = buildInvoiceHtml(perSample);
    const byParameter = buildInvoiceHtml(perSample, undefined, { layout: "parametre" });
    expect(withoutLines(byParameter)).toBe(withoutLines(perLine));
    const page = text(byParameter);
    expect(page).toMatch(dh("2 005,50"));
    expect(page).toMatch(dh("401,10"));
    expect(page).toMatch(dh("2 406,60"));
    expect(page).toContain("N° FAC-2026-0042");
    expect(page).toContain("TEST UI V17 Traiteur");
    expect(page).toContain("Modalités de règlement");
  });

  it("keeps the « BROUILLON » watermark and the « ANNULÉE » stamp", () => {
    const draft = buildInvoiceHtml({ ...perSample, number: null, status: "BROUILLON" }, undefined, { layout: "parametre" });
    expect(draft).toContain('<div class="watermark">BROUILLON</div>');
    expect(text(draft)).toContain("N° non attribué — brouillon");
    const cancelled = buildInvoiceHtml(
      { ...perSample, status: "ANNULEE", cancelledAt: new Date("2026-10-08T09:00:00Z"), cancelReason: "Erreur" },
      undefined,
      { layout: "parametre" }
    );
    expect(cancelled).toContain('<div class="stamp">ANNULÉE</div>');
    expect(text(cancelled)).toContain("Motif : Erreur");
  });

  it("a credit note is grouped the same way, still « Avoir N° AV-… »", () => {
    // As the credit-note route stores its lines: no sample of their own, the
    // invoice line they take back carries it.
    const takenBack = (name: string, controlCode: string, unitPrice: number) =>
      layoutSourceLine({
        description: lineDescription(name, at(controlCode)),
        quantity: 1,
        unitPrice,
        lineTotal: unitPrice,
        sampleId: null,
        creditedItem: { sampleId: controlCode },
      });
    const html = buildInvoiceHtml(
      {
        ...perSample,
        kind: "AVOIR",
        number: "AV-2026-0003",
        subtotal: 640,
        taxAmount: 128,
        total: 768,
        items: [takenBack("E. coli", "480/26-2", 320), takenBack("E. coli", "480/26-3", 320)],
        creditedInvoice: { number: "FAC-2026-0042", issueDate: new Date("2026-10-07T10:00:00Z") },
      },
      undefined,
      { layout: "parametre" }
    );
    const page = text(html);
    expect(page).toContain("Avoir N° AV-2026-0003");
    expect(page).toMatch(/E\. coli \(Alimentaire\) Échantillons : 480\/26-2, 480\/26-3 2 320,00 DH 640,00 DH/);
    expect(page).toContain("Se rapporte à la facture FAC-2026-0042");
  });

  it("escapes what it prints", () => {
    const html = buildInvoiceHtml(
      { ...perSample, items: [{ ...line("Flore <totale>", "A&B", 10), lineTotal: 10 }] },
      undefined,
      { layout: "parametre" }
    );
    expect(html).toContain("Flore &lt;totale&gt; (Alimentaire)");
    expect(html).toContain("Échantillon : A&amp;B");
  });
});
