import { NextResponse } from "next/server";
import type { CancelReason } from "@/generated/prisma/enums";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/sample-status";
import { cancelRefusalForReport } from "@/lib/report-amendment";
import { cancelNotifiesClient } from "@/lib/not-received";
import { notifyNotReceived } from "@/lib/not-received-notice";

const REASONS: CancelReason[] = ["NON_EXPLOITABLE", "QUANTITE_INSUFFISANTE", "DOUBLON", "ANNULATION_CLIENT", "AUTRE", "NON_RECU"];

/**
 * « Annuler » — the terminal verb (WORKFLOW.md §8): the sample leaves every
 * queue, report and billable list, with a coded motif. The state machine
 * says who may cancel at which step; the sample keeps everything it had
 * (numbers, results) so an admin can bring it back.
 *
 * « Non reçu au laboratoire » (NON_RECU) only concerns a sample of a visit
 * still waiting for its reception (PRELEVE): once received, it was received.
 * The client is told by e-mail, one per sample (16/10, Q74 —
 * `notifyNotReceived`), once the cancellation is written: a failed send
 * never undoes it. The answer carries `notice.status` so the dialog says
 * whether the e-mail left — a simulated one (no provider configured) never
 * does: the réceptionniste is asked to call (`notReceivedNoticeText`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await prisma.sample.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      controlCode: true,
      status: true,
      serie: { select: { serialNumber: true } },
      report: { select: { amendmentPending: true } },
    },
  });
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

  // A sample reopened for amendment is back to RESULTATS_SAISIS, which the
  // state machine lets an admin cancel — but its report was issued
  // (AMENDEMENT.md): it is corrected by amendment, never cancelled. The
  // status guard of the write below covers a concurrent reopen.
  const reportRefusal = cancelRefusalForReport(sample.report);
  if (reportRefusal) return NextResponse.json({ error: reportRefusal }, { status: 409 });

  const transition = canTransition(sample.status, "ANNULE", session.role);
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: 409 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as { reason?: unknown; note?: unknown };
  const reason = typeof input.reason === "string" && REASONS.includes(input.reason as CancelReason)
    ? (input.reason as CancelReason)
    : null;
  if (!reason) return NextResponse.json({ error: "Choisissez le motif d'annulation." }, { status: 400 });
  if (reason === "NON_RECU" && sample.status !== "PRELEVE") {
    return NextResponse.json(
      { error: "« Non reçu au laboratoire » ne s'applique qu'à un échantillon pas encore réceptionné." },
      { status: 400 }
    );
  }
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
  if (reason === "AUTRE" && !note) return NextResponse.json({ error: "Précisez le motif « autre »." }, { status: 400 });

  const cancelledAt = new Date();
  try {
    // Atomic against a concurrent move: the status is re-checked in the
    // UPDATE itself and the changed rows counted (`update` reads, then writes
    // by id — two cancellations racing were both answered 200 and journalled).
    const moved = await prisma.sample.updateMany({
      where: { id, status: sample.status },
      data: { status: "ANNULE", cancelledAt, cancelledById: session.id, cancelReason: reason },
    });
    if (moved.count === 0) {
      return NextResponse.json({ error: "L'échantillon vient de changer d'état — rechargez la page." }, { status: 409 });
    }
    const updated = await prisma.sample.findUniqueOrThrow({
      where: { id },
      select: { id: true, code: true, controlCode: true, status: true, cancelledAt: true, cancelReason: true },
    });

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_CANCELLED",
      entity: "Sample",
      entityId: id,
      metadata: {
        from: sample.status,
        to: "ANNULE",
        code: sample.code,
        controlCode: sample.controlCode,
        serialNumber: sample.serie.serialNumber,
        reason,
        note: note || null,
      },
    });

    // « Non reçu »: the client is told (Q74), never at the cost of the
    // cancellation — a failure is answered, journalled, and the sample stays
    // cancelled.
    const notice = cancelNotifiesClient(reason)
      ? await notifyNotReceived(id, session.id).catch((error) => {
          console.error("[cancel] not-received notice failed", { sampleId: id, error });
          return { to: [], status: "ECHEC" as const, error: "Échec de l'avis au client." };
        })
      : null;

    return NextResponse.json(notice ? { ...updated, notice: { status: notice.status, error: notice.error } } : updated);
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "L'échantillon vient de changer d'état — rechargez la page." }, { status: 409 });
    }
    console.error("[cancel] failed", { sampleId: id, error });
    return NextResponse.json({ error: "Impossible d'annuler l'échantillon." }, { status: 500 });
  }
}
