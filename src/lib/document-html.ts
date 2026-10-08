import type {
  AirMethod,
  Cadre,
  Family,
  LineKind,
  NonConformityReason,
  PaymentMode,
  QuantityUnit,
  SamplerKind,
  SurfaceState,
} from "@/generated/prisma/enums";
import type { CompanyInfo } from "./company";
import { CARTOUCHE_INK, cartoucheMargin, pageCss } from "./cartouche-html";
import { formatDateOnly } from "./date-only";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";
import { PAYMENT_MODE_LABELS } from "./invoice-lifecycle";
import { toLabWallTime } from "./lab-time";
import {
  AIR_METHOD_LABELS,
  ANALYSIS_FAMILY_LABELS,
  LINE_KIND_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  QUANTITY_UNIT_LABELS,
  SAMPLER_KIND_LABELS,
  SURFACE_STATE_LABELS,
  formatCadre,
  formatCurrency,
  formatDayTime,
  formatDecimal,
  withSurfaceState,
} from "./labels";
import { DEFAULT_THRESHOLDS, RECEPTION_RULES, receptionRuleLine, type ReceptionThresholds } from "./reception-rules";

/**
 * The two entry documents of the circuit, laid out like the paper forms
 * the laboratory fills today — same columns, same signature boxes. Their
 * quality cartouche (logo, title, « Réf : », « Version », « Page n sur N »,
 * dates) is not in the body: it is Chromium's header template
 * (cartouche-html.ts), repeated on every page, so the route prints these
 * pages with `PROTOCOL_MARGIN` / `BON_MARGIN`, which their `@page` declares.
 *
 * - the **protocole de prélèvement** of a visit (PG04/EN01), printed for
 *   the interlocutor's signature — one row per échantillon number: the two
 *   samples of a line whose two families are ticked (« 1M » / « 1P »,
 *   RETOUR-LABO-06-10.md §5, V3) print as one row, their analyses in both
 *   columns under the same number;
 * - the **bon de réception** of a deposit (PG05/EN04 version G, scan of
 *   08/10 — RETOUR-LABO-06-10.md §10), drawn in the paper's navy ink: one
 *   row per sample, since each one carries its own N° de contrôle, then the
 *   paper's seven notes (1) … (7), « Avance », « Reste » and signatures.
 */

export type DocumentLine = {
  /** A sample cancelled after the fact still prints, marked — the paper keeps the trail. */
  cancelled?: boolean;
  /** Non-conform at reception and destroyed (slice E): said as such. */
  destroyed?: boolean;
  lineNumber: number;
  /** « 2 », or « 2M » / « 2P » for the two samples of a two-family line;
   *  the bare number when absent. */
  ref?: string;
  lineKind: LineKind;
  designation: string;
  /** « 100 cm² », « MAIN », « Boîte exposée 30 min » — the paper's « Surface prélevée » column. */
  surface: string | null;
  /** « État de la surface » of a SURFACE sample, printed in « Remarques »
   *  like « Lavée » for hands; null on a sample entered before it existed. */
  surfaceState?: SurfaceState | null;
  numeroLot: string | null;
  /** Calendar dates (`@db.Date`), printed from their UTC day. */
  productionDate: Date | null;
  expiryDate: Date | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  lieu: string;
  productTemperature: number | null;
  ambientTemperature: number | null;
  receptionTemperature: number | null;
  remarks: string | null;
  unitCount: number;
  /** The family of the sample's nature: the analyses column it is listed in. */
  family: Family;
  parameters: string[];
  controlCode: string | null;
  conformity: boolean | null;
  conformityReason: NonConformityReason | null;
};

