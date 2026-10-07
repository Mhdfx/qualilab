import "server-only";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { recipientsFor, sendEmail } from "./email";
import { destructionEmail } from "./emails/templates";
import { NON_CONFORMITY_REASON_LABELS } from "./labels";
import { sampleDesignation } from "./document-html";

/**
 * Tells the client that samples of a série were destroyed at reception
 * (RETOUR-LABO-30-09.md H3). One e-mail per série, to the report recipients.
 *
 * Called after the reception is written: a missing address or a failed send
 * never undoes a reception — the journal says who was told, or why not.
 */
export async function notifyDestroyed(sampleIds: string[], actorId: string) {
  if (sampleIds.length === 0) return null;
  const samples = await prisma.sample.findMany({
    where: { id: { in: sampleIds }, status: "ANNULE", cancelReason: "DETRUIT_A_RECEPTION" },
    select: {
      id: true,
      clientId: true,
      serieId: true,
      lineNumber: true,
      lineKind: true,
      controlCode: true,
      produit: true,
      surfaceLabel: true,
      surfaceState: true,
      airMethod: true,
      personName: true,
      numeroLot: true,
      lieu: true,
      sampledAt: true,
      receivedAt: true,
      conformityReason: true,
      conformityNote: true,
      serie: { select: { serialNumber: true } },
    },
    // The two samples of a two-family line: « …M » before « …P ».
    orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
  });
  if (samples.length === 0) return null;

  const first = samples[0];
  const to = await recipientsFor(first.clientId, "reports");
  const { subject, html } = destructionEmail({
    serialNumber: first.serie.serialNumber,
    sampledAt: first.sampledAt,
    receivedAt: first.receivedAt,
    lines: samples.map((s) => ({
      controlCode: s.controlCode,
      // « Planche verte — surface nettoyée », « Salle — Biocollecteur ».
      designation: sampleDesignation(s) ?? "—",
      numeroLot: s.numeroLot,
      lieu: s.lieu,
      motif: [s.conformityReason ? NON_CONFORMITY_REASON_LABELS[s.conformityReason] : "Non conforme", s.conformityNote]
        .filter(Boolean)
        .join(" — "),
    })),
  });

  let status: string = "NON_ENVOYE";
  let error: string | null = to.length === 0 ? "Aucune adresse e-mail enregistrée pour ce client." : null;
  if (to.length > 0) {
    try {
      const result = await sendEmail({ to, subject, html, type: "DESTRUCTION", reportId: null });
      status = result.status;
      error = result.error;
    } catch (cause) {
      status = "ECHEC";
      error = (cause as Error).message;
      console.error("[destruction] e-mail failed", { serieId: first.serieId, cause });
    }
  }

  await logAudit({
    actorId,
    action: "DESTRUCTION_NOTIFIED",
    entity: "Serie",
    entityId: first.serieId,
    metadata: {
      serialNumber: first.serie.serialNumber,
      lines: samples.map((s) => s.lineNumber),
      controlCodes: samples.map((s) => s.controlCode),
      to,
      status,
      error,
    },
  });
  return { to, status, error };
}
