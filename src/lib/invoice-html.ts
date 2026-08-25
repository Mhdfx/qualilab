import { COMPANY, type CompanyInfo } from "./company";
import { formatDate } from "./labels";
import { amountToFrenchWords } from "./number-to-words-fr";

/**
 * The invoice as a printable document.
 *
 * Rendered server-side by Chromium, like the analysis report — the prototype
 * produced it by screenshotting the page, which gave a single flattened image
 * with no selectable text and no page breaks. An invoice carries the
 * laboratory's ICE, RC and RIB and may be sent to an accountant or an
 * administration, so it has to be a real document.
 */

export type InvoiceDocument = {
  number: string;
  issueDate: Date;
  dueDate: Date | null;
  status: "EN_ATTENTE" | "PAYEE";
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
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function show(value: string | null | undefined) {
  return value ? escapeHtml(value) : "—";
}

function money(amount: number) {
  return `${new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)} DH`;
}

export function buildInvoiceHtml(
  invoice: InvoiceDocument,
  company: CompanyInfo = COMPANY
): string {
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

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Facture ${escapeHtml(invoice.number)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33; font-size: 10pt;
    line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .band { height: 5px; background: linear-gradient(90deg,#1f3a4d 0%,#2e5266 55%,#b8860b 100%); }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1f3a4d; padding: 12px 0 10px; margin-bottom: 14px; }
  .brand { font-size: 17pt; font-weight: 700; color: #1f3a4d; }
  .brand span { color: #b8860b; }
  .identity { font-size: 7.4pt; color: #55707d; margin-top: 5px; line-height: 1.5; }
  .docmeta { text-align: right; font-size: 8.4pt; color: #55707d; line-height: 1.6; }
  .docmeta .kind { font-size: 11pt; font-weight: 700; color: #1f3a4d;
    text-transform: uppercase; letter-spacing: .6px; }
  .docmeta b { color: #1b2a33; }
  .paid { display: inline-block; margin-top: 4px; padding: 2px 8px; border-radius: 10px;
    font-size: 7.6pt; font-weight: 700; }
  .paid.yes { background: #e2efe4; color: #2f6b3a; }
  .paid.no { background: #fdf0dc; color: #8a5a00; }
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
  .totals { display: flex; justify-content: flex-end; page-break-inside: avoid; }
  .totals table { width: 280px; font-size: 9.4pt; }
  .totals td { padding: 5px 8px; border: 0; }
  .totals .label { color: #55707d; }
  .totals .value { text-align: right; font-weight: 600; }
  .totals .grand td { border-top: 2px solid #1f3a4d; padding-top: 7px;
    font-size: 11pt; font-weight: 700; color: #1f3a4d; }
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
<div class="band"></div>
<header>
  <div>
    <div class="brand">QUALILAB <span>INTERNATIONAL</span></div>
    <div class="identity">
      ${escapeHtml(company.address)} · ${escapeHtml(company.city)}<br>
      Tél. ${escapeHtml(company.phone)} · ${escapeHtml(company.email)}<br>
      ICE ${escapeHtml(company.ice)} · RC ${escapeHtml(company.rc)}
    </div>
  </div>
  <div class="docmeta">
    <div class="kind">Facture</div>
    N° <b>${escapeHtml(invoice.number)}</b><br>
    En date du <b>${formatDate(invoice.issueDate)}</b><br>
    ${invoice.dueDate ? `Échéance <b>${formatDate(invoice.dueDate)}</b><br>` : ""}
    <span class="paid ${invoice.status === "PAYEE" ? "yes" : "no"}">
      ${invoice.status === "PAYEE" ? "PAYÉE" : "EN ATTENTE DE RÈGLEMENT"}
    </span>
  </div>
</header>

<div class="parties">
  <div class="box">
    <h2>Facturé à</h2>
    <div class="name">${show(invoice.client.name)}</div>
    ${invoice.client.address ? `<div class="line">${escapeHtml(invoice.client.address)}</div>` : ""}
    ${invoice.client.contact ? `<div class="line">${escapeHtml(invoice.client.contact)}</div>` : ""}
    ${invoice.client.phone ? `<div class="line">Tél. ${escapeHtml(invoice.client.phone)}</div>` : ""}
    ${invoice.client.email ? `<div class="line">${escapeHtml(invoice.client.email)}</div>` : ""}
    ${invoice.client.ice ? `<div class="line">ICE ${escapeHtml(invoice.client.ice)}</div>` : ""}
  </div>
  <div class="box">
    <h2>Émise par</h2>
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

<div class="words">
  Arrêtée la présente facture à la somme de :
  <b>${escapeHtml(amountToFrenchWords(invoice.total))}</b>.
</div>

${invoice.notes ? `<p class="notes"><b>Observations :</b> ${escapeHtml(invoice.notes)}</p>` : ""}

<div class="payment">
  <h2>Modalités de règlement</h2>
  <div class="row">Banque : <b>${escapeHtml(company.bank)}</b></div>
  <div class="row">RIB : <b>${escapeHtml(company.rib)}</b></div>
  <div class="row">IBAN : <b>${escapeHtml(company.iban)}</b> · SWIFT : <b>${escapeHtml(company.swift)}</b></div>
  <div class="row" style="margin-top:5px">
    Règlement à réception de facture, sauf accord écrit contraire.
  </div>
</div>

<footer>
  ${escapeHtml(company.name)} — Facture ${escapeHtml(invoice.number)} ·
  ICE ${escapeHtml(company.ice)} · RC ${escapeHtml(company.rc)} · ${escapeHtml(company.website)}
</footer>
</body>
</html>`;
}
