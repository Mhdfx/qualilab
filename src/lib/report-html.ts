import { COMPANY, type CompanyInfo } from "./company";
import { companyBrandHtml } from "./brand-html";
import { SAMPLE_TYPE_LABELS, formatDateTime, formatDate } from "./labels";
import type { Interpretation, SampleType } from "@/generated/prisma/client";
import { fmt, singleLimit, type Plan } from "./interpretation";
import { repetitionLabel } from "./series";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";

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
 *
 * The layout follows the laboratory's own model (RETOUR-LABO-29-09.md,
 * slice C): a « Réglementation en vigueur » table with an X under the
 * verdict, then one column per repetition R1 … Rn, the method (the norm
 * version) and the criteria m | M with « n = … c = … » beneath. One page per
 * sample: the type steps down with the number of parameters and
 * repetitions, and beyond ten repetitions the R columns continue in a
 * second band.
 */

export type ReportData = {
  number: string;
  controlCode: string | null;
  /** The série (visite or dépôt) the sample belongs to. */
  serialNumber: string;
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
  /** The sample's verdict under its criteria (CRITERES.md); null = the old
   *  conform/non-conform reading, or no official verdict (too few units). */
  interpretation: Interpretation | null;
  /** « Réglementation en vigueur », frozen at approval. */
  regulation: string | null;
  unitCount: number;
  results: {
    parameter: string;
    value: string | null;
    unit: string | null;
    threshold: string | null;
    conform: boolean | null;
    note: string | null;
    /** The criterion's verdict and the readings per unit, when a plan applied. */
    interpretation: Interpretation | null;
    norm: string | null;
    /** The plan the result was judged against, frozen with it; null = none. */
    criterion: Plan | null;
    units: ReportUnit[];
  }[];
};

export type ReportUnit = { display: string; value: number | null; detected: boolean | null };

/** The report's page margins: tighter than the other documents, so that a
 *  sample always fits on one page (slice C). */
export const REPORT_PDF_MARGIN = { top: "9mm", bottom: "11mm", left: "11mm", right: "11mm" };

/** Beyond this many repetitions the R columns continue in a second band. */
export const REPETITIONS_PER_BAND = 10;

const HEADER_COLUMNS: { verdict: Interpretation; label: string; hint: string }[] = [
  { verdict: "SATISFAISANT", label: "Satisfaisant", hint: "< m" },
  { verdict: "ACCEPTABLE", label: "Acceptable", hint: "m < X < M" },
  { verdict: "NON_SATISFAISANT", label: "Non satisfaisant", hint: "> M" },
];

type Row = ReportData["results"][number];

/** The two criteria cells (m | M) and the plan beneath, as the model prints them. */
function criteriaCells(row: Row): string {
  const plan = row.criterion;
  if (!plan) {
    // No criterion for this germ: its catalogue limit when it has one.
    return `<td class="crit" colspan="2">${row.threshold ? show(row.threshold) : "Non spécifié"}</td>`;
  }
  const beneath = `<span class="plan">n = ${plan.n}${plan.c !== null ? ` · c = ${plan.c}` : ""}</span>`;
  if (plan.mKind === "ABSENCE") return `<td class="crit" colspan="2">Absence${beneath}</td>`;
  if (plan.mKind === "UNSPECIFIED" && plan.bigM === null) return `<td class="crit" colspan="2">Non spécifié${beneath}</td>`;
  const m = plan.mKind === "UNSPECIFIED" ? "Non spécifié" : plan.m === null ? "—" : show(fmt(plan.m));
  const bigM = plan.bigM === null ? "—" : show(fmt(plan.bigM));
  return `<td class="crit">${m}</td><td class="crit">${bigM}${beneath}</td>`;
}

