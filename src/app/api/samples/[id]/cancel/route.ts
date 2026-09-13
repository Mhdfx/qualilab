import { NextResponse } from "next/server";
import type { CancelReason } from "@/generated/prisma/enums";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/sample-status";

const REASONS: CancelReason[] = ["NON_EXPLOITABLE", "QUANTITE_INSUFFISANTE", "DOUBLON", "ANNULATION_CLIENT", "AUTRE"];

/**
 * « Annuler » — the terminal verb (WORKFLOW.md §8): the sample leaves every
 * queue, report and billable list, with a coded motif. The state machine
 * says who may cancel at which step; the sample keeps everything it had
 * (numbers, results) so an admin can bring it back.
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
    select: { id: true, code: true, controlCode: true, status: true, serie: { select: { serialNumber: true } } },
  });
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

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
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 2000) : "";
  if (reason === "AUTRE" && !note) return NextResponse.json({ error: "Précisez le motif « autre »." }, { status: 400 });

  const cancelledAt = new Date();
  try {
    const updated = await prisma.sample.update({
      // Atomic against a concurrent move: the status is re-checked in the write.
      where: { id, status: sample.status },
      data: { status: "ANNULE", cancelledAt, cancelledById: session.id, cancelReason: reason },
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

    return NextResponse.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "L'échantillon vient de changer d'état — rechargez la page." }, { status: 409 });
    }
    console.error("[cancel] failed", { sampleId: id, error });
    return NextResponse.json({ error: "Impossible d'annuler l'échantillon." }, { status: 500 });
  }
}
