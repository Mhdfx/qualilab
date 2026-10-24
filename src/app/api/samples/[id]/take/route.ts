import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { BENCH_STATUSES, TYPED_RESULT_WHERE, takeRefusal, untakeRefusal, type Refusal } from "@/lib/bench-access";
import { lockTakeState, type LockedTakeState } from "@/lib/bench-take-server";
import { TAKE_OVER_MESSAGES, takeOverRefusal } from "@/lib/take-over";

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
 * « Reprendre » (PATCH) takes over a sample a colleague holds (re-ask 2.13,
 * Q107, plan C3 — behind `TAKE_OVER_COLLEAGUE`): any technician, no reason
 * to write (`takeOverRefusal`). The request names the holder the confirmation
 * named (`holderId`): under the same row lock, the holder moves only if it
 * is still that one (a guarded `updateMany`) — a colleague who took it over
 * meanwhile is answered 409, never silently replaced. Only the holder
 * changes: `assignedAt` stays the start of the analyses, the « Date
 * d'analyse » of the report (`analysisStart`), and the take-over's own
 * instant is its journal row. The readings already saved stay with their
 * author, and the take-over is journalled SAMPLE_TAKEN_OVER with the
 * previous holder and how many were saved.
 *
 * Not the reception's « Libérer » (`…/release`, a sample held at
 * reception): these are bench actions, journalled as SAMPLE_TAKEN,
 * SAMPLE_UNTAKEN and SAMPLE_TAKEN_OVER.
 */

type Outcome =
  | { refusal: Refusal }
  | {
      done: "taken" | "already" | "untaken" | "takenOver";
      state: LockedTakeState;
      clearedParameters?: number;
      /** How many readings were saved when it was taken over. */
      typedResults?: number;
    };

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Only a technician takes over: the admin stands in on any sample
  // without taking it (`takeOverRefusal` says it again).
  const session = await requireApiRole("TECHNICIEN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  // The holder the confirmation named (`TakeOverButton`): the one taken from.
  const body: unknown = await request.json().catch(() => null);
  const expected =
    body && typeof body === "object" && "holderId" in body && typeof body.holderId === "string" && body.holderId
      ? body.holderId
      : null;
  if (!expected) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });

  const outcome: Outcome = await prisma.$transaction(async (tx) => {
    const state = await lockTakeState(tx, id);
    const refusal = takeOverRefusal(state, session);
    if (refusal || !state) return { refusal: refusal ?? { status: 404, error: "Échantillon introuvable." } };
    if (state.technicianId === session.id) return { done: "already", state };
    // A colleague took it over since the sheet was opened: the one who
    // confirms reads the real holder first (the button refreshes on 409).
    if (state.technicianId !== expected) return { refusal: { status: 409, error: TAKE_OVER_MESSAGES.changed } };
    // Counted under the lock: what the journal says was handed over.
    const typedResults = await tx.result.count({ where: { sampleId: id, ...TYPED_RESULT_WHERE } });
    // Guarded by the holder confirmed (never `update` guarded by a non-id
    // field: guarded-writes.test.ts). Only the holder moves — the analyses
    // started at the take, the report's « Date d'analyse »; the readings
    // are not touched: each keeps its author and time (D-09).
    const moved = await tx.sample.updateMany({
      where: {
        id,
        technicianId: expected,
        status: { in: [...BENCH_STATUSES] },
        analysisBlocked: false,
      },
      data: { technicianId: session.id },
    });
    if (moved.count === 0) return { refusal: { status: 409, error: TAKE_OVER_MESSAGES.changed } };
    return { done: "takenOver", state, typedResults };
  });

  if ("refusal" in outcome) return answer(outcome.refusal);
  if (outcome.done === "takenOver") {
    await logAudit({
      actorId: session.id,
      action: "SAMPLE_TAKEN_OVER",
      entity: "Sample",
      entityId: id,
      metadata: {
        code: outcome.state.code,
        controlCode: outcome.state.controlCode,
        previousTechnicianId: outcome.state.technicianId,
        previousTechnicianName: outcome.state.holderName,
        typedResults: outcome.typedResults ?? 0,
      },
    });
  }
  const sample = await prisma.sample.findUniqueOrThrow({
    where: { id },
    select: { id: true, technicianId: true, technician: { select: { name: true } } },
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
