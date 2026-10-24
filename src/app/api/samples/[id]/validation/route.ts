import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { canTransition } from "@/lib/sample-status";
import { approvalDispatch } from "@/lib/report-actions";
import { reportTechnicianNames } from "@/lib/report-programme";
import {
  VALIDATION_SAMPLE_SELECT,
  approveSample,
  regulationFor,
  validateTechnically,
  type SignatureOutcome,
} from "@/lib/validation-server";

/**
 * Quality validation — the two approvals, and the rejection.
 *
 * `action: "validate"`  VALIDATEUR (or DIRECTION, ADMIN) signs off
 *                       technically. Recorded on the sample; the status
 *                       does not move yet.
 * `action: "approve"`   DIRECTION or ADMIN gives the final approval (12/10),
 *                       which is what sets the status to VALIDE — never the
 *                       person who signed step 1. It issues the report; the
 *                       report leaves only with `send: true` (« Valider et
 *                       envoyer ») — nothing is sent automatically any more
 *                       (16/10, Q92; `approvalDispatch`). The contamination
 *                       alerts still run here whatever `send` says.
 * `action: "reject"`    Either desk sends it back to the technician who took
 *                       it (prise en charge libre, PROGRAMME.md §10 — the
 *                       holder stays, so it comes back to their bench) with a
 *                       mandatory reason (`RESULTATS_SAISIS → EN_ANALYSE`).
 *                       The journal names who it went back to (« renvoyé à
 *                       X »: the holder, plus any legacy parameter technician).
 *
 * The two signatures themselves live in `src/lib/validation-server.ts`
 * (`validateTechnically`, `approveSample`), so that « toute la série »
 * (re-ask 2.16, `POST /api/series/[id]/validation`) signs each of its
 * samples through exactly the same rules and journal.
 *
 * Amendment (AMENDEMENT.md §2): a sample reopened for amendment goes
 * through the same two steps; its approval issues the amended version of
 * the existing report (`issueReportFor`) instead of creating one.
 *
 * « Réglementation en vigueur » (RETOUR-LABO-30-09.md, slice I): validate
 * and approve accept `regulationId`. A sample judged against criteria cannot
 * be validated without one; the choice is remembered on the client's
 * product, so it is proposed next time.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const sample = await prisma.sample.findUnique({
    where: { id },
    select: VALIDATION_SAMPLE_SELECT,
  });

  if (!sample) {
    return NextResponse.json(
      { error: "Échantillon introuvable." },
      { status: 404 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { action, reason, regulationId: rawRegulation } = (body ?? {}) as {
    action?: unknown;
    reason?: unknown;
    regulationId?: unknown;
  };
  const motif = typeof reason === "string" ? reason.trim() : "";
  const now = new Date();

  if (action === "validate") {
    const resolved = await regulationFor(sample, rawRegulation);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    return answer(await validateTechnically(sample, session, resolved.regulation));
  }

  if (action === "approve") {
    const resolved = await regulationFor(sample, rawRegulation);
    if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    // « Valider » or « Valider et envoyer »: read before anything is written.
    const plan = approvalDispatch(body);
    if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: 400 });
    return answer(await approveSample(sample, session, resolved.regulation, plan));
  }

  if (action === "reject") {
    if (!motif) {
      return NextResponse.json(
        { error: "Un motif est obligatoire pour renvoyer l'échantillon." },
        { status: 400 }
      );
    }

    const check = canTransition(
      sample.status,
      "EN_ANALYSE",
      session.role,
      motif
    );
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 409 });
    }

    // Atomic, like the approval: a send-back racing an approval is refused
    // rather than reported as done over a report already issued.
    const claimed = await prisma.sample.updateMany({
      where: { id: sample.id, status: "RESULTATS_SAISIS" },
      data: {
        status: "EN_ANALYSE",
        rejectionReason: motif,
        rejectedById: session.id,
        rejectedAt: now,
        // The technical sign-off is cleared: the corrected results must be
        // validated again from the start.
        validatedById: null,
        validatedAt: null,
        // Sent back to the bench: the next results deserve their own alert.
        // Not during an amendment: the alerts sent for the report being
        // amended stand, and only a changed result is alerted again
        // (`sendContaminationAlerts`).
        ...(sample.report?.amendmentPending ? {} : { alertsSentAt: null }),
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Cet échantillon vient de changer d'état : rechargez la page." },
        { status: 409 }
      );
    }
    const updated = { id: sample.id, code: sample.code, status: "EN_ANALYSE" };

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_REJECTED",
      entity: "Sample",
      entityId: sample.id,
      metadata: {
        from: "RESULTATS_SAISIS",
        to: "EN_ANALYSE",
        code: sample.code,
        reason: motif,
        // « Renvoyé à X »: the bench it goes back to.
        technicianId: sample.technicianId,
        technicianName: reportTechnicianNames(sample),
      },
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}

/** A signature's answer as the panel reads it: its body, or `{ error }` with the status. */
function answer<T>(outcome: SignatureOutcome<T>) {
  return outcome.ok
    ? NextResponse.json(outcome.body)
    : NextResponse.json({ error: outcome.error }, { status: outcome.status });
}