export type SerieDocumentData = {
  serialNumber: string;
  clientReference: string | null;
  clientName: string;
  clientAddress: string | null;
  clientPhone: string | null;
  siteName: string | null;
  cadre: Cadre;
  /** The precision of « Autre » — printed « Cadre : Autre — texte ». */
  cadreNote: string | null;
  interlocutor: string | null;
  samplerKind: SamplerKind;
  samplerName: string | null;
  /** « Fonction » next to « effectué par » — the account's role on a Qualilab visit. */
  samplerFunction: string | null;
  /** The série's stored boxes. A box is also ticked when one of its samples
   *  is of that family: the boxes are a summary of the samples (V3), and an
   *  older série keeps whatever was ticked by hand. */
  analysesMicro: boolean;
  analysesChimie: boolean;
  receivedByName: string | null;
  startedAt: Date;
  endedAt: Date | null;
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  advanceAmount: number | null;
  advanceMode: PaymentMode | null;
  notes: string | null;
  lines: DocumentLine[];
};

/** One list of payment-mode labels for the whole app: invoice-lifecycle.ts owns it. */
export { PAYMENT_MODE_LABELS };

/** The protocol keeps a footer line (the laboratory's coordinates, as on the paper). */
export const PROTOCOL_MARGIN = cartoucheMargin({ footer: true });
/** The paper bon has no footer. */
export const BON_MARGIN = cartoucheMargin();

/**
 * Footer template for Chromium: the laboratory's coordinates, as at the foot
 * of the paper protocol. The Réf, the version and « Page n sur N » are in
 * the cartouche.
 */
export function documentFooter(company: CompanyInfo) {
  return `<div style="width:100%;box-sizing:border-box;padding:0 ${PROTOCOL_MARGIN.left};font-family:'Segoe UI',Arial,'Liberation Sans',sans-serif;font-size:7pt;color:#7d929c;text-align:center;">
    ${escapeHtml(company.name)} · ${escapeHtml(company.address)}, ${escapeHtml(company.city)} · ICE ${escapeHtml(company.ice)}
  </div>`;
}

const PROTOCOL_CSS = `
  ${pageCss(PROTOCOL_MARGIN)}
  * { box-sizing: border-box; }
  /* 1px inside the page box: a border drawn on its very edge is clipped. */
  html, body { margin: 0; padding: 0 1px; }
  ${SUPERSCRIPT_CSS}
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33; font-size: 9.2pt; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px 12px; margin-bottom: 10px;
    border: 1px solid #d9e3e8; border-radius: 4px; padding: 8px 10px; }
  .head .f { font-size: 8.6pt; }
  .head .f b { color: #1f3a4d; }
  .head .k { color: #55707d; }
  .serial { grid-column: 1 / -1; display: flex; align-items: baseline; gap: 10px; }
  .serial .n { font-family: Consolas, "DejaVu Sans Mono", monospace; font-size: 15pt; font-weight: 700; color: #1f3a4d; }
  table.lines { width: 100%; border-collapse: collapse; font-size: 8.2pt; margin-bottom: 10px; }
  table.lines th { background: #1f3a4d; color: #fff; text-align: left; padding: 4px 5px; font-size: 7.4pt;
    text-transform: uppercase; letter-spacing: .3px; }
  table.lines td { border: 1px solid #d9e3e8; padding: 4px 5px; vertical-align: top; height: 26px; }
  table.lines tr { page-break-inside: avoid; }
  table.lines .num { width: 18px; text-align: center; color: #7d929c; }
  .small { font-size: 7.4pt; color: #55707d; }
  .analyses { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .box { border: 1px solid #d9e3e8; border-radius: 4px; padding: 6px 10px; min-height: 40px; }
  .box h2 { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px; color: #7d929c; margin: 0 0 4px; font-weight: 600; }
  .box p { margin: 0 0 2px; font-size: 8.4pt; }
  .signatures { display: flex; gap: 10px; page-break-inside: avoid; }
  .sig { flex: 1; border: 1px solid #d9e3e8; border-radius: 4px; padding: 6px 10px; min-height: 70px; }
  .sig .role { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px; color: #7d929c; font-weight: 600; }
  .notes { font-size: 8.4pt; color: #55707d; margin-bottom: 8px; }
  .nc { color: #a5203a; font-weight: 600; }
  .tick { margin-left: 10px; font-size: 8.6pt; text-transform: none; letter-spacing: 0; color: #1b2a33; font-weight: 600; }
  /* Checkboxes drawn in CSS, not glyphs: every PDF renderer shows them the
     same. Named « case » and not « box »: « .box » is the information panel
     above, and one class for two shapes collapsed those panels. */
  .case { position: relative; display: inline-block; width: 10px; height: 10px; margin-right: 4px;
    vertical-align: -1px; border: 1.2px solid #1f3a4d; border-radius: 1px; background: #fff; }
  .case.checked { background: #1f3a4d; }
  .case.checked::after { content: ""; position: absolute; left: 2.6px; top: 0; width: 3px; height: 6px;
    border: solid #fff; border-width: 0 1.6px 1.6px 0; transform: rotate(45deg); }
`;

