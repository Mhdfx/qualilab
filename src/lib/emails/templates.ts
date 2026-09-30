import { COMPANY } from "@/lib/company";
import { formatDate } from "@/lib/labels";

/**
 * The two messages the laboratory sends.
 *
 * Written as plain HTML tables with inline styles, because mail clients ignore
 * stylesheets and modern layout. The alert reproduces the model the client sent
 * on 17/08 — same columns, same order, same signature block.
 */

const SIGNATURE = `
  <table cellpadding="0" cellspacing="0" style="margin-top:22px;border-top:1px solid #d9e3e8;padding-top:12px;font-family:Arial,sans-serif;font-size:12px;color:#55707d">
    <tr><td>
      <div style="font-weight:bold;color:#1b2a33">${COMPANY.name}</div>
      <div>Tél. ${COMPANY.phone}</div>
      <div>E-mail : <a href="mailto:${COMPANY.email}" style="color:#2e5266">${COMPANY.email}</a></div>
      <div>${COMPANY.address} · ${COMPANY.city}</div>
    </td></tr>
  </table>`;

function shell(body: string) {
  return `<!DOCTYPE html>
<html lang="fr"><body style="margin:0;padding:20px;background:#f5f8fa;font-family:Arial,sans-serif;color:#1b2a33">
  <table cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:6px;padding:24px">
    <tr><td>
      <div style="height:4px;background:linear-gradient(90deg,#1f3a4d 0%,#2e5266 55%,#b8860b 100%);border-radius:2px;margin-bottom:18px"></div>
      ${body}
      ${SIGNATURE}
    </td></tr>
  </table>
</body></html>`;
}

function escape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ---------------------------------- report --------------------------------- */

export type ReportEmailInput = {
  clientName: string;
  reportNumber: string;
  /** N° dossier: the série (visite or dépôt). */
  serialNumber: string;
  controlCode: string | null;
  sampledAt: Date;
  receivedAt: Date | null;
  /** The analysis requested (the nature of the line). */
  analyse: string;
  produit: string | null;
  numeroLot: string | null;
  lieu: string;
  /** « Satisfaisant », « Non conforme »… */
  conclusion: string;
  /** Bad news: the conclusion is printed in red. */
  alert: boolean;
  /** True when the conclusion is the indicative one (too few units). */
  indicative: boolean;
};

const TH = "border:1px solid #9aa9b3;padding:6px 8px;text-align:left;font-weight:bold;background:#eef0e2";
const TD = "border:1px solid #9aa9b3;padding:6px 8px";

/**
 * The report e-mail, with the summary table of the laboratory's model
 * (RETOUR-LABO-29-09.md, slice D): the client reads the conclusion without
 * opening the PDF.
 */
export function reportEmail(input: ReportEmailInput) {
  const subject = `Rapport d'analyse ${input.reportNumber} — ${COMPANY.name}`;
  const rows: [string, string][] = [
    ["N° dossier", input.serialNumber],
    ["N° de contrôle", input.controlCode ?? "—"],
    ["Date de prélèvement", formatDate(input.sampledAt)],
    ["Date de réception", input.receivedAt ? formatDate(input.receivedAt) : "—"],
    ["Analyse", input.analyse],
    ["Produit", input.produit ?? "—"],
    ["N° de lot", input.numeroLot ?? "—"],
    ["Lieu de prélèvement", input.lieu],
  ];

  const html = shell(`
    <p style="font-size:15px;margin:0 0 14px">Bonjour,</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
      Veuillez trouver ci-joint le rapport d'analyse <b>${escape(input.reportNumber)}</b>.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin:0 0 14px">
      <tbody>
        ${rows.map(([k, v]) => `<tr><td style="${TH}">${k}</td><td style="${TD}">${escape(v)}</td></tr>`).join("")}
        <tr>
          <td style="${TH}">Conclusion</td>
          <td style="${TD};font-weight:bold;color:${input.alert ? "#a5203a" : "#22562e"}">${escape(input.conclusion)}${input.indicative ? " (indicative)" : ""}</td>
        </tr>
      </tbody>
    </table>
    ${
      input.indicative
        ? `<p style="font-size:13px;line-height:1.6;margin:0 0 14px;padding:10px 12px;background:#f1f6fb;border-left:3px solid #2e5266;color:#1f3a4d">
             Le nombre d'unités prélevées est inférieur au plan d'échantillonnage : le rapport ne porte pas
             d'interprétation officielle. La conclusion ci-dessus est donnée à titre indicatif.
           </p>`
        : ""
    }
    <p style="font-size:14px;line-height:1.6;margin:0">
      Nous restons à votre disposition pour tout complément d'information.
    </p>
    <p style="font-size:14px;margin:14px 0 0">Sincères salutations,</p>`);

  return { subject, html };
}

/* ---------------------------------- alert ---------------------------------- */

export type AlertRow = {
  produit: string | null;
  site: string;
  receivedAt: Date | null;
  numeroLot: string | null;
  germe: string;
  /** The value, without its unit. */
  resultat: string;
  limite: string;
  unit: string | null;
};

