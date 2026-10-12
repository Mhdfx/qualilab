import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { canTransition } from "@/lib/sample-status";
import { notifyDestroyed } from "@/lib/destruction-notice";
import { CONSULTATION_MESSAGES, consultationMissing } from "@/lib/client-consultation";
import { RELEASE_MESSAGES, parseReleaseBody, releaseRefusal } from "@/lib/release-rules";

/**
 * Releases a sample held at reception (`analysisBlocked`, status RECU):
 * `{ decision: "ANALYSER" | "DETRUIRE", consultation?, reason? }`.
 *
 * Who (`releaseRefusal`): the admin, any hold; the réceptionniste, a sample
 * « en attente du client » only (A9) — a reactivated destroyed sample, or
 * one blocked under the retired policy, stays the admin's.
 *
 * « Analyser » unblocks it and records the client's agreement when given
 * (required by `LabSettings.consultationRequired` for a non-conform sample).
 * It assigns NO technician: the sample is RECU and unblocked, so it is in
 * the programme queue like any received sample and the responsable des
 * paramètres gives it its bench (PROGRAMME.md §6). The old body
 * `{ technicianId }` is read as « Analyser », the technician ignored.
 *
 * « Détruire » cancels it with the motif « Détruit à réception » (through
 * `canTransition`), then tells the client — never at the cost of the
 * cancellation itself.
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
      analysisBlocked: true,
      awaitingClientSince: true,
      conformity: true,
      conformityNote: true,
      serie: { select: { serialNumber: true } },
    },
  });

  if (!sample) {
    return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
  }

  const refusal = releaseRefusal(session.role, sample);
  if (refusal) return NextResponse.json({ error: refusal.error }, { status: refusal.status });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const now = new Date();
  const parsed = parseReleaseBody(body, now);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { decision, consultation, reason, legacy } = parsed.value;

  // The guard doubles as optimistic concurrency: a second release finds the
  // sample no longer held and gets a clean 409. `updateMany` re-checks it in
  // the UPDATE and counts the changed rows (`update` reads, then writes by
  // id: two releases racing were both answered 200 and journalled).
  const held = { id: sample.id, status: "RECU" as const, analysisBlocked: true };
  const claim = async (data: Prisma.SampleUncheckedUpdateManyInput) => {
    const moved = await prisma.sample.updateMany({ where: held, data });
    if (moved.count === 0) return null;
    return prisma.sample.findUniqueOrThrow({
      where: { id: sample.id },
      select: { id: true, code: true, status: true, analysisBlocked: true },
    });
  };

  if (decision === "ANALYSER") {
    const settings = await getLabSettings();
    if (consultationMissing(settings.consultationRequired, decision, sample.conformity, consultation)) {
      // A page opened before A9 has no « Accord du client » block: say how to get one.
      const error = legacy
        ? `${CONSULTATION_MESSAGES.required} Rechargez la page pour saisir l'accord du client.`
        : CONSULTATION_MESSAGES.required;
      return NextResponse.json({ error }, { status: 400 });
    }
    const updated = await claim({
      analysisBlocked: false,
      awaitingClientSince: null,
      ...(consultation
        ? {
            clientConsultedAt: consultation.at,
            clientConsultedName: consultation.name,
            clientConsultationChannel: consultation.channel,
            clientConsultationNote: consultation.note,
          }
        : {}),
    });
    if (!updated) return NextResponse.json({ error: RELEASE_MESSAGES.already }, { status: 409 });

    await Promise.all([
      logAudit({
        actorId: session.id,
        action: "SAMPLE_RELEASED",
        entity: "Sample",
        entityId: sample.id,
        metadata: {
          code: sample.code,
          controlCode: sample.controlCode,
          serialNumber: sample.serie.serialNumber,
          decision,
          awaitedClientSince: sample.awaitingClientSince,
          reason,
          // The old body named a technician: ignored, the programme assigns the bench.
          ...(legacy ? { technicianIgnored: true } : {}),
        },
      }),
      ...(consultation
        ? [
            logAudit({
              actorId: session.id,
              action: "CLIENT_CONSULTED",
              entity: "Sample",
              entityId: sample.id,
              metadata: {
                serialNumber: sample.serie.serialNumber,
                controlCode: sample.controlCode,
                decision,
                name: consultation.name,
                channel: consultation.channel,
                at: consultation.at,
                note: consultation.note,
              },
            }),
          ]
        : []),
    ]);
    return NextResponse.json(updated);
  }

  // DETRUIRE: a cancellation, through the state machine.
  const transition = canTransition("RECU", "ANNULE", session.role);
  if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: 403 });
  const destroyed = await claim({
    status: "ANNULE",
    cancelledAt: now,
    cancelledById: session.id,
    cancelReason: "DETRUIT_A_RECEPTION",
    analysisBlocked: false,
    awaitingClientSince: null,
  });
  if (!destroyed) return NextResponse.json({ error: RELEASE_MESSAGES.already }, { status: 409 });

  await Promise.all([
    logAudit({
      actorId: session.id,
      action: "SAMPLE_RELEASED",
      entity: "Sample",
      entityId: sample.id,
      metadata: {
        code: sample.code,
        controlCode: sample.controlCode,
        serialNumber: sample.serie.serialNumber,
        decision,
        awaitedClientSince: sample.awaitingClientSince,
        reason,
      },
    }),
    logAudit({
      actorId: session.id,
      action: "SAMPLE_CANCELLED",
      entity: "Sample",
      entityId: sample.id,
      metadata: {
        from: "RECU",
        to: "ANNULE",
        code: sample.code,
        controlCode: sample.controlCode,
        serialNumber: sample.serie.serialNumber,
        reason: "DETRUIT_A_RECEPTION",
        note: reason ?? sample.conformityNote,
      },
    }),
  ]);

  // The client is told (Q35) — never at the cost of the cancellation.
  const destruction = await notifyDestroyed([sample.id], session.id).catch((error) => {
    console.error("[release] destruction notice failed", { sampleId: sample.id, error });
    return null;
  });

  return NextResponse.json({ ...destroyed, destruction });
}