/**
 * The bon as the paper draws it: labels, rules and borders in the form's
 * navy ink, what was recorded in dark ink on the dotted lines — the form
 * and its filling, as when it is written by hand.
 */
const BON_CSS = `
  ${pageCss(BON_MARGIN)}
  * { box-sizing: border-box; }
  /* 1px inside the page box: a border drawn on its very edge is clipped. */
  html, body { margin: 0; padding: 0 1px; }
  ${SUPERSCRIPT_CSS}
  body { font-family: Arial, "Liberation Sans", "Segoe UI", sans-serif; color: #1b2a33; font-size: 9.4pt;
    line-height: 1.35; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .k { color: ${CARTOUCHE_INK}; font-weight: 700; white-space: nowrap; }
  .field { display: flex; align-items: baseline; gap: 1.5mm; margin-bottom: 3mm; }
  .field .v { flex: 1; min-height: 1.35em; border-bottom: 1px dotted ${CARTOUCHE_INK}; padding: 0 1mm; font-weight: 600; }
  .head { display: grid; grid-template-columns: 38% 1fr; gap: 0 8mm; align-items: start; margin-bottom: 5mm; }
  .head .left { padding-top: 5mm; }
  .client { border: 1.2px solid ${CARTOUCHE_INK}; padding: 3mm 4mm 0.5mm; }
  .client .serial { justify-content: center; }
  .client .serial .v { flex: 0 1 45%; font-family: Consolas, "DejaVu Sans Mono", monospace; font-size: 11pt; font-weight: 700; }
  table.lines { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 3mm; }
  table.lines th { border: 1.2px solid ${CARTOUCHE_INK}; color: ${CARTOUCHE_INK}; font-weight: 700; font-size: 9pt;
    line-height: 1.15; text-align: center; vertical-align: middle; padding: 2mm 1.2mm; }
  table.lines td { border: 1.2px solid ${CARTOUCHE_INK}; padding: 1.2mm 1.5mm; vertical-align: top; font-size: 8.4pt; }
  table.lines tr { page-break-inside: avoid; }
  .pe { display: flex; flex-direction: column; justify-content: space-between; min-height: 12mm; }
  .mono { font-family: Consolas, "DejaVu Sans Mono", monospace; font-weight: 600; }
  .small { font-size: 7.4pt; color: #55707d; }
  .nc { color: #a5203a; font-weight: 600; }
  /* The seven notes stay together, as on the paper: a long bon moves them whole to the next page. */
  .rules { list-style: none; margin: 0 0 4mm; padding: 0 0 0 2mm; color: ${CARTOUCHE_INK}; font-size: 8.4pt; font-weight: 600;
    page-break-inside: avoid; break-inside: avoid; }
  .rules li { padding-left: 6.5mm; text-indent: -6.5mm; margin-bottom: 0.4mm; }
  .money { width: 62%; margin-bottom: 2mm; }
  .notes { font-size: 8.4pt; color: #55707d; margin: 0 0 3mm; }
  .signatures { display: flex; gap: 8mm; margin-top: 5mm; page-break-inside: avoid; }
  .sig { flex: 1; position: relative; border: 1.2px solid ${CARTOUCHE_INK}; height: 30mm; padding: 6mm 4mm 2mm; }
  .sig .role { position: absolute; top: -0.75em; left: 5mm; background: #fff; padding: 0 1.5mm;
    color: ${CARTOUCHE_INK}; font-weight: 700; font-size: 11pt; line-height: 1.3; }
`;

