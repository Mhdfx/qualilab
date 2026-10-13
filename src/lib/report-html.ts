import { COMPANY, type CompanyInfo } from "./company";
import { AIR_METHOD_LABELS } from "./labels";
import type { AirMethod, Interpretation, LineKind, SampleType, TemperatureSource } from "@/generated/prisma/client";
import { fmt, singleLimit, type Plan } from "./interpretation";
import { repetitionLabel } from "./series";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";
import { isUncountableText } from "./result-value";
import { designationHeading } from "./document-html";
import { RECONSTRUCTED_LABEL, amendmentHeader, duplicataMention, supersededMention } from "./report-amendment";
import { REPORT_CARTOUCHE_INK, cartoucheMargin, cartoucheTemplate, pageCss, type PageMargin } from "./cartouche-html";
import { DOC_TYPE_LABELS, type DocumentRef } from "./document-types";
import { formatDateOnly } from "./date-only";
import {
  AIR_SAMPLING_PROCEDURE,
  LEGAL_SEPARATOR,
  REPORT_EXECUTION_PLACE,
  REPORT_LEGEND,
  REPORT_NB,
  SAMPLING_PROCEDURES,
  analysisPeriodText,
  legalFooterExtraLines,
  reportDateTime,
  reportDay,
  reportLegalFooter,
  reportTemperatures,
} from "./report-template";

/**
 * The official analysis report — the laboratory's template « Rapport
 * d'essai » PG06/EN03 version M (received 12/10, RETOUR-LABO-06-10.md),
 * reproduced field for field with the sample's data:
 *
 * - **page 1, the report**: « RAPPORT D'ANALYSES <n°> », the série, the
 *   framed « Client », the table « Produit (IC) » (« Prélèvement et
 *   réception » on the left, « Données fournies par le client (IC) » and
 *   « Information sur l'échantillon » on the right), the results
 *   « Paramètres | Méthode | Unité | Résultats » — one column per repetition
 *   R1 … Rn under « Résultats » when the sample is read per unit — and the
 *   signatures « Responsable Technique » / « Direction »;
 * - **page 2, « -ANNEXE- Interprétation des résultats »**: the série, the
 *   client, « Prélèvement et réception », « (Nombre d'analyse/échantillon =
 *   n) », the verdict ticked under « Satisfaisant » / « Non satisfaisant »
 *   with the regulation, the criteria « m | M » (n and c beneath) and the
 *   conclusion.
 *
 * The cartouche (logo, « Rapport d'essai », « Réf : », « Version »,
 * « Page x sur y », dates) is Chromium's header template, and the legend,
 * the « N.B » block and the legal footer are its footer template: both
 * repeat on every page, inside the page box `reportPdfMargin` that the
 * page's own `@page` declares too (`reportPdfParts`).
 *
 * Everything comes from the sample and the snapshot taken at approval —
 * nothing is recomputed, so a report downloaded a year later is identical to
 * the one sent to the client. Page 1 and the annex each hold on one page:
 * the type steps down with the weight of the pages (`reportDensity` guesses,
 * `printReport` checks the PDF and steps down again while it runs over two
 * pages — `report-onepage.test.ts` prints the heaviest cases and the ones
 * in between), and beyond ten repetitions the R columns continue in a
 * second band.
 */

export type ReportData = {
  number: string;
  controlCode: string | null;
  /** The série (visite or dépôt) the sample belongs to. */
  serialNumber: string;
  client: { name: string; address: string | null; ice: string | null };
  /** The série's site of the client (a restaurant of a chain…), printed
   *  under the client — RETOUR-LABO-06-10.md §5, V5. */
  siteName?: string | null;
  /** The designation as the documents print it (`sampleDesignation`):
   *  « Planche verte — surface nettoyée », « Salle — Boîte exposée 30 min ». */
  produit: string | null;
  /** Names the designation row: « Produit » for food and water, « Désignation » otherwise. */
  lineKind?: LineKind | null;
  numeroLot: string | null;
  lieu: string;
  type: SampleType;
  sampledAt: Date;
  receivedAt: Date | null;
  /** « Préleveur »: who sampled (`reportSampler`). */
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
  /** An amended version (AMENDEMENT.md §2.3): the version it cancels and
   *  replaces, and the reason. Absent or null on an original report. */
  amendment?: ReportAmendment | null;

  /* --- PG06/EN03 version M (13/10). Absent on the versions frozen before:
   *     the report then prints « — » in their place. --- */

  /** False when the client or a third party sampled: the laboratory's
   *  sampling procedures do not apply (« N/A »). Absent = the laboratory. */
  sampledByLab?: boolean;
  /** False on a deposit whose « Prélevé le » was not declared (C1): the
   *  sampling time is then not printed. */
  samplingTimeDeclared?: boolean | null;
  /** « Moyen de prélèvement » of an air sample. */
  airMethod?: AirMethod | null;
  /** « Dates Prod » / « Dates Exp » — calendar dates (`@db.Date`). */
  productionDate?: Date | null;
  expiryDate?: Date | null;
  /** « Température du produit » at sampling and at reception, the cooler's. */
  productTemperature?: number | null;
  receptionTemperature?: number | null;
  receptionTemperatureSource?: TemperatureSource | null;
  coolerTemperature?: number | null;
  /** « Date d'analyse »: the programme confirmed (else the reception) → the last result entered. */
  analysisFrom?: Date | null;
  analysisTo?: Date | null;
  /** « Date d'édition de rapport »: the approval that issued this version. */
  issuedAt?: Date | null;
};

export type ReportAmendment = {
  /** The printed number of the version replaced (« RAP-2026-00001 », then « -A1 »…). */
  previousNumber: string;
  /** When that version was issued. */
  previousIssuedAt: Date | string;
  /** « Motif de l'amendement », as written when the report was reopened. */
  note: string | null;
};

/**
 * What a given print adds to the report, never frozen with it
 * (AMENDEMENT.md §3): the duplicate mark, and the marks of an old version.
 */
export type ReportMarks = {
  /** « DUPLICATA — édité le … », head and foot. */
  duplicataAt?: Date | null;
  /** The printed number of the current version, when this one is no longer it. */
  supersededBy?: string | null;
  /** Version 0 rebuilt at the first amendment of a report issued before versions existed. */
  reconstructed?: boolean;
};

