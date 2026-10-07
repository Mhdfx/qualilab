import type { InvoiceKind, InvoiceStatus } from "@/generated/prisma/enums";
import { COMPANY, type CompanyInfo } from "./company";
import { companyBrandHtml } from "./brand-html";
import { formatDate } from "./labels";
import { amountToFrenchWords } from "./number-to-words-fr";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";
import { balance, invoiceState, type InvoiceState } from "./invoice-lifecycle";

/**
 * The invoice — or credit note — as a printable document.
 *
 * Rendered server-side by Chromium, like the analysis report — the prototype
 * produced it by screenshotting the page, which gave a single flattened image
 * with no selectable text and no page breaks. An invoice carries the
 * laboratory's ICE, RC and RIB and may be sent to an accountant or an
 * administration, so it has to be a real document.
 *
 * What it says follows its life (FACTURATION.md §5): a draft is watermarked
 * « BROUILLON » and has no number; a cancelled invoice keeps its number under
 * an « ANNULÉE » stamp with the date and the reason; an issued invoice shows
 * what was settled and what is left to pay; a credit note is titled
 * « AVOIR N° AV-… » and names the invoice it corrects.
 */

export type InvoiceDocument = {
  /** FACTURE unless said otherwise. */
  kind?: InvoiceKind;
  /** Null while a draft. */
  number: string | null;
  issueDate: Date;
  dueDate: Date | null;
  status: InvoiceStatus;
  notes: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  client: {
    name: string;
    address: string | null;
    contact: string | null;
    phone: string | null;
    email: string | null;
    ice: string | null;
  };
  items: {
    description: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }[];
  /** Sum of the settlements (issued invoice). */
  paidAmount?: number;
  /** Sum of the credit notes issued against it (issued invoice). */
  creditedAmount?: number;
  /** Cancellation: printed on the « ANNULÉE » stamp. */
  cancelledAt?: Date | null;
  cancelReason?: string | null;
  /** Credit note: the invoice it corrects. */
  creditedInvoice?: { number: string | null; issueDate: Date } | null;
};

function money(amount: number) {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} DH`;
}

/** The pill under the number. */
const STATE_BADGES: Record<InvoiceState, { text: string; tone: "yes" | "no" | "off" }> = {
  BROUILLON: { text: "BROUILLON", tone: "off" },
  EMISE: { text: "EN ATTENTE DE RÈGLEMENT", tone: "no" },
  PARTIELLEMENT_PAYEE: { text: "PARTIELLEMENT PAYÉE", tone: "no" },
  PAYEE: { text: "PAYÉE", tone: "yes" },
  ANNULEE: { text: "ANNULÉE", tone: "off" },
  AVOIR: { text: "AVOIR", tone: "yes" },
};

/** The document's name: « Facture FAC-… », « Avoir AV-… », « Facture (brouillon) ». */
export function invoiceDocumentTitle(invoice: Pick<InvoiceDocument, "kind" | "number">): string {
  const kind = invoice.kind === "AVOIR" ? "Avoir" : "Facture";
  return invoice.number ? `${kind} ${invoice.number}` : `${kind} (brouillon)`;
}

export function buildInvoiceHtml(
  invoice: InvoiceDocument,
  company: CompanyInfo = COMPANY
): string {
  const isCreditNote = invoice.kind === "AVOIR";
  const isDraft = !isCreditNote && invoice.status === "BROUILLON";
  const isCancelled = !isCreditNote && invoice.status === "ANNULEE";
  const paid = invoice.paidAmount ?? 0;
  const credited = invoice.creditedAmount ?? 0;
  const state = invoiceState({
    status: invoice.status,
    kind: invoice.kind ?? "FACTURE",
    total: invoice.total,
    paid,
    credited,
  });
  const badge = STATE_BADGES[state];
  const title = invoiceDocumentTitle(invoice);

  const rows = invoice.items
    .map(
      (item) => `
      <tr>
        <td class="desc">${escapeHtml(item.description)}</td>
        <td class="num">${item.quantity}</td>
        <td class="num">${money(item.unitPrice)}</td>
        <td class="num strong">${money(item.lineTotal)}</td>
      </tr>`
    )
    .join("");

  const numberLine = invoice.number
    ? `N° <b>${escapeHtml(invoice.number)}</b><br>`
    : `N° <b>non attribué</b> — brouillon<br>`;

  const creditedLine =
    isCreditNote && invoice.creditedInvoice
      ? `<div class="credited">Se rapporte à la facture <b>${escapeHtml(invoice.creditedInvoice.number ?? "—")}</b> du <b>${formatDate(invoice.creditedInvoice.issueDate)}</b>.</div>`
      : "";

  const cancelStamp =
    isCancelled
      ? `<div class="cancelled">
  <div class="stamp">ANNULÉE</div>
  <div class="why">
    ${invoice.cancelledAt ? `Facture annulée le <b>${formatDate(invoice.cancelledAt)}</b>.<br>` : "Facture annulée.<br>"}
    ${invoice.cancelReason ? `Motif : ${escapeHtml(invoice.cancelReason)}` : ""}
  </div>