/**
 * Contamination alert — one message per client and per germ, listing every
 * product concerned, as in the model received on 17/08.
 */
export function alertEmail(germe: string, rows: AlertRow[]) {
  const subject = `Alerte de contamination par ${germe}`;
  // The unit goes into the column headers, as in the laboratory's example —
  // unless the rows disagree, then each cell keeps its own.
  const units = new Set(rows.map((row) => row.unit ?? ""));
  const shared = units.size === 1 ? [...units][0] : null;
  const withUnit = (value: string, unit: string | null) =>
    shared === null && unit ? `${value} ${unit}` : value;
  const header = (label: string) => (shared ? `${label} (${escape(shared)})` : label);

  const cells = rows
    .map(
      (row) => `
      <tr>
        <td style="border:1px solid #9aa9b3;padding:6px 8px;font-weight:bold">${escape(row.produit ?? "—")}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.site)}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${row.receivedAt ? formatDate(row.receivedAt) : "—"}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.numeroLot ?? "-")}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.germe)}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px;font-weight:bold">${escape(withUnit(row.resultat, row.unit))}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(withUnit(row.limite, row.unit))}</td>
      </tr>`
    )
    .join("");

  const html = shell(`
    <p style="font-size:15px;margin:0 0 14px">Bonjour,</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
      Ci-dessous le produit contaminé :
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;background:#fbfbf0">
      <thead>
        <tr style="background:#eef0e2">
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">Produit</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">Site de prélèvement</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">Date de réception</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">N° de lot</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">Le germe</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">${header("Résultat")}</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">${header("Limite")}</th>
        </tr>
      </thead>
      <tbody>${cells}</tbody>
    </table>
    <p style="font-size:13px;line-height:1.6;margin:16px 0 0;color:#8c1b31">
      Nous vous invitons à prendre les mesures correctives nécessaires dans les
      meilleurs délais.
    </p>
    <p style="font-size:14px;margin:14px 0 0">Sincères salutations,</p>`);

  return { subject, html };
}

/* ------------------------------- destruction ------------------------------- */

export type DestructionLine = {
  controlCode: string | null;
  designation: string;
  numeroLot: string | null;
  lieu: string;
  /** « Emballage ou contenant non conforme — sachet percé ». */
  motif: string;
};

export type DestructionEmailInput = {
  serialNumber: string;
  sampledAt: Date;
  receivedAt: Date | null;
  lines: DestructionLine[];
};

/**
 * The client is told when a line is destroyed at reception (answer of the
 * laboratory to Q35, RETOUR-LABO-30-09.md H3) — the same header as the
 * report e-mail, one row per destroyed line with its non-conformity.
 */
export function destructionEmail(input: DestructionEmailInput) {
  const many = input.lines.length > 1;
  const subject = `Échantillon${many ? "s" : ""} non analysé${many ? "s" : ""} — dossier ${input.serialNumber} — ${COMPANY.name}`;
  const header: [string, string][] = [
    ["N° dossier", input.serialNumber],
    ["Date de prélèvement", formatDate(input.sampledAt)],
    ["Date de réception", input.receivedAt ? formatDate(input.receivedAt) : "—"],
  ];
  const rows = input.lines
    .map(
      (line) => `
      <tr>
        <td style="${TD};font-weight:bold">${escape(line.controlCode ?? "—")}</td>
        <td style="${TD}">${escape(line.designation)}</td>
        <td style="${TD}">${escape(line.numeroLot ?? "—")}</td>
        <td style="${TD}">${escape(line.lieu)}</td>
        <td style="${TD};color:#8c1b31">${escape(line.motif)}</td>
      </tr>`
    )
    .join("");

  const html = shell(`
    <p style="font-size:15px;margin:0 0 14px">Bonjour,</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
      ${many ? "Les échantillons suivants n'ont pas pu être analysés : ils ont été" : "L'échantillon suivant n'a pas pu être analysé : il a été"}
      jugé${many ? "s" : ""} non conforme${many ? "s" : ""} à la réception et détruit${many ? "s" : ""}.
    </p>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin:0 0 14px">
      <tbody>
        ${header.map(([k, v]) => `<tr><td style="${TH}">${k}</td><td style="${TD}">${escape(v)}</td></tr>`).join("")}
      </tbody>
    </table>
    <table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:12px;margin:0 0 14px">
      <thead>
        <tr>
          <th style="${TH}">N° de contrôle</th>
          <th style="${TH}">Produit</th>
          <th style="${TH}">N° de lot</th>
          <th style="${TH}">Lieu de prélèvement</th>
          <th style="${TH}">Motif</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="font-size:14px;line-height:1.6;margin:0">
      Aucune analyse n'est facturée pour ${many ? "ces échantillons" : "cet échantillon"}. N'hésitez pas à nous contacter pour organiser un nouveau prélèvement.
    </p>
    <p style="font-size:14px;margin:14px 0 0">Sincères salutations,</p>`);

  return { subject, html };
}