export type ReportUnit = { display: string; value: number | null; detected: boolean | null };

/**
 * The report's page box: the cartouche's top margin, the forms' sides, and
 * a bottom margin that holds the footer template (legend, N.B, legal
 * footer — `reportFooterTemplate`, ≈ 39 mm of text set ≈ 5 mm above the
 * page's edge by Chromium) with a clear gap above it. The page's `@page`
 * declares the same box (a document's own margin wins over the one handed
 * to `page.pdf()`): both come from `reportPdfMargin`.
 */
export const REPORT_PDF_MARGIN: PageMargin = { ...cartoucheMargin(), bottom: "46mm" };

/** …and with the line of a print's marks (« DUPLICATA — édité le … ») above the legend. */
export const REPORT_PDF_MARGIN_MARKED: PageMargin = { ...REPORT_PDF_MARGIN, bottom: "50.5mm" };

/** The height of one more line of the legal footer, in mm (6 pt × 1.3, rounded up). */
const FOOTER_LINE_MM = 2.8;

/**
 * The page box of one print: taller at the foot when its footer carries
 * marks, and by one line for each line a long identity field wraps to
 * (`legalFooterExtraLines`) — the footer grows upwards from the page's edge.
 */
export function reportPdfMargin(marks: ReportMarks = {}, company: CompanyInfo = COMPANY): PageMargin {
  const box = marksOf(marks).length > 0 ? REPORT_PDF_MARGIN_MARKED : REPORT_PDF_MARGIN;
  const extra = legalFooterExtraLines(company);
  if (extra === 0) return box;
  return { ...box, bottom: `${Math.round((parseFloat(box.bottom) + extra * FOOTER_LINE_MM) * 10) / 10}mm` };
}

/** Beyond this many repetitions the R columns continue in a second band. */
export const REPETITIONS_PER_BAND = 10;

/** The verdict columns of the annex: the template's two, « Acceptable » between them only for an acceptable sample. */
const VERDICT_COLUMNS: { verdict: Interpretation; label: string }[] = [
  { verdict: "SATISFAISANT", label: "Satisfaisant" },
  { verdict: "ACCEPTABLE", label: "Acceptable" },
  { verdict: "NON_SATISFAISANT", label: "Non satisfaisant" },
];

/**
 * The annex's two heading lines. A word joiner (U+2060, invisible) follows
 * « -ANNEXE- »: text extractors join a line that ends with a hyphen to the
 * next one as a hyphenated word (pdftotext prints « -ANNEXEInterprétation »,
 * with the template's own PDF too), and the label would be lost to a search.
 */
export const ANNEX_HEADING = "-ANNEXE-&#x2060;<br>Interprétation des résultats";

/** « (IC) »: information supplied by the client, as the template marks it — after a space, as the template prints « Produit (IC) ». */
const IC = "<sup>(IC)</sup>";

type Row = ReportData["results"][number];

/** The two criteria cells (m | M) and the plan beneath, as the annex prints them. */
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

/** A repetition as printed: an absence test reads « Non détecté »; an
 *  uncountable plate prints as typed (« Indénombrable », « TNTC »). */
function unitText(row: Row, unit: ReportUnit): string {
  if (unit.detected === true && isUncountableText(unit.display)) return unit.display;
  if (row.criterion?.mKind === "ABSENCE" || unit.detected !== null) {
    if (unit.detected === false || unit.display === "Absence") return "Non détecté";
    if (unit.detected === true || unit.display === "Présence") return "Détecté";
  }
  return unit.display;
}

/**
 * An uncountable word as it may break in a narrow repetition column: a soft
 * hyphen between syllables (« Indénom-brable », « Incomp-table »), invisible
 * unless the line breaks there. The letters stay exactly as typed.
 */
function breakableWord(text: string): string {
  return text.replace(/^(ind[ée]nom)(brables?)$/i, "$1­$2").replace(/^(incomp)(tables?)$/i, "$1­$2");
}

/** Colour of one repetition against the plan: over M red, between m and M
 *  amber — and over a single limit, amber while c tolerates it (Q31). */
function unitClass(row: Row, unit: ReportUnit): string {
  const plan = row.criterion;
  if (!plan) return "";
  if (unit.detected === true) return "no";
  if (plan.mKind === "ABSENCE" || unit.value === null) return "";
  // « > x » is above a limit as soon as x reaches it.
  const value = unit.value;
  const lowerBound = unit.display.trim().startsWith(">");
  const over = (limit: number) => (lowerBound ? value >= limit : value > limit);
  const single = singleLimit(plan);
  if (single !== null) return over(single) ? (row.interpretation === "ACCEPTABLE" ? "mid" : "no") : "";
  if (plan.bigM !== null && over(plan.bigM)) return "no";
  if (plan.m !== null && over(plan.m)) return "mid";
  return "";
}

function rowIsBad(row: Row) {
  return row.interpretation === "NON_SATISFAISANT" || row.conform === false;
}

/** The repetitions the results table needs: n, or 1 for a sample read once. */
function repetitionsOf(data: ReportData): number {
  return data.results.some((r) => r.units.length > 0)
    ? Math.max(1, data.unitCount, ...data.results.map((r) => r.units.length))
    : 1;
}

