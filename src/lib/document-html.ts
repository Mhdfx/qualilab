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
import { COMPANY, type CompanyInfo } from "./company";
import { companyBrandHtml } from "./brand-html";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";
import type { DocumentRef } from "./document-types";
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
  formatDayShort,
  formatDayTime,
  formatDecimal,
  withSurfaceState,
} from "./labels";
import { DEFAULT_THRESHOLDS, type ReceptionThresholds } from "./reception-rules";

/**
 * The two entry documents of the circuit, laid out like the paper forms
 * the laboratory fills today — same columns, same signature boxes, same
 * quality cartouche (Réf / version / dates, page numbers in the footer):
 *
 * - the **protocole de prélèvement** of a visit (PG04/EN01), printed for
 *   the interlocutor's signature — one row per échantillon number: the two
 *   samples of a line whose two families are ticked (« 1M » / « 1P »,
 *   RETOUR-LABO-06-10.md §5, V3) print as one row, their analyses in both
 *   columns under the same number;
 * - the **bon de réception** of a deposit (PG05/EN04), with the seven
 *   acceptance rules and the advance box — one row per sample, since each
 *   one carries its own N° de contrôle.
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
  reference: DocumentRef;
};

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  ESPECES: "Espèces",
  CHEQUE: "Chèque",
  VIREMENT: "Virement",
  CARTE: "Carte",
};

/** Footer template for Chromium: page numbers plus the reference. */
export function documentFooter(reference: DocumentRef, company: CompanyInfo) {
  return `<div style="width:100%;font-family:'Segoe UI',Arial,sans-serif;font-size:7pt;color:#7d929c;
    padding:0 14mm;display:flex;justify-content:space-between;align-items:center;">
    <span>${escapeHtml(company.name)} · ${escapeHtml(company.address)}, ${escapeHtml(company.city)} · ICE ${escapeHtml(company.ice)}</span>
    <span>${reference.reference ? `${escapeHtml(reference.reference)} · v. ${escapeHtml(reference.version)} · ` : ""}Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
  </div>`;
}

function cartoucheHtml(ref: DocumentRef, title: string) {
  const cell = (k: string, v: string) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  return `<div class="cartouche">
    <div class="kind">${escapeHtml(title)}</div>
    <table>
      ${cell("Réf.", show(ref.reference || null))}
      ${cell("Version", show(ref.version || null))}
      ${cell("Créé le", ref.createdOn ? formatDayShort(ref.createdOn) : "—")}
      ${cell("Mis à jour le", ref.updatedOn ? formatDayShort(ref.updatedOn) : "—")}
    </table>
  </div>`;
}

const BASE_CSS = `
  @page { size: A4; margin: 12mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  ${SUPERSCRIPT_CSS}
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1b2a33; font-size: 9.2pt; line-height: 1.4;
    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  header { display: flex; justify-content: space-between; align-items: flex-start;
    border-bottom: 2px solid #1f3a4d; padding-bottom: 8px; margin-bottom: 10px; }
  .brand { font-size: 16pt; font-weight: 700; color: #1f3a4d; }
  .brand span { color: #b8860b; }
  .brand-logo { height: 42px; max-width: 240px; object-fit: contain; display: block; }
  .tagline { font-size: 7.4pt; color: #55707d; margin-top: 2px; max-width: 250px; }
  .cartouche { text-align: right; }
  .cartouche .kind { font-size: 11pt; font-weight: 700; color: #1f3a4d; text-transform: uppercase;
    letter-spacing: .6px; margin-bottom: 4px; }
  .cartouche table { border-collapse: collapse; margin-left: auto; font-size: 7.4pt; }
  .cartouche th, .cartouche td { border: 1px solid #d9e3e8; padding: 1px 6px; }
  .cartouche th { text-align: left; color: #55707d; font-weight: 600; background: #f6f9fb; }
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
  .mono { font-family: Consolas, "DejaVu Sans Mono", monospace; font-weight: 600; }
  .small { font-size: 7.4pt; color: #55707d; }
  .analyses { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .box { border: 1px solid #d9e3e8; border-radius: 4px; padding: 6px 10px; min-height: 40px; }
  .box h2 { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px; color: #7d929c; margin: 0 0 4px; font-weight: 600; }
  .box p { margin: 0 0 2px; font-size: 8.4pt; }
  .rules { border: 1px solid #d9e3e8; border-left: 4px solid #b8860b; border-radius: 4px; padding: 6px 10px; margin-bottom: 10px; }
  .rules h2 { font-size: 7.4pt; text-transform: uppercase; letter-spacing: .5px; color: #7d929c; margin: 0 0 3px; font-weight: 600; }
  .rules ol { margin: 0; padding-left: 16px; font-size: 8pt; }
  .money { display: flex; gap: 10px; margin-bottom: 10px; }
  .money .box { flex: 1; }
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

function quantityText(quantity: number | null, unit: QuantityUnit | null) {
  if (quantity === null) return "";
  return `${formatDecimal(quantity, 2)}${unit ? ` ${QUANTITY_UNIT_LABELS[unit]}` : ""}`;
}

function temperatureText(value: number | null) {
  return value === null ? "" : `${formatDecimal(value)} °C`;
}

function dlcText(line: DocumentLine) {
  const p = line.productionDate ? formatDayShort(line.productionDate) : "";
  const e = line.expiryDate ? formatDayShort(line.expiryDate) : "";
  if (!p && !e) return "";
  return `P : ${p || "—"}<br>E : ${e || "—"}`;
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

function headerHtml(company: CompanyInfo, title: string, ref: DocumentRef) {
  return `<header>
  <div>
    ${companyBrandHtml(company)}
    <div class="tagline">${escapeHtml(company.tagline)}</div>
  </div>
  ${cartoucheHtml(ref, title)}