</div>`
      : "";

  // Settled / left to pay — an issued invoice only (FACTURATION.md §3).
  const settlement =
    !isCreditNote && !isDraft && !isCancelled
      ? `<div class="settlement">
  <table>
    ${credited > 0 ? `<tr><td class="label">Avoirs</td><td class="value">− ${money(credited)}</td></tr>` : ""}
    <tr><td class="label">Réglé</td><td class="value">${money(paid)}</td></tr>
    <tr class="due"><td>Reste à payer</td><td class="value">${money(balance(invoice.total, paid, credited))}</td></tr>
  </table>
</div>`
      : "";

  const words = isCreditNote
    ? `Arrêté le présent avoir à la somme de :`
    : `Arrêtée la présente facture à la somme de :`;

  const notes = invoice.notes
    ? `<p class="notes"><b>${isCreditNote ? "Motif de l'avoir" : "Observations"} :</b> ${escapeHtml(invoice.notes)}</p>`
    : "";

  const paymentTerms = isCreditNote
    ? `<div class="payment">
  <h2>Imputation</h2>
  <div class="row">Montant à déduire de la facture ${escapeHtml(invoice.creditedInvoice?.number ?? "concernée")}, ou à rembourser si elle est déjà réglée.</div>
</div>`
    : `<div class="payment">
  <h2>Modalités de règlement</h2>
  <div class="row">Banque : <b>${escapeHtml(company.bank)}</b></div>
  <div class="row">RIB : <b>${escapeHtml(company.rib)}</b></div>
  <div class="row">IBAN : <b>${escapeHtml(company.iban)}</b> · SWIFT : <b>${escapeHtml(company.swift)}</b></div>
  <div class="row" style="margin-top:5px">
    Règlement à réception de facture, sauf accord écrit contraire.
  </div>