function quantityText(quantity: number | null, unit: QuantityUnit | null) {
  if (quantity === null) return "";
  return `${formatDecimal(quantity, 2)}${unit ? ` ${QUANTITY_UNIT_LABELS[unit]}` : ""}`;
}

function temperatureText(value: number | null) {
  return value === null ? "" : `${formatDecimal(value)} °C`;
}

/** A DLC date, « JJ/MM/AAAA » from its calendar day. */
function dayText(date: Date | null) {
  return date ? formatDateOnly(date) : "";
}

function dlcText(line: DocumentLine) {
  const p = dayText(line.productionDate);
  const e = dayText(line.expiryDate);
  if (!p && !e) return "";
  return `P : ${p || "—"}<br>E : ${e || "—"}`;
}

/** Recorded text on a line of the bon, or nothing: the line stays free to fill by hand. */
function filled(value: string | null | undefined) {
  return value ? show(value) : "";
}

function samplerText(data: SerieDocumentData) {
  if (data.samplerKind === "QUALILAB") return data.samplerName ?? "Qualilab";
  if (data.samplerKind === "CLIENT") return "Le client";
  return `${SAMPLER_KIND_LABELS[data.samplerKind]}${data.samplerName ? ` — ${data.samplerName}` : ""}`;
}

/** Empty rows pad the table to the paper's eight lines so it can be completed by hand. */
function padRows(count: number, columns: number, from: number) {
  return Array.from(
    { length: Math.max(0, count) },
    (_, i) => `<tr><td class="num">${from + i}</td>${"<td></td>".repeat(columns - 1)}</tr>`
  ).join("");
}

/** The number the first blank row takes: the one after the last échantillon. */
function nextNumber(lines: DocumentLine[]) {
  return lines.reduce((max, l) => Math.max(max, l.lineNumber), 0) + 1;
}

/** « 2 », « 2M » or « 2P ». */
function refOf(line: DocumentLine) {
  return line.ref ?? String(line.lineNumber);
}

/**
 * The protocol's rows: one per échantillon number, in order. The two
 * samples of a line whose two families are ticked share their number and
 * print as one row (RETOUR-LABO-06-10.md §5, V3).
 */
export function protocolRows(lines: DocumentLine[]): DocumentLine[][] {
  const byNumber = new Map<number, DocumentLine[]>();
  for (const line of lines) byNumber.set(line.lineNumber, [...(byNumber.get(line.lineNumber) ?? []), line]);
  return [...byNumber.entries()].sort(([a], [b]) => a - b).map(([, samples]) => samples);
}

/**
 * One cell of a merged row: the value the samples share, once. When they
 * differ — a correction made on one of the two, one destroyed at
 * reception — each value is printed after its reference, never hidden.
 */
function mergedCell(samples: DocumentLine[], render: (line: DocumentLine) => string) {
  const values = samples.map(render);
  if (values.every((value) => value === values[0])) return values[0];
  return samples.map((s, i) => `<span class="small">${escapeHtml(refOf(s))} :</span> ${values[i]}`).join("<br>");
}

function temperaturesHtml(line: DocumentLine) {
  const product = line.productTemperature !== null ? `T°p ${temperatureText(line.productTemperature)}` : "";
  const ambient = line.ambientTemperature !== null ? `T°a ${temperatureText(line.ambientTemperature)}` : "";
  return [product, ambient].filter(Boolean).join("<br>");
}

/** The state of a surface as the paper writes it in « Remarques » — « Nettoyé », like « Lavée » for hands. */
function surfaceStateText(line: DocumentLine) {
  return line.lineKind === "SURFACE" && line.surfaceState ? SURFACE_STATE_LABELS[line.surfaceState] : null;
}

