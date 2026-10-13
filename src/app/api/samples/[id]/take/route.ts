import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { BENCH_STATUSES, TYPED_RESULT_WHERE, takeRefusal, untakeRefusal, type Refusal } from "@/lib/bench-access";
import { lockTakeState, type LockedTakeState } from "@/lib/bench-take-server";

/**
 * « Prendre en charge » (POST) and « Libérer » (DELETE) at the bench — the
 * « prise en charge libre » of 13/10 (PROGRAMME.md §10).
 *
 * Nobody assigns a technician: a confirmed programme waits in « À prendre »
 * and the technician who takes it becomes its holder. The first one wins:
 * the Sample row is locked (`lockTakeState`), the holder read again under
 * the lock, and the second answered 409 « Déjà pris par X ». A first result
 * typed on a free sample takes it too (`PUT …/results`).
 *
 * « Libérer » gives it back to « À prendre »: its holder or an
 * administrator, while it is on the bench and nothing is typed on it
 * (`untakeRefusal`). Legacy per-parameter technicians are cleared with it.
 *
 * Not the reception's « Libérer » (`…/release`, a sample held at
 * reception): these are bench actions, journalled as SAMPLE_TAKEN and
 * SAMPLE_UNTAKEN.
 */

type Outcome =
  | { refusal: Refusal }
  | { done: "taken" | "already" | "untaken"; state: LockedTakeState; clearedParameters?: number };

const answer = (refusal: Refusal) => NextResponse.json({ error: refusal.error }, { status: refusal.status });

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Only a technician takes: the admin stands in on a taken sample, the
  // other roles never type results.
  const session = await requireApiRole("TECHNICIEN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const now = new Date();

  const outcome: Outcome = await prisma.$transaction(async (tx) => {
    const state = await lockTakeState(tx, id);
    const refusal = takeRefusal(state, session.id);
    if (refusal || !state) return { refusal: refusal ?? { status: 404, error: "Échantillon introuvable." } };
    if (state.technicianId === session.id) return { done: "already", state };
    // Scalar guard, re-checked in the UPDATE itself (never `update` guarded
    // by a non-id field: guarded-writes.test.ts).
    const taken = await tx.sample.updateMany({
      where: { id, technicianId: null, status: { in: [...BENCH_STATUSES] }, analysisBlocked: false },
      data: { technicianId: session.id, assignedAt: now },
    });
    if (taken.count === 0) return { refusal: { status: 409, error: "Cet échantillon vient de changer : rechargez la page." } };
    return { done: "taken", state };
  });

  if ("refusal" in outcome) return answer(outcome.refusal);
  if (outcome.done === "taken") {
    await logAudit({
      actorId: session.id,
      action: "SAMPLE_TAKEN",
      entity: "Sample",
      entityId: id,
      metadata: { code: outcome.state.code, controlCode: outcome.state.controlCode, implicit: false },
    });
  }
  const sample = await prisma.sample.findUniqueOrThrow({
    where: { id },
    select: { id: true, technicianId: true, assignedAt: true, technician: { select: { name: true } } },
  });
  return NextResponse.json({ ...sample, already: outcome.done === "already" });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("TECHNICIEN", "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  const outcome: Outcome = await prisma.$transaction(async (tx) => {
    const state = await lockTakeState(tx, id);
    // Counted under the same lock as the results save takes: a first
    // reading cannot slip between this count and the give-back.
    const typed = state ? await tx.result.count({ where: { sampleId: id, ...TYPED_RESULT_WHERE } }) : 0;
    const refusal = untakeRefusal(state, typed, session);
    if (refusal || !state) return { refusal: refusal ?? { status: 404, error: "Échantillon introuvable." } };
    await tx.sample.updateMany({ where: { id }, data: { technicianId: null, assignedAt: null } });
    const cleared = await tx.sampleParameter.updateMany({
      where: { sampleId: id, technicianId: { not: null } },
      data: { technicianId: null },
    });
    return { done: "untaken", state, clearedParameters: cleared.count };
  });

  if ("refusal" in outcome) return answer(outcome.refusal);
  await logAudit({
    actorId: session.id,
    action: "SAMPLE_UNTAKEN",
    entity: "Sample",
    entityId: id,
    metadata: {
      code: outcome.state.code,
      controlCode: outcome.state.controlCode,
      previousTechnicianId: outcome.state.technicianId,
      previousTechnicianName: outcome.state.holderName,
      clearedParameters: outcome.clearedParameters ?? 0,
      byAdmin: session.role === "ADMIN",
    },
  });
  return NextResponse.json({ id, technicianId: null, assignedAt: null });
}