</div>`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  ${SUPERSCRIPT_CSS}
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33; font-size: 10pt;
    line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .band { height: 5px; background: linear-gradient(90deg,#1f3a4d 0%,#2e5266 55%,#b8860b 100%); }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1f3a4d; padding: 12px 0 10px; margin-bottom: 14px; }
  .brand { font-size: 17pt; font-weight: 700; color: #1f3a4d; }
  .brand span { color: #b8860b; }
  .brand-logo { height: 42px; max-width: 240px; object-fit: contain; display: block; }
  .identity { font-size: 7.4pt; color: #55707d; margin-top: 5px; line-height: 1.5; }
  .docmeta { text-align: right; font-size: 8.4pt; color: #55707d; line-height: 1.6; }
  .docmeta .kind { font-size: 11pt; font-weight: 700; color: #1f3a4d;
    text-transform: uppercase; letter-spacing: .6px; }
  .docmeta b { color: #1b2a33; }
  .paid { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 10px;
    font-size: 7.6pt; font-weight: 700; }
  .paid.yes { background: #e2efe4; color: #2f6b3a; }
  .paid.no { background: #fdf0dc; color: #8a5a00; }
  .paid.off { background: #eceff1; color: #55707d; }
  .credited { margin: -4px 0 12px; padding: 7px 11px; border: 1px solid #d9e3e8;
    border-left: 3px solid #1f3a4d; border-radius: 3px; font-size: 9pt; color: #41616f; }
  .credited b { color: #1b2a33; }
  .cancelled { display: flex; align-items: center; gap: 14px; margin: -4px 0 12px;
    padding: 8px 12px; border: 2px solid #a12a2a; border-radius: 4px; color: #a12a2a;
    page-break-inside: avoid; }
  .cancelled .stamp { font-size: 18pt; font-weight: 800; letter-spacing: 3px;
    border: 3px solid #a12a2a; padding: 2px 10px; transform: rotate(-4deg); }
  .cancelled .why { font-size: 9pt; line-height: 1.5; }
  .watermark { position: fixed; top: 42%; left: 0; right: 0; text-align: center;
    font-size: 92pt; font-weight: 800; letter-spacing: 8px; color: rgba(31,58,77,.08);
    transform: rotate(-30deg); z-index: 0; pointer-events: none; }
  .parties { display: flex; gap: 10px; margin-bottom: 14px; }
  .box { flex: 1; border: 1px solid #d9e3e8; border-radius: 4px; padding: 9px 11px; }
  .box h2 { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px;
    color: #7d929c; margin: 0 0 5px; font-weight: 600; }
  .box .name { font-size: 10.4pt; font-weight: 700; color: #1b2a33; }
  .box .line { font-size: 8.8pt; color: #41616f; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; font-size: 9.2pt; margin-bottom: 12px; }
  thead th { background: #1f3a4d; color: #fff; text-align: left; padding: 6px 8px;
    font-weight: 600; font-size: 8.2pt; text-transform: uppercase; letter-spacing: .3px; }
  thead th.num, tbody td.num { text-align: right; }
  tbody td { padding: 6px 8px; border-bottom: 1px solid #dbe4e9; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f6f9fb; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .desc { font-weight: 500; }
  .strong { font-weight: 700; }
  .totals, .settlement { display: flex; justify-content: flex-end; page-break-inside: avoid; }
  .totals table, .settlement table { width: 280px; font-size: 9.4pt; }
  .totals td, .settlement td { padding: 5px 8px; border: 0; background: none !important; }
  .totals .label, .settlement .label { color: #55707d; }
  .totals .value, .settlement .value { text-align: right; font-weight: 600; }
  .totals .grand td { border-top: 2px solid #1f3a4d; padding-top: 7px;
    font-size: 11pt; font-weight: 700; color: #1f3a4d; }
  .settlement table { margin-top: -6px; }
  .settlement .due td { border-top: 1px solid #b8860b; padding-top: 6px;
    font-size: 10.4pt; font-weight: 700; color: #8a5a00; }
  .words { margin: 12px 0 14px; padding: 8px 11px; background: #f6f9fb;
    border-left: 3px solid #b8860b; border-radius: 3px; font-size: 9pt;
    page-break-inside: avoid; }
  .words b { color: #1f3a4d; }
  .notes { font-size: 8.8pt; color: #41616f; margin-bottom: 12px; }
  .payment { border: 1px solid #d9e3e8; border-radius: 4px; padding: 9px 11px;
    font-size: 8.6pt; color: #41616f; page-break-inside: avoid; }
  .payment h2 { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px;
    color: #7d929c; margin: 0 0 5px; font-weight: 600; }
  .payment .row { margin-top: 1px; }
  .payment b { color: #1b2a33; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7pt; color: #7d929c;
    text-align: center; border-top: 1px solid #e3eaee; padding-top: 4px; }
</style>
</head>
<body>
${isDraft ? `<div class="watermark">BROUILLON</div>` : ""}
<div class="band"></div>
<header>
  <div>
    ${companyBrandHtml(company)}
    <div class="identity">
      ${escapeHtml(company.address)} · ${escapeHtml(company.city)}<br>
      Tél. ${escapeHtml(company.phone)} · ${escapeHtml(company.email)}<br>
      ICE ${escapeHtml(company.ice)} · RC ${escapeHtml(company.rc)}
    </div>
  </div>
  <div class="docmeta">
    ${
      isCreditNote
        ? `<div class="kind">Avoir N° ${escapeHtml(invoice.number ?? "—")}</div>`
        : `<div class="kind">${isDraft ? "Facture — brouillon" : "Facture"}</div>
    ${numberLine}`
    }
    En date du <b>${formatDate(invoice.issueDate)}</b><br>
    ${!isCreditNote && invoice.dueDate ? `Échéance <b>${formatDate(invoice.dueDate)}</b><br>` : ""}
    <span class="paid ${badge.tone}">${badge.text}</span>
  </div>
</header>

${creditedLine}
${cancelStamp}

<div class="parties">
  <div class="box">
    <h2>${isCreditNote ? "Client" : "Facturé à"}</h2>
    <div class="name">${show(invoice.client.name)}</div>
    ${invoice.client.address ? `<div class="line">${escapeHtml(invoice.client.address)}</div>` : ""}
    ${invoice.client.contact ? `<div class="line">${escapeHtml(invoice.client.contact)}</div>` : ""}
    ${invoice.client.phone ? `<div class="line">Tél. ${escapeHtml(invoice.client.phone)}</div>` : ""}
    ${invoice.client.email ? `<div class="line">${escapeHtml(invoice.client.email)}</div>` : ""}
    ${invoice.client.ice ? `<div class="line">ICE ${escapeHtml(invoice.client.ice)}</div>` : ""}
  </div>
  <div class="box">
    <h2>${isCreditNote ? "Émis par" : "Émise par"}</h2>
    <div class="name">${escapeHtml(company.name)}</div>
    <div class="line">${escapeHtml(company.tagline)}</div>
    <div class="line">${escapeHtml(company.address)}, ${escapeHtml(company.city)}</div>
    <div class="line">ICE ${escapeHtml(company.ice)} · RC ${escapeHtml(company.rc)}</div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:58%">Désignation</th>
      <th class="num" style="width:10%">Qté</th>
      <th class="num" style="width:16%">P.U. HT</th>
      <th class="num" style="width:16%">Total HT</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="totals">
  <table>
    <tr>
      <td class="label">Total HT</td>
      <td class="value">${money(invoice.subtotal)}</td>
    </tr>
    <tr>
      <td class="label">TVA (${invoice.taxRate} %)</td>
      <td class="value">${money(invoice.taxAmount)}</td>
    </tr>
    <tr class="grand">
      <td>Total TTC</td>
      <td class="value">${money(invoice.total)}</td>
    </tr>
  </table>
</div>
${settlement}

<div class="words">
  ${words}
  <b>${escapeHtml(amountToFrenchWords(invoice.total))}</b>.
</div>

${notes}

${paymentTerms}

<footer>
  ${escapeHtml(company.name)} — ${escapeHtml(title)}${isCancelled ? " (annulée)" : ""} ·
  ICE ${escapeHtml(company.ice)} · RC ${escapeHtml(company.rc)} · ${escapeHtml(company.website)}
</footer>
</body>
</html>`;
}