function cancelledText(line: DocumentLine) {
  return line.destroyed ? "Détruit à réception" : "Échantillon annulé";
}

/** « Remarques / Compositions »: the cancellation, the state of a surface, then what was typed. */
function remarksHtml(line: DocumentLine) {
  const text = [surfaceStateText(line), line.remarks?.trim() || null].filter(Boolean).join(" · ");
  if (!line.cancelled) return show(text || null);
  return `<span class="nc">${cancelledText(line)}</span>${text ? ` · ${show(text)}` : ""}`;
}

/**
 * The two analyses columns: « N. analyses » per échantillon number, under
 * the family of the sample's nature — the two samples of a two-family line
 * land in both columns under the same number.
 */
function analysesHtml(lines: DocumentLine[]) {
  const column = (family: Family) => {
    const byNumber = new Map<number, string[]>();
    for (const line of lines) {
      if (line.family !== family || line.parameters.length === 0) continue;
      const names = byNumber.get(line.lineNumber) ?? [];
      for (const name of line.parameters) if (!names.includes(name)) names.push(name);
      byNumber.set(line.lineNumber, names);
    }
    return (
      [...byNumber.entries()]
        .sort(([a], [b]) => a - b)
        .map(([n, names]) => `<p><b>${n}.</b> ${names.map((name) => show(name)).join(", ")}</p>`)
        .join("") || `<p class="small">—</p>`
    );
  };
  return `<div class="analyses">
    <div class="box"><h2>${ANALYSIS_FAMILY_LABELS.MICRO}</h2>${column("MICRO")}</div>
    <div class="box"><h2>${ANALYSIS_FAMILY_LABELS.CHIMIE}</h2>${column("CHIMIE")}${
      lines.some((l) => l.family === "AUTRE")
        ? `<h2 style="margin-top:4px">${ANALYSIS_FAMILY_LABELS.AUTRE}</h2>${column("AUTRE")}`
        : ""
    }</div>
  </div>`;
}

/** « Analyses à effectuer »: the série's box, or any of its samples of that family. */
function familyTicked(data: SerieDocumentData, family: Family) {
  const stored = family === "MICRO" ? data.analysesMicro : family === "CHIMIE" ? data.analysesChimie : false;
  return stored || data.lines.some((l) => l.family === family);
}

