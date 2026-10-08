import { cartoucheMargin, pageCss } from "./cartouche-html";
import { SAMPLE_TYPE_LABELS, formatDate } from "./labels";
import type { SampleType } from "@/generated/prisma/client";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";
import { repetitionLabel } from "./series";

/**
 * Feuille de paillasse — the printable worksheet the technicians fill at the
 * bench, then key in (client request, 28/07).
 *
 * It lists the samples of a chosen day with one line per parameter and blank
 * columns for the reading and a note, so it is written on rather than read.
 * A sample taken on several units gets one cell per repetition (R1 … Rn) and
 * the criterion of its product type, exactly as the bench screen shows them.
 * Samples are identified by their blind serial number, which is what appears
 * on the tube; the two samples of a two-family échantillon (« 1M » / « 1P »)
 * are two blocks, each under its own N° de contrôle.
 *
 * The quality cartouche (PG06/EN01) is Chromium's header template
 * (cartouche-html.ts), on every page with « Page n sur N »: the route prints
 * the sheet with `BENCH_SHEET_MARGIN`, which its `@page` declares.
 */

/** No footer: the sheet ends with its own « Saisie effectuée par » line. */
export const BENCH_SHEET_MARGIN = cartoucheMargin();

export type BenchSheetSample = {
  /** N° de contrôle once received, the échantillon's code before that. */
  reference: string;
  serieNumber: string;
  type: SampleType;
  /** As `sampleDesignation` prints it: « Planche verte — surface nettoyée »,
   *  « Salle — Boîte exposée 30 min ». */
  designation: string | null;
  numeroLot: string | null;
  clientName: string;
  technicianName: string | null;
  /** Readings per parameter: one cell per unit taken (R1 … Rn), 1 = a single value. */
  unitCount: number;
  /** `threshold` is the product type's criterion (m, M, c, norm) when there is one. */
  parameters: { name: string; unit: string | null; threshold: string | null }[];
};

/** The reading cells of one row: R1 … Rn when the sample was taken on several units. */
function readingCells(unitCount: number) {
  return Array.from({ length: Math.max(1, unitCount) }, () => '<td class="fill"></td>').join("");
}

function readingHeaders(unitCount: number, width: number) {
  if (unitCount <= 1) return `<th style="width:${width}%">Valeur mesurée</th>`;
  const each = (width / unitCount).toFixed(1);
  return Array.from({ length: unitCount }, (_, i) => `<th class="rep" style="width:${each}%">${repetitionLabel(i + 1)}</th>`).join("");
}


export function buildBenchSheetHtml(date: Date, samples: BenchSheetSample[]): string {
  const blocks = samples
    .map(
      (sample) => `
    <section class="sample">
      <div class="head">
        <div>
          <span class="serial">${escapeHtml(sample.reference)}</span>
          <span class="type">${escapeHtml(SAMPLE_TYPE_LABELS[sample.type])}</span>
        </div>
        <div class="meta">
          Série ${escapeHtml(sample.serieNumber)} · ${show(sample.clientName)}
          ${sample.designation ? ` · ${escapeHtml(sample.designation)}` : ""}
          ${sample.numeroLot ? ` · lot ${escapeHtml(sample.numeroLot)}` : ""}
          ${sample.technicianName ? ` · ${escapeHtml(sample.technicianName)}` : ""}
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style="width:${sample.unitCount > 1 ? 24 : 34}%">Paramètre</th>
            <th style="width:9%">Unité</th>
            <th style="width:${sample.unitCount > 1 ? 23 : 20}%">Critère / seuil</th>
            ${readingHeaders(sample.unitCount, sample.unitCount > 1 ? 34 : 19)}
            <th style="width:${sample.unitCount > 1 ? 10 : 18}%">Note</th>
          </tr>
        </thead>
        <tbody>
          ${sample.parameters
            .map(
              (parameter) => `
            <tr>
              <td class="param">${escapeHtml(parameter.name)}</td>
              <td>${show(parameter.unit)}</td>
              <td class="crit">${show(parameter.threshold)}</td>
              ${readingCells(sample.unitCount)}
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
  ${pageCss(BENCH_SHEET_MARGIN)}
  * { box-sizing: border-box; }
  ${SUPERSCRIPT_CSS}
  /* 1px inside the page box: a border drawn on its very edge is clipped. */
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33; font-size: 9.6pt;
    margin: 0; padding: 0 1px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: flex; justify-content: space-between; align-items: baseline;
    border-bottom: 2px solid #1f3a4d; padding-bottom: 4px; margin-bottom: 10px;
    font-size: 9pt; color: #55707d; }
  .sheet b { color: #1f3a4d; }
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
  .crit { font-size: 8.2pt; }
  thead th.rep { text-align: center; font-family: Consolas, monospace; }
  .fill { background: #fcfdfe; height: 22px; }
  .empty { text-align: center; color: #7d929c; padding: 28px; border: 1px dashed #d9e3e8;
    border-radius: 4px; }
  footer { margin-top: 14px; border-top: 1px solid #e3eaee; padding-top: 6px;
    font-size: 7.4pt; color: #7d929c; display: flex; justify-content: space-between; }
</style>
</head>
<body>
<div class="sheet">
  <span>Date : <b>${formatDate(date)}</b></span>
  <span>${samples.length} échantillon${samples.length > 1 ? "s" : ""}</span>
</div>

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
