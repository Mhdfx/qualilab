import { COMPANY } from "./company";
import { SAMPLE_TYPE_LABELS, formatDateTime, formatDate } from "./labels";
import type { SampleType } from "@/generated/prisma/client";

/**
 * The official analysis report.
 *
 * Built as HTML so the layout is designed, not drawn: Chromium turns it into a
 * PDF with selectable text and real page breaks. The header repeats on every
 * page, and the results table never splits a row.
 *
 * Everything here comes from the sample and the snapshot taken at approval —
 * nothing is recomputed, so a report downloaded a year later is identical to
 * the one sent to the client.
 */

export type ReportData = {
  number: string;
  controlCode: string | null;
  serialNumber: string | null;
  client: { name: string; address: string | null; ice: string | null };
  produit: string | null;
  numeroLot: string | null;
  lieu: string;
  type: SampleType;
  sampledAt: Date;
  receivedAt: Date | null;
  preleveur: string;
  technicianName: string | null;
  validatorName: string | null;
  approverName: string | null;
  validatedAt: Date | null;
  conclusion: string;
  results: {
    parameter: string;
    value: string | null;
    unit: string | null;
    threshold: string | null;
    conform: boolean | null;
    note: string | null;
  }[];
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** `null` renders as an em dash rather than an empty cell. */
function show(value: string | null | undefined) {
  return value ? escapeHtml(value) : "—";
}

export function buildReportHtml(data: ReportData): string {
  const nonConformes = data.results.filter((r) => r.conform === false).length;

  const rows = data.results
    .map(
      (result) => `
      <tr>
        <td class="param">
          ${show(result.parameter)}
          ${result.note ? `<span class="note">${escapeHtml(result.note)}</span>` : ""}
        </td>
        <td class="mono">${show(result.value)}</td>
        <td>${show(result.unit)}</td>
        <td>${show(result.threshold)}</td>
        <td class="verdict">
          ${
            result.conform === true
              ? '<span class="ok">Conforme</span>'
              : result.conform === false
                ? '<span class="no">Non conforme</span>'
                : "—"
          }
        </td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport ${escapeHtml(data.number)}</title>
<style>
  @page { size: A4; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33;
    font-size: 10pt; line-height: 1.45;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
  .band { height: 5px; background: linear-gradient(90deg,#1f3a4d 0%,#2e5266 55%,#b8860b 100%); }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1f3a4d; padding: 12px 0 10px; margin-bottom: 14px; }
  .brand { font-size: 17pt; font-weight: 700; color: #1f3a4d; letter-spacing: .2px; }
  .brand span { color: #b8860b; }
  .tagline { font-size: 7.6pt; color: #55707d; margin-top: 2px; max-width: 260px; }
  .identity { font-size: 7.4pt; color: #55707d; margin-top: 5px; line-height: 1.5; }
  .docmeta { text-align: right; font-size: 8.2pt; color: #55707d; line-height: 1.6; }
  .docmeta .kind { font-size: 9.4pt; font-weight: 700; color: #1f3a4d;
    text-transform: uppercase; letter-spacing: .6px; }
  .docmeta b { color: #1b2a33; }
  h1 { font-size: 13pt; color: #1f3a4d; margin: 0 0 10px; }
  .grid { display: flex; gap: 10px; margin-bottom: 12px; }
  .box { flex: 1; border: 1px solid #d9e3e8; border-radius: 4px; padding: 8px 10px; }
  .box h2 { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px;
    color: #7d929c; margin: 0 0 5px; font-weight: 600; }
  .row { display: flex; gap: 6px; font-size: 9pt; margin-bottom: 2px; }
  .row .k { color: #55707d; min-width: 74px; }
  .row .v { font-weight: 600; color: #1b2a33; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 12px; }
  thead th { background: #1f3a4d; color: #fff; text-align: left; padding: 6px 7px;
    font-weight: 600; font-size: 8.2pt; text-transform: uppercase; letter-spacing: .3px; }
  tbody td { padding: 6px 7px; border-bottom: 1px solid #dbe4e9; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f6f9fb; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .mono { font-family: "Consolas", monospace; font-weight: 600; }
  .param { font-weight: 600; }
  .note { display: block; font-weight: 400; font-size: 8pt; color: #55707d; margin-top: 1px; }
  .verdict .ok { color: #2f6b3a; font-weight: 700; }
  .verdict .no { color: #a5203a; font-weight: 700; }
  .conclusion { border: 1px solid #d9e3e8; border-left: 4px solid #b8860b;
    border-radius: 4px; padding: 9px 12px; margin-bottom: 14px; page-break-inside: avoid; }
  .conclusion h2 { font-size: 7.6pt; text-transform: uppercase; letter-spacing: .5px;
    color: #7d929c; margin: 0 0 4px; font-weight: 600; }
  .conclusion p { margin: 0; font-size: 9.6pt; }
  .alert { color: #a5203a; font-weight: 600; }
  .signatures { display: flex; gap: 10px; page-break-inside: avoid; }
  .sig { flex: 1; border: 1px solid #d9e3e8; border-radius: 4px; padding: 8px 10px; min-height: 62px; }
  .sig .role { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px;
    color: #7d929c; font-weight: 600; }
  .sig .name { font-size: 9.4pt; font-weight: 700; color: #1b2a33; margin-top: 3px; }
  .sig .when { font-size: 7.8pt; color: #55707d; margin-top: 1px; }
  footer { position: fixed; bottom: 0; left: 0; right: 0; font-size: 7pt; color: #7d929c;
    text-align: center; border-top: 1px solid #e3eaee; padding-top: 4px; }
</style>
</head>
<body>
<div class="band"></div>
<header>
  <div>
    <div class="brand">QUALILAB <span>INTERNATIONAL</span></div>
    <div class="tagline">${escapeHtml(COMPANY.tagline)}</div>
    <div class="identity">
      ${escapeHtml(COMPANY.address)} · ${escapeHtml(COMPANY.city)}<br>
      Tél. ${escapeHtml(COMPANY.phone)} · ${escapeHtml(COMPANY.email)}<br>
      ICE ${escapeHtml(COMPANY.ice)} · RC ${escapeHtml(COMPANY.rc)}
    </div>
  </div>
  <div class="docmeta">
    <div class="kind">Rapport d'analyse</div>
    N° <b>${escapeHtml(data.number)}</b><br>
    Code contrôle <b>${show(data.controlCode)}</b><br>
    N° de série <b>${show(data.serialNumber)}</b><br>
    Édité le <b>${formatDate(new Date())}</b>
  </div>
</header>

<h1>Rapport d'analyse — ${escapeHtml(SAMPLE_TYPE_LABELS[data.type])}</h1>

<div class="grid">
  <div class="box">
    <h2>Client</h2>
    <div class="row"><span class="k">Raison sociale</span><span class="v">${show(data.client.name)}</span></div>
    <div class="row"><span class="k">Adresse</span><span class="v">${show(data.client.address)}</span></div>
    <div class="row"><span class="k">ICE</span><span class="v">${show(data.client.ice)}</span></div>
  </div>
  <div class="box">
    <h2>Échantillon</h2>
    <div class="row"><span class="k">Produit</span><span class="v">${show(data.produit)}</span></div>
    <div class="row"><span class="k">N° de lot</span><span class="v">${show(data.numeroLot)}</span></div>
    <div class="row"><span class="k">Lieu</span><span class="v">${show(data.lieu)}</span></div>
  </div>
  <div class="box">
    <h2>Traçabilité</h2>
    <div class="row"><span class="k">Prélevé le</span><span class="v">${formatDateTime(data.sampledAt)}</span></div>
    <div class="row"><span class="k">Reçu le</span><span class="v">${data.receivedAt ? formatDateTime(data.receivedAt) : "—"}</span></div>
    <div class="row"><span class="k">Préleveur</span><span class="v">${show(data.preleveur)}</span></div>
  </div>
</div>

<table>
  <thead>
    <tr>
      <th style="width:32%">Paramètre</th>
      <th style="width:16%">Résultat</th>
      <th style="width:14%">Unité</th>
      <th style="width:22%">Seuil de référence</th>
      <th style="width:16%">Conformité</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div class="conclusion">
  <h2>Conclusion</h2>
  <p${nonConformes > 0 ? ' class="alert"' : ""}>${escapeHtml(data.conclusion)}</p>
</div>

<div class="signatures">
  <div class="sig">
    <div class="role">Analyses réalisées par</div>
    <div class="name">${show(data.technicianName)}</div>
    <div class="when">Technicien de laboratoire</div>
  </div>
  <div class="sig">
    <div class="role">Validé par</div>
    <div class="name">${show(data.validatorName)}</div>
    <div class="when">Responsable qualité${data.validatedAt ? ` · ${formatDate(data.validatedAt)}` : ""}</div>
  </div>
  <div class="sig">
    <div class="role">Approuvé par</div>
    <div class="name">${show(data.approverName)}</div>
    <div class="when">Direction du laboratoire</div>
  </div>
</div>

<footer>
  ${escapeHtml(COMPANY.name)} — Rapport ${escapeHtml(data.number)} ·
  Ce rapport ne concerne que l'échantillon soumis à l'analyse.
  Reproduction interdite sauf en intégralité.
</footer>
</body>
</html>`;
}

/** The sentence printed under "Conclusion", derived from the results. */
export function buildConclusion(
  results: { conform: boolean | null; parameter: string }[]
): string {
  const nonConformes = results.filter((r) => r.conform === false);

  if (nonConformes.length === 0) {
    return "L'échantillon analysé est conforme aux critères microbiologiques de référence pour l'ensemble des paramètres recherchés.";
  }

  const names = nonConformes.map((r) => r.parameter).join(", ");
  return `L'échantillon analysé est NON CONFORME aux critères microbiologiques de référence pour : ${names}. Une action corrective est recommandée.`;
}