/** PG04/EN01 — the protocole de prélèvement of a visit. */
export function buildProtocolHtml(data: SerieDocumentData): string {
  const groups = protocolRows(data.lines);
  const rows = groups
    .map((samples) => {
      const cell = (render: (line: DocumentLine) => string) => mergedCell(samples, render);
      return `
      <tr>
        <td class="num">${samples[0].lineNumber}</td>
        <td>${cell((l) => `${show(l.designation)}${l.unitCount > 1 ? `<span class="small"> · n = ${l.unitCount}</span>` : ""}`)}</td>
        <td>${cell((l) => show(l.surface))}</td>
        <td>${cell((l) => show(l.numeroLot))}</td>
        <td>${cell(dlcText)}</td>
        <td>${cell((l) => quantityText(l.quantity, l.quantityUnit))}</td>
        <td>${cell((l) => show(l.lieu))}</td>
        <td>${cell(temperaturesHtml)}</td>
        <td>${cell(remarksHtml)}</td>
      </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Protocole de prélèvement — série ${escapeHtml(data.serialNumber)}</title>
<style>${PROTOCOL_CSS}</style>
</head>
<body>
<div class="head">
  <div class="serial"><span class="k">N° de série</span><span class="n">${escapeHtml(data.serialNumber)}</span>
    <span class="small">Référence client : <b>${show(data.clientReference)}</b></span></div>
  <div class="f"><span class="k">Site de prélèvement :</span> <b>${escapeHtml(data.clientName)}${data.siteName ? ` — ${escapeHtml(data.siteName)}` : ""}</b></div>
  <div class="f"><span class="k">Cadre :</span> <b>${escapeHtml(formatCadre(data.cadre, data.cadreNote))}</b></div>
  <div class="f"><span class="k">Interlocuteur :</span> <b>${show(data.interlocutor)}</b></div>
  <div class="f"><span class="k">Prélevé le :</span> <b>${formatDayTime(data.startedAt)}</b>${
    data.endedAt ? ` <span class="small">— fin ${formatDayTime(data.endedAt)}</span>` : ""
  }</div>
  <div class="f"><span class="k">Prélèvement effectué par :</span> <b>${escapeHtml(samplerText(data))}</b>${
    data.samplerFunction ? ` <span class="small">— Fonction : ${escapeHtml(data.samplerFunction)}</span>` : ""
  }</div>
  <div class="f"><span class="k">Arrivé au laboratoire :</span> <b>${data.arrivedAt ? formatDayTime(data.arrivedAt) : "……/……/…… à ……h……"}</b></div>
  <div class="f"><span class="k">T° à l'arrivée :</span> <b>${data.coolerTemperature !== null ? temperatureText(data.coolerTemperature) : "…… °C"}</b></div>
</div>

<table class="lines">
  <thead><tr>
    <th class="num">N°</th><th style="width:22%">Désignation</th><th>Surface prélevée</th><th>N° du lot</th>
    <th>DLC</th><th>Quantité</th><th style="width:14%">Lieu / Section</th><th>Température</th><th style="width:15%">Remarques / Compositions</th>
  </tr></thead>
  <tbody>${rows}${padRows(8 - groups.length, 9, nextNumber(data.lines))}</tbody>
</table>

<h2 class="small" style="margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Analyses à effectuer :
  <span class="tick"><span class="case${familyTicked(data, "MICRO") ? " checked" : ""}"></span>${ANALYSIS_FAMILY_LABELS.MICRO}</span>
  <span class="tick"><span class="case${familyTicked(data, "CHIMIE") ? " checked" : ""}"></span>${ANALYSIS_FAMILY_LABELS.CHIMIE}</span></h2>
${analysesHtml(data.lines)}
${data.notes ? `<p class="notes">${escapeHtml(data.notes)}</p>` : ""}

<div class="signatures">
  <div class="sig"><div class="role">Signature Qualilab</div><p class="small">${escapeHtml(samplerText(data))}</p></div>
  <div class="sig"><div class="role">Signature et cachet de l'interlocuteur</div><p class="small">${show(data.interlocutor)}</p></div>
</div>
</body>
</html>`;
}

/** The paper bon's five lines, filled by hand beyond the samples recorded. */
const BON_ROWS = 5;

/** « Date : 05/10/2026 » and « Heure : 14h05 » — two lines on the paper, the laboratory's clock. */
function bonDayAndHour(at: Date) {
  const wall = toLabWallTime(at); // « 2026-10-05T14:05 »
  return {
    day: `${wall.slice(8, 10)}/${wall.slice(5, 7)}/${wall.slice(0, 4)}`,
    hour: `${wall.slice(11, 13)}h${wall.slice(14, 16)}`,
  };
}

/** « Label : value » on a dotted line, as the paper prints its fields. */
function bonField(label: string, value: string) {
  return `<div class="field"><span class="k">${label}</span><span class="v">${value}</span></div>`;
}

/** The DLC cell: « P : » and « E : » pre-printed on every line, filled when known. */
function bonDlcCell(line: DocumentLine | null) {
  const p = line ? dayText(line.productionDate) : "";
  const e = line ? dayText(line.expiryDate) : "";
  return `<td><div class="pe"><span><span class="k">P :</span> ${p}</span><span><span class="k">E :</span> ${e}</span></div></td>`;
}

/** PG05/EN04 — the bon de réception of a deposit at the counter. */
export function buildBonHtml(data: SerieDocumentData, thresholds: ReceptionThresholds = DEFAULT_THRESHOLDS): string {
  // One row per sample: the two samples of a two-family line (« 1M » /
  // « 1P ») each carry their own N° de contrôle and their own family.
  const rows = data.lines
    .map((l) => {
      const details = [l.surface, surfaceStateText(l), l.unitCount > 1 ? `n = ${l.unitCount}` : null]
        .filter((d): d is string => Boolean(d))
        .map((d) => `<span class="small"> · ${escapeHtml(d)}</span>`)
        .join("");
      const status =
        l.conformity === false
          ? `<br><span class="nc">Non conforme${l.conformityReason ? ` — ${escapeHtml(NON_CONFORMITY_REASON_LABELS[l.conformityReason])}` : ""}${l.destroyed ? " — détruit" : l.cancelled ? " — annulé" : ""}</span>`
          : l.cancelled
            ? `<br><span class="nc">${cancelledText(l)}</span>`
            : "";
      const code = l.controlCode ? `<span class="mono">${escapeHtml(l.controlCode)}</span><br>` : "";
      return `
      <tr>
        <td>${code}<span class="small">Éch. ${escapeHtml(refOf(l))}</span></td>
        <td>${show(l.designation)}${details}${status}</td>
        <td>${filled(l.numeroLot)}</td>
        ${bonDlcCell(l)}
        <td>${quantityText(l.quantity, l.quantityUnit)}</td>
        <td>${temperatureText(l.receptionTemperature)}</td>
        <td><span class="small">${ANALYSIS_FAMILY_LABELS[l.family]}</span>${
          l.parameters.length > 0 ? `<br>${l.parameters.map((p) => show(p)).join(", ")}` : ""
        }</td>
      </tr>`;
    })
    .join("");
  const blankRows = Array.from(
    { length: Math.max(0, BON_ROWS - data.lines.length) },
    () => `<tr><td></td><td></td><td></td>${bonDlcCell(null)}<td></td><td></td><td></td></tr>`
  ).join("");

  const { day, hour } = bonDayAndHour(data.arrivedAt ?? data.startedAt);
  const client = `${escapeHtml(data.clientName)}${data.siteName ? ` — ${escapeHtml(data.siteName)}` : ""}`;
  const depositedBy = `${escapeHtml(samplerText(data))}${data.interlocutor ? ` — ${escapeHtml(data.interlocutor)}` : ""}`;
  const advance =
    data.advanceAmount !== null
      ? `${formatCurrency(data.advanceAmount)}${data.advanceMode ? ` — ${PAYMENT_MODE_LABELS[data.advanceMode]}` : ""}`
      : "";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Bon de réception — série ${escapeHtml(data.serialNumber)}</title>
<style>${BON_CSS}</style>
</head>
<body>
<div class="head">
  <div class="left">
    ${bonField("Date :", day)}
    ${bonField("Heure :", hour)}
    ${bonField("Reçu par :", filled(data.receivedByName))}
    ${bonField("Référence client :", filled(data.clientReference))}
    ${bonField("Cadre :", escapeHtml(formatCadre(data.cadre, data.cadreNote)))}
    ${bonField("Déposé par :", depositedBy)}
  </div>
  <div class="client">
    <div class="field serial"><span class="k">N° de série :</span><span class="v">${escapeHtml(data.serialNumber)}</span></div>
    ${bonField("Nom du client :", client)}
    ${bonField("Adresse :", filled(data.clientAddress))}
    <div class="field"><span class="v"></span></div>
    ${bonField("N° de tél :", filled(data.clientPhone))}
    ${bonField("N° de fax :", "")}
  </div>
</div>

<table class="lines">
  <colgroup><col style="width:11%"><col style="width:21.5%"><col style="width:10%"><col style="width:13.5%"><col style="width:14%"><col style="width:10%"><col style="width:20%"></colgroup>
  <thead><tr>
    <th>N° de contrôle</th><th>Désignation produit</th><th>N° Lot</th><th>DLC</th>
    <th>Quantité/poids en (g)</th><th>T° à l'arrivée</th><th>Analyses demandées</th>
  </tr></thead>
  <tbody>${rows}${blankRows}</tbody>
</table>

<ul class="rules">
  ${RECEPTION_RULES.map((rule) => `<li>${escapeHtml(receptionRuleLine(rule, thresholds))}</li>`).join("\n  ")}
</ul>

<div class="money">
  ${bonField("Avance :", advance)}
  ${bonField("Reste :", "")}
</div>
${data.notes ? `<p class="notes">${escapeHtml(data.notes)}</p>` : ""}

<div class="signatures">
  <div class="sig"><div class="role">Signature de client :</div></div>
  <div class="sig"><div class="role">Signature de l'agent QUALILAB :</div><p class="small">${filled(data.receivedByName)}</p></div>
</div>
</body>
</html>`;
}

/**
 * The « Surface prélevée » column of the paper: the area of a surface,
 * « MAIN » for hands, the method of an air sample (RETOUR-LABO-06-10.md §5,
 * V4 — the column was empty for the air).
 */
export function surfaceText(line: {
  lineKind: LineKind;
  surfaceLabel?: string | null;
  surfaceAreaCm2: number | null;
  airMethod?: AirMethod | null;
}) {
  // Un échantillon Surface porte déjà sa désignation : la colonne montre
  // l'aire.
  if (line.lineKind === "SURFACE") return line.surfaceAreaCm2 ? `${line.surfaceAreaCm2} cm²` : "Surface";
  if (line.lineKind === "MAINS") return "MAIN";
  if (line.lineKind === "AIR" && line.airMethod) return AIR_METHOD_LABELS[line.airMethod];
  // Les échantillons saisis avant le 07/10 pouvaient porter une surface sur
  // n'importe quel type : ils s'impriment comme avant.
  const label = line.surfaceLabel?.trim() || null;
  const area = line.surfaceAreaCm2 ? `${line.surfaceAreaCm2} cm²` : null;
  if (label && area) return `${label} · ${area}`;
  return label ?? area;
}

/**
 * The designation of a sample as the documents that name ONE sample print
 * it — the rapport and its e-mail, the étiquette, the feuille de paillasse:
 * what was sampled, followed by the state of a surface (« Planche verte —
 * surface nettoyée ») or the method of an air sample (« Salle — Boîte
 * exposée 30 min »). A sample entered before either existed prints as
 * before; null when nothing was recorded.
 */
export function sampleDesignation(sample: {
  lineKind: LineKind;
  produit?: string | null;
  surfaceLabel?: string | null;
  personName?: string | null;
  surfaceState?: SurfaceState | null;
  airMethod?: AirMethod | null;
}): string | null {
  const first = (...values: (string | null | undefined)[]) => values.map((v) => v?.trim()).find(Boolean) ?? null;
  // The surface and the person are corrected on their own fields (« Corriger
  // la fiche »); `produit` keeps what they were at creation.
  if (sample.lineKind === "SURFACE") {
    const label = first(sample.surfaceLabel, sample.produit);
    return sample.surfaceState ? withSurfaceState(label ?? LINE_KIND_LABELS.SURFACE, sample.surfaceState) : label;
  }
  if (sample.lineKind === "MAINS") return first(sample.personName, sample.produit);
  if (sample.lineKind === "AIR" && sample.airMethod) {
    return `${first(sample.produit) ?? LINE_KIND_LABELS.AIR} — ${AIR_METHOD_LABELS[sample.airMethod]}`;
  }
  // An older row without a product name may still carry a surface or a
  // person typed on any kind of line.
  return first(sample.produit, sample.surfaceLabel, sample.personName);
}

/** The heading of that designation: « Produit » for food and water (and an
 *  older row of unknown kind), « Désignation » for a surface, hands, air… */
export function designationHeading(lineKind?: LineKind | null): "Produit" | "Désignation" {
  return !lineKind || lineKind === "ALIMENT" || lineKind === "EAU" ? "Produit" : "Désignation";
}

