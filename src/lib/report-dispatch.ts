import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { renderPdf } from "./pdf";
import { buildReportHtml, type ReportData } from "./report-html";
import { sendEmail, recipientsFor } from "./email";
import { reportEmail, alertEmail, type AlertRow } from "./emails/templates";
import { COMPANY } from "./company";

/**
 * What happens once a sample is approved: the client receives the report, and
 * — if a sensitive parameter is over its limit — a contamination alert.
 *
 * Alerts are grouped by germ, as in the model the client sent: one message per
 * germ listing every product concerned, not one message per result.
 */

/** Assembles the data the report PDF needs. Shared with the download route. */
export async function loadReportData(sampleId: string): Promise<ReportData | null> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      controlCode: true,
      serialNumber: true,
      produit: true,
      numeroLot: true,
      lieu: true,
      type: true,
      sampledAt: true,
      receivedAt: true,
      user: { select: { name: true } },
      approvedBy: { select: { name: true } },
      client: { select: { name: true, address: true, ice: true } },
      report: true,
      results: {
        select: {
          value: true,
          unit: true,
          threshold: true,
          conform: true,
          note: true,
          parameter: { select: { name: true } },
        },
      },
    },
  });

  if (!sample?.report) return null;

  return {
    number: sample.report.number,
    controlCode: sample.controlCode,
    serialNumber: sample.serialNumber,
    client: sample.client,
    produit: sample.produit,
    numeroLot: sample.numeroLot,
    lieu: sample.lieu,
    type: sample.type,
    sampledAt: sample.sampledAt,
    receivedAt: sample.receivedAt,
    preleveur: sample.user.name,
    technicianName: sample.report.technicianName,
    validatorName: sample.report.validatorName,
    approverName: sample.approvedBy?.name ?? null,
    validatedAt: sample.report.validatedAt,
    conclusion: sample.report.conclusion ?? "",
    results: sample.results.map((result) => ({
      parameter: result.parameter.name,
      value: result.value,
      unit: result.unit,
      threshold: result.threshold,
      conform: result.conform,
      note: result.note,
    })),
  };
}

/**
 * Sends the report to the client and marks the sample `RAPPORT_ENVOYE`.
 * Also used for a manual resend, which is why it is idempotent-friendly.
 */
export async function sendReport(sampleId: string, actorId: string | null) {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      code: true,
      status: true,
      produit: true,
      sampledAt: true,
      clientId: true,
      client: { select: { name: true } },
      report: { select: { id: true, number: true } },
      results: { select: { conform: true } },
    },
  });

  if (!sample?.report) {
    return { ok: false as const, error: "Aucun rapport à envoyer." };
  }

  const to = await recipientsFor(sample.clientId, "reports");
  if (to.length === 0) {
    return {
      ok: false as const,
      error: "Aucune adresse email enregistrée pour ce client.",
    };
  }

  const data = await loadReportData(sampleId);
  if (!data) return { ok: false as const, error: "Rapport indisponible." };

  let attachment;
  try {
    attachment = {
      filename: `${sample.report.number}.pdf`,
      content: await renderPdf(buildReportHtml(data)),
    };
  } catch (error) {
    console.error("[dispatch] could not render the report", { sampleId, error });
    return { ok: false as const, error: "Génération du PDF impossible." };
  }

  const conform = !sample.results.some((result) => result.conform === false);
  const { subject, html } = reportEmail({
    clientName: sample.client.name,
    reportNumber: sample.report.number,
    produit: sample.produit,
    sampledAt: sample.sampledAt,
    conform,
  });

  const result = await sendEmail({
    to,
    subject,
    html,
    type: "RAPPORT",
    reportId: sample.report.id,
    attachments: [attachment],
  });

  if (result.status === "ECHEC") {
    return { ok: false as const, error: result.error ?? "Envoi impossible." };
  }

  const sentAt = new Date();
  await prisma.report.update({
    where: { id: sample.report.id },
    data: {
      sendStatus: result.status === "ENVOYE" ? "ENVOYE" : "NON_ENVOYE",
      sentAt,
      sentTo: to.join(", "),
    },
  });

  // Only the first send advances the sample; a resend must not move it back.
  if (sample.status === "VALIDE") {
    await prisma.sample.update({
      where: { id: sample.id, status: "VALIDE" },
      data: { status: "RAPPORT_ENVOYE" },
    });
  }

  await logAudit({
    actorId,
    action: "REPORT_SENT",
    entity: "Report",
    entityId: sample.report.id,
    metadata: {
      code: sample.code,
      number: sample.report.number,
      to,
      status: result.status,
    },
  });

  return { ok: true as const, status: result.status, to };
}

/**
 * Contamination alerts for a sample: any sensitive parameter over its limit.
 *
 * ⚠️ The limits currently seeded are the usual Moroccan (NM) criteria, used as
 * defaults until the laboratory supplies its official figures
 * (NEEDEDINFO item 1). Changing a limit changes what triggers an alert — no
 * code change is needed.
 */
export async function sendContaminationAlerts(
  sampleId: string,
  actorId: string | null
) {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      code: true,
      produit: true,
      numeroLot: true,
      lieu: true,
      receivedAt: true,
      clientId: true,
      report: { select: { id: true } },
      results: {
        where: { conform: false, parameter: { alertOnExceed: true } },
        select: {
          value: true,
          unit: true,
          parameter: {
            select: { name: true, limitValue: true, unit: true, threshold: true },
          },
        },
      },
    },
  });

  if (!sample || sample.results.length === 0) {
    return { ok: true as const, sent: 0 };
  }

  const to = await recipientsFor(sample.clientId, "alerts");
  if (to.length === 0) {
    return {
      ok: false as const,
      error: "Aucune adresse d'alerte enregistrée pour ce client.",
    };
  }

  // The laboratory is always in copy of an alert.
  const cc = [COMPANY.email].filter(Boolean);

  // One message per germ, listing every product concerned.
  const byGerm = new Map<string, AlertRow[]>();
  for (const result of sample.results) {
    const germ = result.parameter.name;
    const unit = result.unit ?? result.parameter.unit ?? "";
    const row: AlertRow = {
      produit: sample.produit,
      site: sample.lieu,
      receivedAt: sample.receivedAt,
      numeroLot: sample.numeroLot,
      germe: germ,
      resultat: `${result.value ?? "—"}${unit ? ` ${unit}` : ""}`,
      limite:
        result.parameter.threshold ??
        (result.parameter.limitValue !== null
          ? `${result.parameter.limitValue}${unit ? ` ${unit}` : ""}`
          : "—"),
    };
    byGerm.set(germ, [...(byGerm.get(germ) ?? []), row]);
  }

  let sent = 0;
  for (const [germ, rows] of byGerm) {
    const { subject, html } = alertEmail(germ, rows);
    const result = await sendEmail({
      to,
      cc,
      subject,
      html,
      type: "ALERTE_CONTAMINATION",
      reportId: sample.report?.id ?? null,
    });

    if (result.status !== "ECHEC") sent += 1;

    await logAudit({
      actorId,
      action: "CONTAMINATION_ALERT_SENT",
      entity: "Sample",
      entityId: sample.id,
      metadata: {
        code: sample.code,
        germe: germ,
        produits: rows.map((row) => row.produit),
        to,
        status: result.status,
      },
    });
  }

  return { ok: true as const, sent };
}