/** One band of the results table of page 1: repetitions [from, to). */
function resultsTable(data: ReportData, from: number, to: number, first: boolean): string {
  const width = to - from;
  const perUnit = data.results.some((r) => r.units.length > 0);
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
          // « Indénombrable » is wider than an R column of five or more: it
          // wraps inside its cell instead of running over the next one.
          if (isUncountableText(text)) return `<td class="rep word ${unitClass(row, unit)}">${show(breakableWord(text))}</td>`;
          return `<td class="rep ${unitClass(row, unit)}${text === "Non détecté" ? " nd" : ""}">${show(text)}</td>`;
        }).join("");
      }
      const note = first && row.note ? `<span class="note">${escapeHtml(row.note)}</span>` : "";
      return first
        ? `<tr><td class="param">${show(row.parameter)}${note}</td><td class="method">${show(row.norm)}</td><td class="unit">${show(row.unit)}</td>${cells}</tr>`
        : `<tr><td class="param">${show(row.parameter)}</td>${cells}</tr>`;
    })
    .join("");

  const repHeaders = Array.from({ length: width }, (_, i) => `<th class="rep">${repetitionLabel(from + i + 1)}</th>`).join("");
  const head = first
    ? perUnit
      ? `<tr><th rowspan="2">Paramètres</th><th rowspan="2">Méthode</th><th rowspan="2" class="unit">Unité</th><th colspan="${width}" class="rep">Résultats</th></tr><tr class="reps">${repHeaders}</tr>`
      : `<tr><th>Paramètres</th><th>Méthode</th><th class="unit">Unité</th><th class="rep">Résultats</th></tr>`
    : `<tr><th rowspan="2">Paramètres (suite)</th><th colspan="${width}" class="rep">Résultats</th></tr><tr class="reps">${repHeaders}</tr>`;
  // Every band shares the first band's R columns (n, at most ten).
  const w = resultColumns(perUnit ? Math.min(repetitionsOf(data), REPETITIONS_PER_BAND) : 0);
  const col = (percent: number) => `<col style="width:${percent}%">`;
  const cols = first
    ? `${col(w.param)}${col(w.method)}${col(w.unit)}${col(w.rep).repeat(Math.max(1, perUnit ? width : 1))}`
    : // The next band keeps the first band's R columns; the names take the rest.
      `${col(Math.round((100 - w.rep * width) * 100) / 100)}${col(w.rep).repeat(width)}`;
  return `<div class="frame long"><table class="results"><colgroup>${cols}</colgroup><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

/**
 * The widths of page 1's results table, in % of the page: the template's
 * own (43 | 18 | 9 | 30) for a sample read once; with R1 … Rn the
 * repetitions take up to 55 % of the width — « Non détecté » holds on one
 * line up to nine of them — and the names share the rest, the parameter
 * before the method. Pure, so the widths always add up to 100.
 */
export function resultColumns(repetitions: number): { param: number; method: number; unit: number; rep: number } {
  if (repetitions <= 0) return { param: 43, method: 18, unit: 9, rep: 30 };
  const unit = 6.5;
  const reps = Math.min(55, 12 + repetitions * 5);
  const rep = Math.round((reps / repetitions) * 100) / 100;
  const names = 100 - unit - rep * repetitions;
  const param = Math.round(names * 0.6 * 100) / 100;
  return { param, method: Math.round((names - param) * 100) / 100, unit, rep };
}

/**
 * The marks of a given print — they cost no height on the title line, and
 * repeat at the foot of every page (`reportFooterTemplate`): « DUPLICATA —
 * édité le … », « Version remplacée par … », « Version reconstituée ».
 */
function marksOf(marks: ReportMarks): { text: string; kind: "duplicata" | "superseded" }[] {
  const parts: { text: string; kind: "duplicata" | "superseded" }[] = [];
  if (marks.duplicataAt) parts.push({ text: duplicataMention(marks.duplicataAt), kind: "duplicata" });
  if (marks.supersededBy) parts.push({ text: supersededMention(marks.supersededBy), kind: "superseded" });
  if (marks.reconstructed) parts.push({ text: RECONSTRUCTED_LABEL, kind: "superseded" });
  return parts;
}

function marksHtml(marks: ReportMarks): string {
  const parts = marksOf(marks).map((mark) => `<span class="mark ${mark.kind}">${escapeHtml(mark.text)}</span>`);
  return parts.length > 0 ? `<div class="marks">${parts.join("")}</div>` : "";
}

/** The ink of each mark, in the footer template (inline styles only). */
const MARK_INK = { duplicata: "#a5203a", superseded: "#9a6700" } as const;

/** « Rapport amendé — annule et remplace le rapport … du … » and the reason (AMENDEMENT.md §2.3). */
function amendmentHtml(data: ReportData): string {
  if (!data.amendment) return "";
  const header = amendmentHeader(data.amendment);
  const replaces = header.replaces.charAt(0).toLowerCase() + header.replaces.slice(1);
  return `<div class="amended"><b>${escapeHtml(header.title)}</b> — ${escapeHtml(replaces)}.${
    header.note ? ` <span>${escapeHtml(header.note)}</span>` : ""
  }</div>`;
}

/** « Label : value » — the value escaped, « — » when nothing was recorded. */
function field(label: string, value: string | null | undefined, { bold = false } = {}): string {
  return bold ? `<b>${label} :</b> <b>${show(value)}</b>` : `${label} : ${show(value)}`;
}

/** « N° de série » and the framed « Client », side by side as the template draws them. */
function identityRow(data: ReportData, { withNumber }: { withNumber: boolean }): string {
  return `<div class="idrow">
  <div class="serial">
    <div>N° de série : <b>${escapeHtml(data.serialNumber)}</b></div>
    ${withNumber ? `<div class="ofreport">Rapport d'analyses ${escapeHtml(data.number)}</div>` : ""}
  </div>
  <div class="client">
    <div class="client-label">Client</div>
    <div class="client-name">${show(data.client.name)}</div>
    ${data.siteName ? `<div class="client-line">Site : ${show(data.siteName)}</div>` : ""}
    ${data.client.address ? `<div class="client-line">${show(data.client.address)}</div>` : ""}
  </div>
</div>`;
}

/** « Site de prélèvement »: the client, and the série's site — as the protocol prints it. */
function samplingSite(data: ReportData): string {
  return data.siteName ? `${data.client.name} — ${data.siteName}` : data.client.name;
}

/** « Date et heure du Prélèvement »: an undeclared deposit time is said, never invented. */
function sampledAtText(data: ReportData): string {
  return data.samplingTimeDeclared === false ? "Non déclarée" : (reportDateTime(data.sampledAt) ?? "—");
}

/** The reference lines of the sampling: the procedures, the air instruction, the means. */
function samplingReferenceHtml(data: ReportData): string {
  const air = data.lineKind === "AIR";
  const means = `Moyen de prélèvement : ${air && data.airMethod ? escapeHtml(AIR_METHOD_LABELS[data.airMethod]) : "—"}`;
  if (data.sampledByLab === false) {
    return `Référence prélèvement : N/A (prélèvement non effectué par le laboratoire)<br>${means}`;
  }
  // A version frozen before the template does not say who sampled: the
  // procedures are not claimed for it (it may be a client's deposit).
  if (data.sampledByLab === undefined) return `Référence prélèvement : —<br>${means}`;
  return [
    `Référence prélèvement ${escapeHtml(SAMPLING_PROCEDURES)}`,
    air ? `Prélèvement de l'air : ${escapeHtml(AIR_SAMPLING_PROCEDURE)}` : null,
    means,
  ]
    .filter(Boolean)
    .join("<br>");
}

