import { COMPANY, type CompanyInfo } from "./company";
import { SAMPLE_TYPE_LABELS, formatDate } from "./labels";
import type { SampleType } from "@/generated/prisma/client";

/**
 * Feuille de paillasse — the printable worksheet the technicians fill at the
 * bench, then key in (client request, 28/07).
 *
 * It lists the samples of a chosen day with one line per parameter and blank
 * columns for the reading and a note, so it is written on rather than read.
 * Samples are identified by their blind serial number, which is what appears
 * on the tube.
 */

export type BenchSheetSample = {
  serialNumber: string | null;
  controlCode: string | null;
  type: SampleType;
  produit: string | null;
  numeroLot: string | null;
  clientName: string;
  technicianName: string | null;
  parameters: { name: string; unit: string | null; threshold: string | null }[];
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

export function buildBenchSheetHtml(
  date: Date,
  samples: BenchSheetSample[],
  company: CompanyInfo = COMPANY
): string {
  const blocks = samples
    .map(
      (sample) => `
    <section class="sample">
      <div class="head">
        <div>
          <span class="serial">${show(sample.serialNumber)}</span>
          <span class="type">${escapeHtml(SAMPLE_TYPE_LABELS[sample.type])}</span>
        </div>
        <div class="meta">
          ${show(sample.clientName)}
          ${sample.produit ? ` · ${escapeHtml(sample.produit)}` : ""}
          ${sample.numeroLot ? ` · lot ${escapeHtml(sample.numeroLot)}` : ""}
          ${sample.technicianName ? ` · ${escapeHtml(sample.technicianName)}` : ""}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:34%">Paramètre</th>
            <th style="width:12%">Unité</th>
            <th style="width:20%">Seuil</th>
            <th style="width:16%">Valeur mesurée</th>
            <th style="width:18%">Note</th>
          </tr>
        </thead>
        <tbody>
          ${sample.parameters
            .map(
              (parameter) => `
            <tr>
              <td class="param">${escapeHtml(parameter.name)}</td>
              <td>${show(parameter.unit)}</td>
              <td>${show(parameter.threshold)}</td>
              <td class="fill"></td>
              <td class="fill"></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </section>`
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Feuille de paillasse — ${formatDate(date)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33; font-size: 9.6pt;
    margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-end;
    border-bottom: 2px solid #1f3a4d; padding-bottom: 8px; margin-bottom: 12px; }
  .brand { font-size: 14pt; font-weight: 700; color: #1f3a4d; }
  .brand span { color: #b8860b; }
  .sub { font-size: 8pt; color: #55707d; }
  .doc { text-align: right; font-size: 8.6pt; color: #55707d; }
  .doc .kind { font-size: 10.5pt; font-weight: 700; color: #1f3a4d;
    text-transform: uppercase; letter-spacing: .5px; }
  .sample { border: 1px solid #d9e3e8; border-radius: 4px; padding: 8px 10px;
    margin-bottom: 10px; page-break-inside: avoid; }
  .head { display: flex; justify-content: space-between; align-items: baseline;
    gap: 10px; margin-bottom: 6px; }
  .serial { font-family: Consolas, monospace; font-size: 11pt; font-weight: 700; color: #1f3a4d; }
  .type { margin-left: 8px; font-size: 7.6pt; text-transform: uppercase;
    letter-spacing: .4px; color: #7d929c; }
  .meta { font-size: 8.6pt; color: #55707d; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 9pt; }
  thead th { background: #eef3f6; color: #41616f; text-align: left; padding: 4px 6px;
    font-size: 7.8pt; text-transform: uppercase; letter-spacing: .3px;
    border: 1px solid #d9e3e8; }
  tbody td { padding: 6px; border: 1px solid #d9e3e8; }
  .param { font-weight: 600; }
  .fill { background: #fcfdfe; height: 22px; }
  .empty { text-align: center; color: #7d929c; padding: 28px; border: 1px dashed #d9e3e8;
    border-radius: 4px; }
  footer { margin-top: 14px; border-top: 1px solid #e3eaee; padding-top: 6px;
    font-size: 7.4pt; color: #7d929c; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<header>
  <div>
    <div class="brand">QUALILAB <span>INTERNATIONAL</span></div>
    <div class="sub">${escapeHtml(company.tagline)}</div>
  </div>
  <div class="doc">
    <div class="kind">Feuille de paillasse</div>
    Date : <b>${formatDate(date)}</b><br>
    ${samples.length} échantillon${samples.length > 1 ? "s" : ""}
  </div>
</header>

${
  samples.length > 0
    ? blocks
    : '<p class="empty">Aucun échantillon en analyse pour cette date.</p>'
}

<footer>
  <span>Saisie effectuée par : ______________________</span>
  <span>Date et signature : ______________________</span>
</footer>
</body>
</html>`;
}
