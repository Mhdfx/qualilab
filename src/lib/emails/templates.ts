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
  produit: string | null;
  sampledAt: Date;
  conform: boolean;
};

export function reportEmail(input: ReportEmailInput) {
  const subject = `Rapport d'analyse ${input.reportNumber} — ${COMPANY.name}`;

  const html = shell(`
    <p style="font-size:15px;margin:0 0 14px">Bonjour,</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 14px">
      Veuillez trouver ci-joint le rapport d'analyse
      <b>${escape(input.reportNumber)}</b> concernant l'échantillon
      ${input.produit ? `<b>${escape(input.produit)}</b> ` : ""}prélevé le
      <b>${formatDate(input.sampledAt)}</b>.
    </p>
    ${
      input.conform
        ? `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;padding:10px 12px;background:#eefaf1;border-left:3px solid #2f6b3a;color:#22562e">
             L'échantillon analysé est <b>conforme</b> aux critères microbiologiques de référence.
           </p>`
        : `<p style="font-size:14px;line-height:1.6;margin:0 0 14px;padding:10px 12px;background:#fdecef;border-left:3px solid #a5203a;color:#8c1b31">
             L'échantillon analysé présente une <b>non-conformité</b>. Le détail figure dans le rapport joint.
           </p>`
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
  resultat: string;
  limite: string;
};

/**
 * Contamination alert — one message per client and per germ, listing every
 * product concerned, as in the model received on 17/08.
 */
export function alertEmail(germe: string, rows: AlertRow[]) {
  const subject = `Alerte de contamination par ${germe}`;

  const cells = rows
    .map(
      (row) => `
      <tr>
        <td style="border:1px solid #9aa9b3;padding:6px 8px;font-weight:bold">${escape(row.produit ?? "—")}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.site)}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${row.receivedAt ? formatDate(row.receivedAt) : "—"}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.numeroLot ?? "-")}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.germe)}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px;font-weight:bold">${escape(row.resultat)}</td>
        <td style="border:1px solid #9aa9b3;padding:6px 8px">${escape(row.limite)}</td>
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
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">Résultat</th>
          <th style="border:1px solid #9aa9b3;padding:6px 8px;text-align:left">Limite</th>
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