/** Page 1's table « Produit (IC) »: the sampling on the left, the client's data and the sample on the right. */
function infoTable(data: ReportData): string {
  const t = reportTemperatures(data);
  const day = (date: Date | null | undefined) => (date ? formatDateOnly(date) : null);
  return `<div class="frame"><table class="info">
<colgroup><col class="half"><col class="half"></colgroup>
<tr><th colspan="2" class="produit">${designationHeading(data.lineKind)} ${IC} : ${show(data.produit)}</th></tr>
<tr><th class="sub">Prélèvement et réception</th><th class="sub"><b>Données fournies par le client ${IC}</b></th></tr>
<tr><td>Date et heure du Prélèvement : ${escapeHtml(sampledAtText(data))}</td><td rowspan="2">${field("Lot", data.numeroLot, { bold: true })}</td></tr>
<tr><td>Date et heure de réception : ${show(reportDateTime(data.receivedAt))}</td></tr>
<tr><td>Préleveur : ${show(data.preleveur)}</td><td>${field("Dates Prod", day(data.productionDate), { bold: true })}</td></tr>
<tr><td>${samplingReferenceHtml(data)}</td><td>${field("Dates Exp", day(data.expiryDate), { bold: true })}</td></tr>
<tr><td>${field("Site de prélèvement", samplingSite(data))}</td><th class="sub">Information sur l'échantillon</th></tr>
<tr><td>${field("Lieu du prélèvement", data.lieu)}</td><td>Température du produit :<br><span class="pair"><span>Au prélèvement : ${show(t.atSampling)}</span><span>à la réception : ${show(t.atReception)}</span></span></td></tr>
<tr><td>Lieu d'exécution : ${escapeHtml(REPORT_EXECUTION_PLACE)}</td><td>${field("Température glacière à la réception", t.cooler)}</td></tr>
<tr><td>${field("Date d'analyse", analysisPeriodText(data.analysisFrom, data.analysisTo))}<br>${field(
    "Date d'édition de rapport",
    reportDay(data.issuedAt)
  )}</td><td>${field("N° de contrôle", data.controlCode)}</td></tr>
</table></div>`;
}

/** The annex's « Prélèvement et réception ». */
function annexSamplingTable(data: ReportData): string {
  return `<div class="frame"><table class="sampling">
<tr><th class="sub plain">Prélèvement et réception</th></tr>
<tr><td>Date et heure du Prélèvement : ${escapeHtml(sampledAtText(data))}</td></tr>
<tr><td>Date et heure de réception : ${show(reportDateTime(data.receivedAt))}</td></tr>
<tr><td>Préleveur : ${show(data.preleveur)}</td></tr>
<tr><td>${field("Site de prélèvement", samplingSite(data))}</td></tr>
</table></div>`;
}

/**
 * The annex's verdict, regulation and criteria — one framed block, as the
 * template draws it. It may run on (`frame long`): were it kept whole, an
 * annex too long for its page would leave that page empty under the
 * sampling table (`printReport` steps the type down before that happens).
 */
function interpretationTable(data: ReportData): string {
  const columns = VERDICT_COLUMNS.filter((c) => c.verdict !== "ACCEPTABLE" || data.interpretation === "ACCEPTABLE");
  const verdictWidth = columns.length === 3 ? 13 : 20;
  const verdict = `<table class="verdict">
<colgroup><col style="width:${100 - 20 - verdictWidth * columns.length}%"><col style="width:20%">${columns
    .map(() => `<col style="width:${verdictWidth}%">`)
    .join("")}</colgroup>
<thead><tr><th>${designationHeading(data.lineKind)} ${IC}</th><th>N° de contrôle</th>${columns.map((c) => `<th>${c.label}</th>`).join("")}</tr></thead>
<tbody><tr><td>${show(data.produit)}</td><td class="center">${show(data.controlCode)}</td>${columns
    .map(
      (c) =>
        `<td class="x ${c.verdict === "SATISFAISANT" ? "ok" : c.verdict === "ACCEPTABLE" ? "mid" : "no"}">${data.interpretation === c.verdict ? "X" : ""}</td>`
    )
    .join("")}</tr>
<tr><td colspan="${2 + columns.length}" class="reg">Réglementation en vigueur : ${show(data.regulation)}</td></tr></tbody>
</table>`;
  const rows = data.results
    .map((row) => `<tr><td class="param">${show(row.parameter)}</td><td class="method">${show(row.norm)}</td><td class="unit">${show(row.unit)}</td>${criteriaCells(row)}</tr>`)
    .join("");
  const criteria = `<table class="criteria">
<colgroup><col class="a-param"><col class="a-method"><col class="a-unit"><col class="a-m"><col class="a-m"></colgroup>
<thead><tr><th rowspan="2">Paramètres</th><th rowspan="2">Méthode</th><th rowspan="2" class="unit">Unité</th><th colspan="2" class="crit">Critères</th></tr>
<tr><th class="crit">m</th><th class="crit">M</th></tr></thead>
<tbody>${rows}</tbody>
</table>`;
  return `<div class="frame long">${verdict}${criteria}</div>`;
}

/** The densities of the two pages, lightest first — the body's class. */
export const REPORT_DENSITIES = ["", "compact", "dense", "dense xdense"] as const;

export type ReportDensity = (typeof REPORT_DENSITIES)[number];

/** Lines a text of `length` characters takes at `perLine` characters a line, beyond its first. */
function wrappedLines(length: number, perLine: number): number {
  return length > perLine ? Math.ceil(length / perLine) - 1 : 0;
}

/**
 * The first guess at the density of the two pages — the body's class: the
 * type steps down as the pages grow, so that page 1 and the annex each hold
 * on one page. Each page's weight is counted in table lines at the lightest
 * type:
 *  - page 1: every row of every band, the head of a second band, the
 *    amendment and its reason, the identity's wrapped lines (a long client,
 *    site, product, place), and the cells that wrap in narrow R columns;
 *  - the annex: every row of the criteria, two for a row printing its plan
 *    « n = … c = … » beneath m | M, the regulation's and the client's
 *    wrapped lines, and the marks of a print (their foot is taller).
 * Page 1 decides between the denser types (the annex prints its plan on the
 * row's line there), either page between the lighter ones. The thresholds
 * are measured (review of 13/10: 3 to 37 germs × 1, 5 and 9 repetitions,
 * with and without marks) and err on the light side. A guess only:
 * `printReport` prints with it and steps down while the PDF runs over two
 * pages.
 */
