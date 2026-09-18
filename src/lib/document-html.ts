import type {
  Cadre,
  LineKind,
  NonConformityReason,
  PaymentMode,
  QuantityUnit,
  SamplerKind,
} from "@/generated/prisma/enums";
import { COMPANY, type CompanyInfo } from "./company";
import { companyBrandHtml } from "./brand-html";
import { escapeHtml, show, SUPERSCRIPT_CSS } from "./html-text";
import type { DocumentRef } from "./document-types";
import {
  CADRE_LABELS,
  NON_CONFORMITY_REASON_LABELS,
  QUANTITY_UNIT_LABELS,
  SAMPLER_KIND_LABELS,
  formatCurrency,
  formatDayShort,
  formatDayTime,
  formatDecimal,
} from "./labels";
import { DEFAULT_THRESHOLDS, type ReceptionThresholds } from "./reception-rules";

/**
 * The two entry documents of the circuit, laid out like the paper forms
 * the laboratory fills today — same columns, same signature boxes, same
 * quality cartouche (Réf / version / dates, page numbers in the footer):
 *
 * - the **protocole de prélèvement** of a visit (PG04/EN01), printed for
 *   the interlocutor's signature;
 * - the **bon de réception** of a deposit (PG05/EN04), with the seven
 *   acceptance rules and the advance box.
 */

