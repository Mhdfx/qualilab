import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canTransition, reactivationTarget } from "@/lib/sample-status";

/**
 * Bringing a cancelled sample back — ADMIN only, written reason. It returns
 * to the step it had reached: received (it keeps its N° de contrôle) or
 * still waiting at reception.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await prisma.sample.findUnique({
    where: { id },
    select: { id: true, code: true, controlCode: true, status: true, cancelReason: true },
  });
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const note = typeof (body as { note?: unknown })?.note === "string" ? ((body as { note: string }).note).trim().slice(0, 2000) : "";

  const target = reactivationTarget(sample);
  const transition = canTransition(sample.status, target, session.role, note);
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: 409 });

  try {
    const updated = await prisma.sample.update({
      where: { id, status: "ANNULE" },
      // The technical validation belonged to the results that were cancelled:
      // it is dropped with them, otherwise the next batch could be approved
      // on a signature nobody gave for it (the signature lives on the sample,
      // not on a status — see sample-status.ts).
      data: {
        status: target,
        cancelledAt: null,
        cancelledById: null,
        cancelReason: null,
        validatedById: null,
        validatedAt: null,
        alertsSentAt: null,
      },
      select: { id: true, code: true, controlCode: true, status: true },
    });

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_REACTIVATED",
      entity: "Sample",
      entityId: id,
      metadata: { from: "ANNULE", to: target, code: sample.code, controlCode: sample.controlCode, previousReason: sample.cancelReason, note },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
      return NextResponse.json({ error: "L'échantillon n'est plus annulé." }, { status: 409 });
    }
    console.error("[reactivate] failed", { sampleId: id, error });
    return NextResponse.json({ error: "Impossible de réactiver l'échantillon." }, { status: 500 });
  }
}