export function reportDensity(data: ReportData, marks: ReportMarks = {}): ReportDensity {
  const repetitions = repetitionsOf(data);
  const bands = Math.ceil(repetitions / REPETITIONS_PER_BAND);
  const inBand = Math.min(repetitions, REPETITIONS_PER_BAND);
  // The client box's lines and the info table's are shorter than a row of
  // the results: three of them weigh about two rows.
  const clientName = wrappedLines(data.client.name.length, 40);
  const identity = Math.round(
    0.75 *
      (clientName +
        wrappedLines((data.client.address ?? "").length, 60) +
        wrappedLines((data.siteName ?? "").length, 60) +
        wrappedLines(samplingSite(data).length + 23, 60) +
        wrappedLines((data.produit ?? "").length + 16, 90) +
        wrappedLines(data.lieu.length + 22, 60))
  );
  const amendment = data.amendment ? 2 + Math.ceil((data.amendment.note?.length ?? 0) / 150) : 0;
  // Five repetitions and more: « Non détecté » and the methods wrap in their narrower columns.
  const narrow = (inBand >= 5 ? 2 : 0) + (inBand >= 9 ? 2 : 0);
  const page1 = data.results.length * bands + 2 * (bands - 1) + amendment + identity + narrow;
  const annex =
    data.results.reduce((sum, row) => sum + (row.criterion ? 2 : 1), 0) +
    wrappedLines(`Réglementation en vigueur : ${data.regulation ?? "—"}`.length, 110) +
    clientName +
    (marksOf(marks).length > 0 ? 1 : 0);
  if (page1 > 39) return "dense xdense";
  if (page1 > 17 || annex > 24) return "dense";
  if (page1 > 11 || annex > 20) return "compact";
  return "";
}

/** Page 1 and the annex: the report's pages when each holds on one. */
export const REPORT_PAGES = 2;

/**
 * The pages of a PDF as Chromium writes it (its page objects are not
 * compressed); null when none is found, so a format change never loops.
 */