export type DocumentLine = {
  /** A line cancelled after the fact still prints, marked — the paper keeps the trail. */
  cancelled?: boolean;
  lineNumber: number;
  lineKind: LineKind;
  designation: string;
  /** « 100 cm² », « MAIN » — the paper's « Surface prélevée » column. */
  surface: string | null;
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
  family: "MICRO" | "CHIMIE" | "AUTRE";
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
  interlocutor: string | null;
  samplerKind: SamplerKind;
  samplerName: string | null;
  /** « Fonction » next to « effectué par » — the account's role on a Qualilab visit. */
  samplerFunction: string | null;
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

function headerHtml(company: CompanyInfo, title: string, ref: DocumentRef) {
  return `<header>
  <div>
    ${companyBrandHtml(company)}
    <div class="tagline">${escapeHtml(company.tagline)}</div>
  </div>
  ${cartoucheHtml(ref, title)}
</header>`;
}

function analysesHtml(lines: DocumentLine[]) {
  const column = (family: DocumentLine["family"]) =>
    lines
      .filter((l) => l.family === family && l.parameters.length > 0)
      .map((l) => `<p><b>${l.lineNumber}.</b> ${l.parameters.map((p) => show(p)).join(", ")}</p>`)
      .join("") || `<p class="small">—</p>`;
  return `<div class="analyses">
    <div class="box"><h2>Analyses microbiologiques</h2>${column("MICRO")}</div>
    <div class="box"><h2>Analyses physico-chimiques</h2>${column("CHIMIE")}${
      lines.some((l) => l.family === "AUTRE") ? `<h2 style="margin-top:4px">Autres</h2>${column("AUTRE")}` : ""
    }</div>
  </div>`;
}

/** PG04/EN01 — the protocole de prélèvement of a visit. */
export function buildProtocolHtml(data: SerieDocumentData, company: CompanyInfo = COMPANY): string {
  const rows = data.lines
    .map(
      (l) => `
      <tr>
        <td class="num">${l.lineNumber}</td>
        <td>${show(l.designation)}${l.unitCount > 1 ? `<span class="small"> · n = ${l.unitCount}</span>` : ""}</td>
        <td>${show(l.surface)}</td>
        <td>${show(l.numeroLot)}</td>
        <td>${dlcText(l)}</td>
        <td>${quantityText(l.quantity, l.quantityUnit)}</td>
        <td>${show(l.lieu)}</td>
        <td>${l.productTemperature !== null ? `T°p ${temperatureText(l.productTemperature)}` : ""}${
          l.productTemperature !== null && l.ambientTemperature !== null ? "<br>" : ""
        }${l.ambientTemperature !== null ? `T°a ${temperatureText(l.ambientTemperature)}` : ""}</td>
        <td>${l.cancelled ? `<span class="nc">Ligne annulée</span>${l.remarks ? " · " : ""}` : ""}${show(l.remarks)}</td>
      </tr>`
    )
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
    <span class="small">N° de factures : <b>${show(data.clientReference)}</b></span></div>
  <div class="f"><span class="k">Site de prélèvement :</span> <b>${escapeHtml(data.clientName)}${data.siteName ? ` — ${escapeHtml(data.siteName)}` : ""}</b></div>
  <div class="f"><span class="k">Cadre :</span> <b>${escapeHtml(CADRE_LABELS[data.cadre])}</b></div>
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
  <tbody>${rows}${padRows(8 - data.lines.length, 9, data.lines.length + 1)}</tbody>
</table>

<h2 class="small" style="margin:0 0 4px;text-transform:uppercase;letter-spacing:.5px">Analyses à effectuer :
  <span class="tick"><span class="case${data.analysesMicro ? " checked" : ""}"></span>Analyses microbiologiques</span>
  <span class="tick"><span class="case${data.analysesChimie ? " checked" : ""}"></span>Analyses physico-chimiques</span></h2>
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
  const rows = data.lines
    .map(
      (l) => `
      <tr>
        <td class="num">${l.lineNumber}</td>
        <td>${show(l.designation)}${l.surface ? `<span class="small"> · ${escapeHtml(l.surface)}</span>` : ""}${
          l.unitCount > 1 ? `<span class="small"> · n = ${l.unitCount}</span>` : ""
        }${l.conformity === false ? `<br><span class="nc">Non conforme${l.conformityReason ? ` — ${escapeHtml(NON_CONFORMITY_REASON_LABELS[l.conformityReason])}` : ""}</span>` : ""}</td>
        <td>${show(l.numeroLot)}</td>
        <td>${dlcText(l)}</td>
        <td>${quantityText(l.quantity, l.quantityUnit)}</td>
        <td>${temperatureText(l.receptionTemperature)}</td>
        <td class="mono">${show(l.controlCode)}</td>
        <td>${l.parameters.map((p) => show(p)).join(", ")}</td>
      </tr>`
    )
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
    <span class="small">N° de factures : <b>${show(data.clientReference)}</b></span></div>
  <div class="f"><span class="k">Date et heure :</span> <b>${data.arrivedAt ? formatDayTime(data.arrivedAt) : formatDayTime(data.startedAt)}</b></div>
  <div class="f"><span class="k">Reçu par :</span> <b>${show(data.receivedByName)}</b></div>
  <div class="f"><span class="k">Déposé par :</span> <b>${escapeHtml(samplerText(data))}${data.interlocutor ? ` — ${escapeHtml(data.interlocutor)}` : ""}</b></div>
  <div class="f"><span class="k">Client :</span> <b>${escapeHtml(data.clientName)}</b></div>
  <div class="f"><span class="k">Adresse :</span> <b>${show(data.clientAddress)}</b></div>
  <div class="f"><span class="k">Téléphone :</span> <b>${show(data.clientPhone)}</b></div>
</div>

<table class="lines">
  <thead><tr>
    <th class="num">N°</th><th style="width:24%">Désignation produit</th><th>N° lot</th><th>DLC</th>
    <th>Quantité / poids</th><th>T° à l'arrivée</th><th>N° de contrôle</th><th style="width:24%">Analyses demandées</th>
  </tr></thead>
  <tbody>${rows}${padRows(5 - data.lines.length, 8, data.lines.length + 1)}</tbody>
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

/** The « Surface prélevée » column of the paper: the area or « MAIN ». */
export function surfaceText(line: {
  lineKind: LineKind;
  surfaceLabel?: string | null;
  surfaceAreaCm2: number | null;
}) {
  // Une ligne Surface porte déjà son libellé en désignation : la colonne
  // montre l'aire. Ailleurs, elle montre ce que le préleveur a écrit.
  if (line.lineKind === "SURFACE") return line.surfaceAreaCm2 ? `${line.surfaceAreaCm2} cm²` : "Surface";
  if (line.lineKind === "MAINS") return "MAIN";
  const label = line.surfaceLabel?.trim() || null;
  const area = line.surfaceAreaCm2 ? `${line.surfaceAreaCm2} cm²` : null;
  if (label && area) return `${label} · ${area}`;
  return label ?? area;
}