</header>`;
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
export function buildProtocolHtml(data: SerieDocumentData, company: CompanyInfo = COMPANY): string {
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
<style>${BASE_CSS}</style>
</head>
<body>
${headerHtml(company, "Protocole de prélèvement", data.reference)}

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

/** PG05/EN04 — the bon de réception of a deposit at the counter. */
export function buildBonHtml(
  data: SerieDocumentData,
  company: CompanyInfo = COMPANY,
  thresholds: ReceptionThresholds = DEFAULT_THRESHOLDS
): string {
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
      return `
      <tr>
        <td class="num">${escapeHtml(refOf(l))}</td>
        <td>${show(l.designation)}${details}${status}</td>
        <td>${show(l.numeroLot)}</td>
        <td>${dlcText(l)}</td>
        <td>${quantityText(l.quantity, l.quantityUnit)}</td>
        <td>${temperatureText(l.receptionTemperature)}</td>
        <td class="mono">${show(l.controlCode)}</td>
        <td><span class="small">${ANALYSIS_FAMILY_LABELS[l.family]}</span>${
          l.parameters.length > 0 ? `<br>${l.parameters.map((p) => show(p)).join(", ")}` : ""
        }</td>
      </tr>`;
    })
    .join("");

  const t = thresholds;
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Bon de réception — série ${escapeHtml(data.serialNumber)}</title>
<style>${BASE_CSS}</style>
</head>
<body>
${headerHtml(company, "Bon de réception", data.reference)}

<div class="head">
  <div class="serial"><span class="k">N° de série</span><span class="n">${escapeHtml(data.serialNumber)}</span>
    <span class="small">Référence client : <b>${show(data.clientReference)}</b></span></div>
  <div class="f"><span class="k">Date et heure :</span> <b>${data.arrivedAt ? formatDayTime(data.arrivedAt) : formatDayTime(data.startedAt)}</b></div>
  <div class="f"><span class="k">Reçu par :</span> <b>${show(data.receivedByName)}</b></div>
  <div class="f"><span class="k">Déposé par :</span> <b>${escapeHtml(samplerText(data))}${data.interlocutor ? ` — ${escapeHtml(data.interlocutor)}` : ""}</b></div>
  <div class="f"><span class="k">Client :</span> <b>${escapeHtml(data.clientName)}${data.siteName ? ` — ${escapeHtml(data.siteName)}` : ""}</b></div>
  <div class="f"><span class="k">Adresse :</span> <b>${show(data.clientAddress)}</b></div>
  <div class="f"><span class="k">Téléphone :</span> <b>${show(data.clientPhone)}</b></div>
  <div class="f"><span class="k">Cadre :</span> <b>${escapeHtml(formatCadre(data.cadre, data.cadreNote))}</b></div>
</div>

<table class="lines">
  <thead><tr>
    <th class="num">N°</th><th style="width:24%">Désignation produit</th><th>N° lot</th><th>DLC</th>
    <th>Quantité / poids</th><th>T° à l'arrivée</th><th>N° de contrôle</th><th style="width:24%">Analyses demandées</th>
  </tr></thead>
  <tbody>${rows}${padRows(5 - data.lines.length, 8, nextNumber(data.lines))}</tbody>
</table>

<div class="rules">
  <h2>Critères de recevabilité</h2>
  <ol>
    <li>Ne pas accepter des échantillons non exploitables lors de l'analyse (tête de poisson, os, etc.).</li>
    <li>Poids minimal ${formatDecimal(t.minFoodMicroG)} g pour les aliments (analyses microbiologiques).</li>
    <li>Poids minimal ${formatDecimal(t.minFoodChemG)} g pour les aliments (analyses physico-chimiques).</li>
    <li>Volume d'eau pour analyses microbiologiques : ${formatDecimal(t.minWaterMicroL)} L, et si Salmonella ${formatDecimal(t.minWaterSalmonellaL)} L.</li>
    <li>Volume d'eau pour analyses physico-chimiques : ${formatDecimal(t.minWaterChemL)} L.</li>
    <li>La température à l'arrivée doit être précisée.</li>
    <li>Échantillons destinés au dosage de l'histamine : ${t.histamineUnits} échantillons de ${formatDecimal(t.histamineUnitG)} g.</li>
  </ol>
</div>

<div class="money">
  <div class="box"><h2>Avance</h2><p>${
    data.advanceAmount !== null
      ? `<b>${formatCurrency(data.advanceAmount)}</b>${data.advanceMode ? ` — ${PAYMENT_MODE_LABELS[data.advanceMode]}` : ""}`
      : "……………………"
  }</p></div>
  <div class="box"><h2>Reste</h2><p>……………………</p></div>
</div>
${data.notes ? `<p class="notes">${escapeHtml(data.notes)}</p>` : ""}

<div class="signatures">
  <div class="sig"><div class="role">Signature du client</div></div>
  <div class="sig"><div class="role">Signature de l'agent Qualilab</div><p class="small">${show(data.receivedByName)}</p></div>
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