export function pdfPageCount(pdf: Uint8Array): number | null {
  const count = (Buffer.from(pdf.buffer, pdf.byteOffset, pdf.byteLength).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
  return count > 0 ? count : null;
}

/**
 * Prints the report so that page 1 and the annex each hold on one page: with
 * the density `reportDensity` guesses, then — while the PDF runs over two
 * pages — with the next denser one. The guess counts characters, the browser
 * lays out words: a long client name or method can still push a page over,
 * and the PDF the browser made is the only measure that never misses. At the
 * densest type a report that still does not hold prints on more pages, its
 * tables' heads repeated, never cut.
 */
export async function printReport(
  input: ReportPdfInput,
  render: (parts: ReportPdfOutput) => Promise<Buffer>
): Promise<Buffer> {
  let level = REPORT_DENSITIES.indexOf(input.density ?? reportDensity(input.data, input.marks));
  for (;;) {
    const pdf = await render(reportPdfParts({ ...input, density: REPORT_DENSITIES[level] }));
    const pages = pdfPageCount(pdf);
    if (pages === null || pages <= REPORT_PAGES || level >= REPORT_DENSITIES.length - 1) return pdf;
    level += 1;
  }
}

/**
 * The page of the report: page 1 and its annex. The laboratory's identity is
 * not in it — it prints in the footer template (`reportFooterTemplate`) and
 * the logo in the cartouche; `reportPdfParts` assembles the three. The
 * company only sizes the page's foot (`reportPdfMargin`), as the PDF call does.
 * `density` is `reportDensity`'s guess unless `printReport` stepped it down.
 */
export function buildReportHtml(
  data: ReportData,
  marks: ReportMarks = {},
  company: CompanyInfo = COMPANY,
  density: ReportDensity = reportDensity(data, marks)
): string {
  const nonConformes = data.results.filter((r) => r.conform === false).length;
  const alert = nonConformes > 0 || data.interpretation === "NON_SATISFAISANT";
  const repetitions = repetitionsOf(data);
  const bands: string[] = [];
  for (let from = 0; from < repetitions; from += REPETITIONS_PER_BAND) {
    bands.push(resultsTable(data, from, Math.min(repetitions, from + REPETITIONS_PER_BAND), from === 0));
  }
  // « VC Version Corrigée » (the template's legend): an amended version says so after its number.
  const corrected = data.amendment ? ` <span class="vc">(VC)</span>` : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Rapport ${escapeHtml(data.number)}</title>
<style>
  ${pageCss(reportPdfMargin(marks, company))}
  * { box-sizing: border-box; }
  /* 1px inside the page box: a border drawn on its very edge is clipped. */
  html, body { margin: 0; padding: 0 1px; }
  ${SUPERSCRIPT_CSS}
  /* Arial: the container's Liberation Sans shares its metrics, so the page
     laid out on a workstation is the one the server prints. */
  body { font-family: Arial, "Liberation Sans", Helvetica, sans-serif; color: #000; font-size: 9pt; line-height: 1.3;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet + .sheet { break-before: page; page-break-before: always; }
  .title { margin: 1mm 0 3mm; text-align: center; }
  h1 { font-size: 10.5pt; font-weight: 400; font-style: italic; margin: 0; letter-spacing: .2px; }
  h1 b { font-style: normal; letter-spacing: .3px; }
  h1 .vc { font-style: normal; font-weight: 700; }
  .marks { display: flex; flex-wrap: wrap; justify-content: center; gap: 1.5mm 3mm; margin-top: 1.5mm; }
  .mark { border-radius: 1mm; padding: .4mm 2.5mm; font-size: 7.6pt; font-weight: 700; letter-spacing: .4px; white-space: nowrap; }
  .mark.duplicata { border: 1.4px solid #a5203a; color: #a5203a; }
  .mark.superseded { border: 1.4px solid #9a6700; color: #9a6700; background: #fff8e6; }
  .amended { border: 1px solid #000; border-left: 3.5px solid #a5203a; padding: 1.2mm 3mm; margin: 0 0 3mm;
    font-size: 8.2pt; line-height: 1.3; page-break-inside: avoid; }
  .amended b { color: #a5203a; text-transform: uppercase; letter-spacing: .4px; }
  .idrow { display: flex; justify-content: space-between; align-items: flex-start; gap: 6mm; margin-bottom: 3mm; page-break-inside: avoid; }
  .serial { padding-top: 1mm; font-size: 9.6pt; }
  .serial .ofreport { font-size: 8pt; margin-top: 1mm; }
  /* « Client » sits on the frame's top rule, as the bon's signature boxes do. */
  .client { position: relative; width: 47%; border: 3.5px double #000; padding: 2mm 3mm 1.6mm; margin-top: 1.5mm; text-align: center; }
  .client-label { position: absolute; top: -.75em; left: 4mm; padding: 0 1.2mm; background: #fff; font-size: 8pt; font-weight: 700;
    font-style: italic; line-height: 1.2; }
  .client-name { font-size: 11.5pt; font-weight: 700; font-style: italic; line-height: 1.2; overflow-wrap: anywhere; }
  .client-line { font-size: 8.4pt; line-height: 1.25; overflow-wrap: anywhere; }
  /* The template's tables: a double frame, single rules inside. A long one
     (the results, the criteria) may run on; the others stay whole. */
  .frame { border: 3px double #000; margin-bottom: 3mm; page-break-inside: avoid; }
  .frame.long { page-break-inside: auto; }
  .frame table { width: 100%; border-collapse: collapse; border-style: hidden; table-layout: fixed; }
  .frame table + table { border-top: 1px solid #000; }
  th, td { border: 1px solid #000; padding: .9mm 1.6mm; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
  th { font-weight: 400; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th.sub { background: #b4c6e7; font-style: italic; text-align: center; padding-top: .5mm; padding-bottom: .5mm; }
  th.sub.plain { background: none; }
  .info, .sampling, table.verdict, .count { font-size: 8.8pt; line-height: 1.3; }
  .info th.produit { background: #b4c6e7; font-weight: 700; }
  .pair { display: flex; justify-content: space-between; gap: 3mm; }
  table.results, table.criteria { font-size: 8.6pt; line-height: 1.25; }
  table.results thead th { background: #b4c6e7; font-style: italic; text-align: center; vertical-align: middle; padding: 1.6mm 1.2mm; }
  table.results tr.reps th { font-style: normal; font-weight: 700; padding: .5mm .3mm; }
  table.results tbody td { border-top: 1px dotted #000; border-bottom: 1px dotted #000; }
  td.unit, th.unit { white-space: nowrap; overflow-wrap: normal; text-align: center; }
  .method { font-size: .9em; }
  .note { display: block; font-size: .85em; font-style: italic; margin-top: .3mm; }
  th.rep, td.rep { text-align: center; }
  table.results td.rep { font-weight: 700; font-variant-numeric: tabular-nums; overflow-wrap: normal; padding-left: .4mm; padding-right: .4mm; }
  table.results td.rep.word { font-size: .9em; overflow-wrap: anywhere; }
  table.results td.nd { font-weight: 500; }
  td.no, .no { color: #a5203a; font-weight: 700; }
  td.mid, .mid { color: #9a6700; font-weight: 700; }
  .ok { color: #1f5f2e; font-weight: 700; }
  .signatures { display: flex; justify-content: space-between; padding: 2mm 12mm 0; min-height: 22mm; page-break-inside: avoid; font-size: 9.6pt; }
  .signatures > div { min-width: 55mm; }
  .signatures > div:last-child { text-align: center; }
  .signatures .name { font-weight: 700; margin-top: .8mm; }
  .annex-title { text-align: center; font-size: 10pt; line-height: 1.45; margin: 1mm 0 4mm; }
  .count { margin: -1.5mm 0 2.5mm 2mm; }
  table.verdict thead th { background: #d9d9d9; text-align: center; vertical-align: middle; }
  table.verdict td.center { text-align: center; }
  table.verdict td.x { text-align: center; vertical-align: middle; font-size: 12pt; font-weight: 800; }
  table.criteria thead th { text-align: center; vertical-align: middle; }
  /* The template's widths: 40 | 22.5 | 13.5 | 12 | 12. */
  .a-param { width: 40%; } .a-method { width: 22.5%; } .a-unit { width: 13.5%; } .a-m { width: 12%; }
  th.crit, td.crit { text-align: center; white-space: nowrap; overflow-wrap: normal; }
  .plan { display: block; font-size: .82em; font-weight: 400; margin-top: .2mm; white-space: nowrap; }
  .conclusion { border: 1px solid #000; border-left: 3.5px solid #000; padding: 1.6mm 3mm; font-size: 9pt; page-break-inside: avoid; }
  .conclusion .alert { color: #a5203a; font-weight: 700; }

  /* Steps down as the tables grow — page 1 and the annex hold on one page each. */
  body.compact table.results, body.compact table.criteria { font-size: 7.8pt; line-height: 1.2; }
  body.compact table.results td, body.compact table.criteria td { padding: .5mm 1.1mm; }
  body.compact .signatures { min-height: 16mm; }
  body.dense .title { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 1mm 3mm; margin-bottom: 1.6mm; }
  body.dense h1 { font-size: 9.6pt; }
  body.dense .marks { margin-top: 0; gap: 1mm 2mm; }
  body.dense .mark { font-size: 6.8pt; padding: .2mm 2mm; }
  body.dense .amended { padding: .5mm 2.5mm; margin-bottom: 1.6mm; font-size: 6.9pt; line-height: 1.2; }
  body.dense .idrow { margin-bottom: 1.6mm; }
  body.dense .serial { font-size: 8.4pt; }
  body.dense .client { padding: 1.4mm 2.5mm .8mm; border-width: 3px; }
  body.dense .client-label { font-size: 7pt; }
  body.dense .client-name { font-size: 9pt; }
  body.dense .client-line { font-size: 7pt; line-height: 1.15; }
  body.dense .frame { margin-bottom: 1.6mm; }
  body.dense .info, body.dense .sampling, body.dense table.verdict, body.dense .count { font-size: 7.2pt; line-height: 1.18; }
  body.dense .info td, body.dense .info th, body.dense .sampling td, body.dense .sampling th,
  body.dense table.verdict td, body.dense table.verdict th { padding: .3mm 1.4mm; }
  body.dense table.verdict td.x { font-size: 9pt; }
  body.dense .count { margin: -.8mm 0 1.4mm 2mm; }
  body.dense table.results, body.dense table.criteria { font-size: 6.4pt; line-height: 1.1; }
  body.dense table.results td, body.dense table.criteria td { padding: .3mm .8mm; }
  body.dense table.results thead th, body.dense table.criteria thead th { padding: .5mm .8mm; }
  body.dense table.results td.rep { padding-left: .2mm; padding-right: .2mm; }
  /* Smaller, so that it holds on one line up to nine columns; it wraps, never overflows, beyond. */
  body.dense table.results td.nd { font-size: .84em; }
  body.dense .plan { display: inline; margin-left: 1mm; font-size: .9em; }
  body.dense .method { font-size: .84em; }
  body.dense .signatures { min-height: 10mm; padding-top: 1.2mm; font-size: 8.2pt; }
  body.dense .annex-title { margin-bottom: 1.6mm; font-size: 8.8pt; line-height: 1.3; }
  body.dense .conclusion { padding: .8mm 2.5mm; font-size: 7.8pt; }
  body.xdense table.results, body.xdense table.criteria { font-size: 5.9pt; line-height: 1.05; }
  body.xdense table.results td, body.xdense table.criteria td { padding: .15mm .7mm; }
  body.xdense table.results tr.reps th { padding: .2mm .2mm; }
  body.xdense .info, body.xdense .sampling, body.xdense table.verdict, body.xdense .count { font-size: 6.5pt; line-height: 1.12; }
  body.xdense .title { margin-bottom: 1mm; }
  body.xdense .amended { font-size: 6.1pt; line-height: 1.14; padding: .3mm 2mm; margin-bottom: 1.2mm; }
  body.xdense .idrow { margin-bottom: 1.2mm; }
  body.xdense .client-line { font-size: 6.6pt; }
  body.xdense .info td, body.xdense .info th, body.xdense .sampling td, body.xdense .sampling th { padding: .2mm 1.4mm; }
  /* The heaviest page: each signature on one line, the name after its title. */
  body.xdense .frame { margin-bottom: 1.2mm; }
  body.xdense .signatures { min-height: 0; padding-top: 0; font-size: 7.4pt; line-height: 1.2; }
  body.xdense .signatures > div > div { display: inline; }
  body.xdense .signatures .name { margin-left: 2mm; }
</style>
</head>
<body class="${density}">
<section class="sheet report">
  <div class="title">
    <h1>RAPPORT D'ANALYSES <b>${escapeHtml(data.number)}</b>${corrected}</h1>
    ${marksHtml(marks)}
  </div>
  ${amendmentHtml(data)}
  ${identityRow(data, { withNumber: false })}
  ${infoTable(data)}
  ${bands.join("\n  ")}
  <div class="signatures">
    <div><div>Responsable Technique</div><div class="name">${show(data.validatorName)}</div></div>
    <div><div>Direction</div><div class="name">${show(data.approverName)}</div></div>
  </div>
</section>
<section class="sheet annex">
  <div class="annex-title">${ANNEX_HEADING}</div>
  ${identityRow(data, { withNumber: true })}
  ${annexSamplingTable(data)}
  <p class="count">(Nombre d'analyse/échantillon = ${repetitions})</p>
  ${interpretationTable(data)}
  <div class="conclusion"><b>Conclusion :</b> <span${alert ? ' class="alert"' : ""}>${escapeHtml(data.conclusion)}</span></div>
</section>
</body>
</html>`;
}

/**
 * Chromium's footer template, on every page: the marks of this print, the
 * template's legend and « N.B » block, then the legal footer built from
 * /admin/entreprise (`reportLegalFooter` — an empty field is left out). A
 * template inherits nothing from the page: inline styles only.
 */
export function reportFooterTemplate(company: CompanyInfo = COMPANY, marks: ReportMarks = {}): string {
  const legal = reportLegalFooter(company);
  const side = REPORT_PDF_MARGIN.left;
  const nb = REPORT_NB.map((line) => {
    if (line.lead) return `<b>${escapeHtml(line.lead)}</b>${escapeHtml(line.text)}`;
    if (line.bold) return `<b>${escapeHtml(line.text)}</b>`;
    if (line.boldFrom) {
      const head = escapeHtml(line.text.slice(0, line.boldFrom));
      // « (IC) » keeps the template's superscript inside the bold run.
      const tail = escapeHtml(line.text.slice(line.boldFrom)).replace("(IC)", '<sup style="font-size:.7em;vertical-align:super;line-height:0;">(IC)</sup>');
      return `${head}<b>${tail}</b>`;
    }
    return escapeHtml(line.text);
  }).join("<br>");
  const markLine = marksOf(marks)
    .map(
      (mark) =>
        `<span style="border:1px solid ${MARK_INK[mark.kind]};color:${MARK_INK[mark.kind]};padding:0 1.5mm;margin:0 1mm;">${escapeHtml(mark.text)}</span>`
    )
    .join("");

  // No bottom padding: Chromium already sets the footer ≈ 5 mm above the
  // page's edge. The heights here are what `REPORT_PDF_MARGIN` reserves.
  return `<div style="width:100%;box-sizing:border-box;padding:0 ${side};font-family:Arial,'Liberation Sans',Helvetica,sans-serif;font-size:6pt;line-height:1.25;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact;">
${markLine ? `<div style="text-align:center;font-weight:700;letter-spacing:.3px;margin-bottom:1.2mm;">${markLine}</div>` : ""}<div>${REPORT_LEGEND.map(escapeHtml).join("<br>")}</div>
<div style="margin-top:1.4mm;">${nb}</div>
<div style="margin-top:1.6mm;text-align:center;line-height:1.3;">
${legal.name ? `<div style="font-weight:700;font-size:6.8pt;letter-spacing:.6px;text-transform:uppercase;">${escapeHtml(legal.name)}</div>` : ""}${
    legal.address ? `<div>${escapeHtml(legal.address)}</div>` : ""
  }${legal.contact.length > 0 ? `<div>${legal.contact.map(escapeHtml).join("&nbsp;&nbsp; ")}</div>` : ""}${
    legal.legal.length > 0 ? `<div>${legal.legal.map(escapeHtml).join(escapeHtml(LEGAL_SEPARATOR))}</div>` : ""
  }
</div>
</div>`;
}

/** The cartouche of the report: the template's grid, title « Rapport d'essai », in its black ink. */
export function reportCartouche(reference: DocumentRef, logoDataUri: string | null): string {
  return cartoucheTemplate({ title: DOC_TYPE_LABELS.RAPPORT, reference, logoDataUri, ink: REPORT_CARTOUCHE_INK });
}

/** What one print of the report is made of. */
export type ReportPdfInput = {
  data: ReportData;
  company: CompanyInfo;
  reference: DocumentRef;
  logoDataUri: string | null;
  marks?: ReportMarks;
  /** The body's density; `reportDensity`'s guess when absent. */
  density?: ReportDensity;
};

/** Everything `renderPdf` needs for one report: the page, its cartouche and footer, the shared margins. */
export type ReportPdfOutput = { html: string; header: string; footer: string; margin: PageMargin };

export function reportPdfParts(input: ReportPdfInput): ReportPdfOutput {
  const marks = input.marks ?? {};
  return {
    html: buildReportHtml(input.data, marks, input.company, input.density ?? reportDensity(input.data, marks)),
    header: reportCartouche(input.reference, input.logoDataUri),
    footer: reportFooterTemplate(input.company, marks),
    margin: reportPdfMargin(marks, input.company),
  };
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

/* ------------------------------ frozen versions ----------------------------- */

/**
 * A `ReportData` as stored in `ReportVersion.data` (AMENDEMENT.md §1): plain
 * JSON, the dates as ISO strings. `reportDataFromJson` gives it back with
 * its dates, so a frozen version prints exactly as it was issued.
 */
export function reportDataToJson(data: ReportData): Record<string, unknown> {
  return JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
}

function reviveDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The template's dates of a frozen version, revived — only those it carries (older versions have none). */
const TEMPLATE_DATES = ["productionDate", "expiryDate", "analysisFrom", "analysisTo", "issuedAt"] as const;

/**
 * The version in force with the administrator's silent correction
 * (`/api/reports/[id]/admin-edit`, decision of 28/07) applied. That route
 * writes the report's conclusion only, never a frozen version — so the
 * conclusion standing on the report row is what the version in force prints
 * today. Returns the same object when there is nothing to apply, so a caller
 * can tell whether the frozen data is still what is printed (`!==`).
 */
export function withSilentCorrection(data: ReportData, conclusion: string | null | undefined): ReportData {
  if (typeof conclusion !== "string" || conclusion === data.conclusion) return data;
  return { ...data, conclusion };
}

/** The frozen data back as a `ReportData`; null when it is not one (a damaged row). */
export function reportDataFromJson(json: unknown): ReportData | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const raw = json as Record<string, unknown>;
  if (typeof raw.number !== "string" || !Array.isArray(raw.results)) return null;
  if (!raw.client || typeof raw.client !== "object") return null;
  const sampledAt = reviveDate(raw.sampledAt);
  if (!sampledAt) return null;
  let amendment: ReportAmendment | null = null;
  if (raw.amendment && typeof raw.amendment === "object") {
    const a = raw.amendment as Record<string, unknown>;
    const previousIssuedAt = reviveDate(a.previousIssuedAt);
    if (typeof a.previousNumber === "string" && previousIssuedAt) {
      amendment = {
        previousNumber: a.previousNumber,
        previousIssuedAt,
        note: typeof a.note === "string" ? a.note : null,
      };
    }
  }
  const templateDates: Partial<Record<(typeof TEMPLATE_DATES)[number], Date | null>> = {};
  for (const key of TEMPLATE_DATES) {
    if (key in raw) templateDates[key] = reviveDate(raw[key]);
  }
  return {
    ...(raw as unknown as ReportData),
    sampledAt,
    receivedAt: reviveDate(raw.receivedAt),
    validatedAt: reviveDate(raw.validatedAt),
    ...templateDates,
    amendment,
  };
}

/* ------------------------- contamination alerts again ----------------------- */

/** What a contamination alert says about one germ — and what makes it new. */
export type AlertReading = {
  parameter: string;
  value: string | null;
  unit: string | null;
  threshold: string | null;
  conform: boolean | null;
  interpretation: Interpretation | null;
};

/** The fingerprint of one result as an alert reports it. */
function readingKey(r: AlertReading): string {
  return JSON.stringify([
    (r.value ?? "").trim(),
    (r.unit ?? "").trim(),
    (r.threshold ?? "").trim(),
    r.conform,
    r.interpretation,
  ]);
}

/** One fingerprint per germ (a germ read twice keeps both readings). */
export function germFingerprints(readings: AlertReading[]): Map<string, string> {
  const byGerm = new Map<string, string[]>();
  for (const r of readings) byGerm.set(r.parameter, [...(byGerm.get(r.parameter) ?? []), readingKey(r)]);
  return new Map([...byGerm].map(([germ, keys]) => [germ, keys.sort().join("|")]));
}

/**
 * The germs an amended report must alert on again (AMENDEMENT.md — decided
 * with the amendment slice): only those whose result changed. A germ is NOT
 * alerted again when
 *  - an alert already left for exactly this result (`alerted`: the
 *    fingerprints recorded with each successful CONTAMINATION_ALERT_SENT), or
 *  - the version replaced carried exactly this result and the sample's
 *    alerts went out (`replaced`, passed only when `alertsSentAt` is set —
 *    this covers alerts recorded before fingerprints existed).
 * A new germ over its limit, another value, unit, criterion or verdict is a
 * new alert.
 */
export function germsToRealert(input: {
  current: AlertReading[];
  alerted: { germ: string; fingerprint: string }[];
  replaced: AlertReading[] | null;
}): string[] {
  const current = germFingerprints(input.current);
  const replaced = input.replaced ? germFingerprints(input.replaced) : new Map<string, string>();
  const sent = new Set(input.alerted.map((a) => JSON.stringify([a.germ, a.fingerprint])));
  return [...current]
    .filter(([germ, fingerprint]) => !sent.has(JSON.stringify([germ, fingerprint])) && replaced.get(germ) !== fingerprint)
    .map(([germ]) => germ);
}