/** A repetition as printed: an absence test reads « Non détecté ». */
function unitText(row: Row, unit: ReportUnit): string {
  if (row.criterion?.mKind === "ABSENCE" || unit.detected !== null) {
    if (unit.detected === false || unit.display === "Absence") return "Non détecté";
    if (unit.detected === true || unit.display === "Présence") return "Détecté";
  }
  return unit.display;
}

/** Colour of one repetition against the plan: over M red, between m and M
 *  amber — and over a single limit, amber while c tolerates it (Q31). */
function unitClass(row: Row, unit: ReportUnit): string {
  const plan = row.criterion;
  if (!plan) return "";
  if (unit.detected === true) return "no";
  if (plan.mKind === "ABSENCE" || unit.value === null) return "";
  const single = singleLimit(plan);
  if (single !== null) return unit.value > single ? (row.interpretation === "ACCEPTABLE" ? "mid" : "no") : "";
  if (plan.bigM !== null && unit.value > plan.bigM) return "no";
  if (plan.m !== null && unit.value > plan.m) return "mid";
  return "";
}

function rowIsBad(row: Row) {
  return row.interpretation === "NON_SATISFAISANT" || row.conform === false;
}

/** One band of the results table: repetitions [from, to). */
function resultsTable(data: ReportData, from: number, to: number, first: boolean): string {
  const width = to - from;
  const perUnit = data.results.some((r) => r.units.length > 0);
  const repHeaders = perUnit
    ? Array.from({ length: width }, (_, i) => `<th class="rep">${repetitionLabel(from + i + 1)}</th>`).join("")
    : `<th class="rep">Résultat</th>`;
  const body = data.results
    .map((row) => {
      let cells: string;
      if (!perUnit) {
        cells = `<td class="rep ${rowIsBad(row) ? "no" : ""}">${show(row.value)}</td>`;
      } else if (row.units.length === 0) {
        // A single value on a sample read per repetition: it spans the band.
        cells = first
          ? `<td class="rep ${rowIsBad(row) ? "no" : ""}" colspan="${width}">${show(row.value)}</td>`
          : `<td class="rep" colspan="${width}"></td>`;
      } else {
        cells = Array.from({ length: width }, (_, i) => {
          const unit = row.units[from + i];
          if (!unit) return `<td class="rep">—</td>`;
          const text = unitText(row, unit);
          return `<td class="rep ${unitClass(row, unit)}${text === "Non détecté" ? " nd" : ""}">${show(text)}</td>`;
        }).join("");
      }
      const note = first && row.note ? `<span class="note">${escapeHtml(row.note)}</span>` : "";
      return first
        ? `<tr><td class="param">${show(row.parameter)}${note}</td><td class="method">${show(row.norm)}</td><td class="unit">${show(row.unit)}</td>${cells}${criteriaCells(row)}</tr>`
        : `<tr><td class="param">${show(row.parameter)}</td>${cells}</tr>`;
    })
    .join("");
  const head = first
    ? `<tr><th rowspan="2">Paramètres</th><th rowspan="2">Méthode</th><th rowspan="2">Unité</th>${perUnit ? `<th colspan="${width}" class="rep">Résultats</th>` : `<th rowspan="2" class="rep">Résultat</th>`}<th colspan="2" class="crit">Critères</th></tr>
       <tr>${perUnit ? repHeaders : ""}<th class="crit">m</th><th class="crit">M</th></tr>`
    : `<tr><th>Paramètres (suite)</th>${repHeaders}</tr>`;
  // Fixed widths: the names and criteria keep their room, the repetitions
  // share the rest evenly — whatever n is, the table stays one page wide.
  const cols = first
    ? `<col class="c-param"><col class="c-method"><col class="c-unit">${`<col>`.repeat(perUnit ? width : 1)}<col class="c-m"><col class="${perUnit ? "c-bigm" : "c-bigm wide"}">`
    : `<col class="c-param">${`<col>`.repeat(width)}`;
  return `<table class="results"><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

export function buildReportHtml(
  data: ReportData,
  company: CompanyInfo = COMPANY
): string {
  const nonConformes = data.results.filter((r) => r.conform === false).length;
  const alert = nonConformes > 0 || data.interpretation === "NON_SATISFAISANT";
  const withCriteria = data.results.some((r) => r.criterion !== null) || data.interpretation !== null;

  // The model's header table: the regulation, and an X under the verdict —
  // none when there is no official verdict (too few units, §3 rule 2).
  const verdictTable = withCriteria
    ? `<table class="verdicts">
  <thead><tr><th class="reg">Réglementation en vigueur</th>${HEADER_COLUMNS.map((c) => `<th>${c.label}<span>(${c.hint})</span></th>`).join("")}</tr></thead>
  <tbody><tr><td class="reg">${show(data.regulation)}</td>${HEADER_COLUMNS.map(
    (c) => `<td class="x ${c.verdict === "SATISFAISANT" ? "ok" : c.verdict === "ACCEPTABLE" ? "mid" : "no"}">${data.interpretation === c.verdict ? "X" : ""}</td>`
  ).join("")}</tr></tbody>
</table>`
    : "";

  // One page per sample: the type steps down as the table grows.
  const repetitions = data.results.some((r) => r.units.length > 0)
    ? Math.max(1, data.unitCount, ...data.results.map((r) => r.units.length))
    : 1;
  const inBand = Math.min(repetitions, REPETITIONS_PER_BAND);
  const lines = data.results.length * Math.ceil(repetitions / REPETITIONS_PER_BAND);
  const density =
    lines > 30 ? "dense xdense" : lines > 18 || inBand > 8 ? "dense" : lines > 11 || inBand > 5 ? "compact" : "";
  const bands: string[] = [];
  for (let from = 0; from < repetitions; from += REPETITIONS_PER_BAND) {
    bands.push(resultsTable(data, from, Math.min(repetitions, from + REPETITIONS_PER_BAND), from === 0));
  }

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport ${escapeHtml(data.number)}</title>
<style>
  @page { size: A4; margin: 9mm 11mm 11mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  ${SUPERSCRIPT_CSS}
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
  .brand-logo { height: 44px; max-width: 250px; object-fit: contain; display: block; }
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
  table { width: 100%; border-collapse: collapse; font-size: 9pt; margin-bottom: 10px; }
  thead th { background: #1f3a4d; color: #fff; text-align: left; padding: 5px 6px;
    font-weight: 600; font-size: 8pt; letter-spacing: .2px; border: 1px solid #1f3a4d; }
  tbody td { padding: 5px 6px; border: 1px solid #dbe4e9; vertical-align: top; }
  tbody tr:nth-child(even) td { background: #f6f9fb; }
  tr { page-break-inside: avoid; }
  thead { display: table-header-group; }
  .param { font-weight: 600; }
  .method { font-size: .88em; color: #3d5663; }
  .note { display: block; font-weight: 400; font-size: .85em; color: #55707d; margin-top: 1px; }
  table.results { table-layout: fixed; }
  .c-param { width: 19%; } .c-method { width: 11%; } .c-unit { width: 6.5%; }
  table.results td.unit { white-space: nowrap; overflow-wrap: normal; font-size: .92em; }
  .c-m { width: 8%; } .c-bigm { width: 11%; } .c-bigm.wide { width: 16%; }

  table.results td { overflow-wrap: anywhere; }
  th.rep, td.rep { text-align: center; }
  table.results td.rep { font-weight: 600; font-variant-numeric: tabular-nums; overflow-wrap: normal; }
  th.crit, td.crit { text-align: center; white-space: nowrap; }
  .plan { display: block; font-size: .82em; font-weight: 400; color: #55707d; margin-top: 1px; white-space: nowrap; }
  td.no, .no { color: #a5203a; font-weight: 700; }
  td.mid, .mid { color: #9a6700; font-weight: 700; }
  .ok { color: #2f6b3a; font-weight: 700; }
  .verdicts th { text-align: center; }
  .verdicts th span { display: block; font-weight: 400; font-size: .9em; opacity: .85; }
  .verdicts th.reg, .verdicts td.reg { text-align: left; width: 46%; }
  .verdicts td.x { text-align: center; font-size: 12pt; font-weight: 800; vertical-align: middle; }
  body.compact table.results { font-size: 8pt; line-height: 1.25; }
  body.compact table.results td { padding: 3px 5px; }
  body.dense table.results { font-size: 6.1pt; line-height: 1.06; }
  body.dense table.results td.nd { font-size: .88em; font-weight: 500; }
  body.xdense table.results { font-size: 5.8pt; line-height: 1.04; }
  body.xdense table.results td, body.xdense table.results th { padding: 1px 3px; }
  body.xdense .sig { min-height: 0; padding: 3px 8px; }
  body.xdense .sig .name { display: inline; font-size: 8.4pt; margin-right: 6px; }
  body.xdense .sig .when { display: inline; }
  body.xdense .conclusion { padding: 4px 10px; margin-bottom: 6px; }
  body.xdense .verdicts td, body.xdense .verdicts th { padding: 2px 5px; }
  body.dense table.results td, body.dense table.results th { padding: 1.5px 3px; }
  body.dense table.results .plan { display: inline; font-size: .9em; margin-left: 3px; }
  body.dense table.results .param { font-weight: 600; font-size: .95em; }
  body.dense table.results .method { font-size: .78em; }
  body.dense .tagline, body.dense .identity { font-size: 6.8pt; }
  body.dense .brand-logo { height: 34px; }
  body.dense header { padding: 6px 0 5px; margin-bottom: 6px; }
  body.dense h1 { font-size: 11pt; margin-bottom: 6px; }
  body.dense .grid { margin-bottom: 6px; }
  body.dense .box { padding: 5px 8px; }
  body.dense { line-height: 1.3; }
  body.dense .row { font-size: 7.4pt; margin-bottom: 0; }
  body.dense .box h2 { margin-bottom: 2px; }
  body.dense .docmeta { font-size: 7.4pt; line-height: 1.4; }
  body.dense .brand { font-size: 14pt; }
  body.dense .verdicts { font-size: 8pt; margin-bottom: 6px; }
  body.dense .verdicts td, body.dense .verdicts th { padding: 3px 5px; }
  body.dense .conclusion { padding: 6px 10px; margin-bottom: 8px; }
  body.dense .sig { min-height: 36px; padding: 4px 8px; }
  body.dense .conclusion p { font-size: 8.6pt; }
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
<body class="${density}">
<div class="band"></div>
<header>
  <div>
    ${companyBrandHtml(company)}
    <div class="tagline">${escapeHtml(company.tagline)}</div>
    <div class="identity">
      ${escapeHtml(company.address)} · ${escapeHtml(company.city)}<br>
      Tél. ${escapeHtml(company.phone)} · ${escapeHtml(company.email)}<br>
      ICE ${escapeHtml(company.ice)} · RC ${escapeHtml(company.rc)}
    </div>
  </div>
  <div class="docmeta">
    <div class="kind">Rapport d'analyse</div>
    N° <b>${escapeHtml(data.number)}</b><br>
    Code contrôle <b>${show(data.controlCode)}</b><br>
    N° de série <b>${escapeHtml(data.serialNumber)}</b><br>
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
    ${data.unitCount > 1 ? `<div class="row"><span class="k">Répétitions</span><span class="v">${data.unitCount} (R1 … R${data.unitCount})</span></div>` : ""}
  </div>
</div>

${verdictTable}

${bands.join("\n")}

<div class="conclusion">
  <h2>Conclusion</h2>
  <p${alert ? ' class="alert"' : ""}>${escapeHtml(data.conclusion)}</p>
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
  ${escapeHtml(company.name)} — Rapport ${escapeHtml(data.number)} ·
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
