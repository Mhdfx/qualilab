import "server-only";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { recipientsFor, sendEmail } from "./email";
import { getCompany } from "./company-server";
import { notReceivedEmail } from "./emails/templates";
import { sampleDesignation } from "./document-html";
import { sampleRef } from "./reception-input";
import { deliverNotice, type NoticeOutcome } from "./not-received";

/**
 * Tells the client that a sample of a visit never reached the laboratory
 * (« Non reçu au laboratoire » — the laboratory's answer of 16/10 to Q74,
 * RETOUR-LABO-16-10.md §3.B, B4), on the model of the destruction notice:
 * one e-mail per sample, to the addresses that receive the reports of the
 * série's site (D-04), journalled NOT_RECEIVED_NOTIFIED.
 *
 * Called by `POST /api/samples/[id]/cancel` once the cancellation is
 * written: a missing address or a failed send never undoes it — the journal
 * says who was told, or why not. Null when the sample is not (or no longer)
 * cancelled « Non reçu ». A reactivation tells nothing; a sample cancelled
 * « Non reçu » again is told again.
 */
export async function notifyNotReceived(sampleId: string, actorId: string): Promise<NoticeOutcome | null> {
  const sample = await prisma.sample.findFirst({
    where: { id: sampleId, status: "ANNULE", cancelReason: "NON_RECU" },
    select: {
      id: true,
      code: true,
      clientId: true,
      lineNumber: true,
      lineKind: true,
      produit: true,
      surfaceLabel: true,
      surfaceState: true,
      airMethod: true,
      airExposureMin: true,
      personName: true,
      numeroLot: true,
      lieu: true,
      sampledAt: true,
      client: { select: { name: true } },
      // `samplingTimeDeclared`: the « Non déclarée » rule of every e-mail (R6) — null on a visit.
      serie: { select: { serialNumber: true, siteId: true, site: { select: { name: true } }, samplingTimeDeclared: true } },
    },
  });
  if (!sample) return null;

  const ref = sampleRef(sample.lineNumber, sample.code);
  // The site's own addresses too, never another site's (D-04).
  const [recipients, company] = await Promise.all([recipientsFor(sample.clientId, "reports", sample.serie.siteId), getCompany()]);
  const { subject, html } = notReceivedEmail({
    serialNumber: sample.serie.serialNumber,
    sampledAt: sample.sampledAt,
    samplingTimeDeclared: sample.serie.samplingTimeDeclared,
    clientName: sample.client.name,
    siteName: sample.serie.site?.name ?? null,
    sampleRef: ref,
    // « Planche verte — surface nettoyée », « Salle — Biocollecteur ».
    designation: sampleDesignation(sample) ?? "—",
    lineKind: sample.lineKind,
    numeroLot: sample.numeroLot,
    lieu: sample.lieu,
  }, company);

  const outcome = await deliverNotice(recipients, sample.serie.siteId, (to) =>
    sendEmail({ to, subject, html, type: "NON_RECU", reportId: null })
  );
  if (outcome.status === "ECHEC") {
    console.error("[not-received] e-mail failed", { sampleId: sample.id, error: outcome.error });
  }

  await logAudit({
    actorId,
    action: "NOT_RECEIVED_NOTIFIED",
    entity: "Sample",
    entityId: sample.id,
    metadata: {
      serialNumber: sample.serie.serialNumber,
      code: sample.code,
      ref,
      to: outcome.to,
      status: outcome.status,
      error: outcome.error,
    },
  });
  return outcome;
}
