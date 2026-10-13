import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  canApprove,
  canTransition,
  canValidateTechnically,
  signsAdministratively,
} from "@/lib/sample-status";
import {
  issueReportFor,
  sendReport,
  sendContaminationAlerts,
} from "@/lib/report-dispatch";
import { getLabSettings } from "@/lib/lab-settings";
import { needsRegulation } from "@/lib/regulation";

/**
 * Quality validation — the two approvals, and the rejection.
 *
 * `action: "validate"`  VALIDATEUR (or DIRECTION, ADMIN) signs off
 *                       technically. Recorded on the sample; the status
 *                       does not move yet.
 * `action: "approve"`   DIRECTION or ADMIN gives the final approval (12/10),
 *                       which is what sets the status to VALIDE — never the
 *                       person who signed step 1.
 * `action: "reject"`    Either desk sends it back to the technician with a
 *                       mandatory reason (`RESULTATS_SAISIS → EN_ANALYSE`).
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
    select: {
      id: true,
      code: true,
      status: true,
      validatedById: true,
      approvedById: true,
      productTypeId: true,
      productId: true,
      regulationId: true,
      regulation: { select: { title: true } },
      report: { select: { amendmentPending: true } },
    },
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

  // The regulation of this sample: the one sent, else the one already chosen.
  let regulation: { id: string; title: string } | null =
    sample.regulationId && sample.regulation ? { id: sample.regulationId, title: sample.regulation.title } : null;
  if (action === "validate" || action === "approve") {
    if (typeof rawRegulation === "string" && rawRegulation) {
      const found = await prisma.regulation.findFirst({ where: { id: rawRegulation, active: true }, select: { id: true, title: true } });
      if (!found) return NextResponse.json({ error: "Réglementation inconnue ou archivée." }, { status: 400 });
      regulation = found;
    }
    if (needsRegulation(sample) && !regulation) {
      return NextResponse.json({ error: "Choisissez la réglementation en vigueur pour cet échantillon." }, { status: 400 });
    }
  }
  const regulationChanged = (regulation?.id ?? null) !== sample.regulationId;
  // Recorded on the sample and remembered for the client's product.
  const recordRegulation = async () => {
    if (!regulation || !regulationChanged) return;
    if (sample.productId) {
      await prisma.clientProduct.update({ where: { id: sample.productId }, data: { regulationId: regulation.id } });
    }
    await logAudit({
      actorId: session.id,
      action: "SAMPLE_REGULATION_SET",
      entity: "Sample",
      entityId: sample.id,
      metadata: { code: sample.code, before: sample.regulation?.title ?? null, after: regulation.title },
    });
  };

  if (action === "validate") {
    const check = canValidateTechnically(sample, session.role);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 409 });
    }

    // Guard against two validateurs signing the same sample at once:
    // `updateMany` re-checks the guard in the UPDATE itself and counts the
    // rows it changed (`update` reads first, then writes by id — two
    // signatures racing both "succeeded" and both were journalled).
    const claimed = await prisma.sample.updateMany({
      where: { id: sample.id, status: "RESULTATS_SAISIS", validatedById: null },
      data: { validatedById: session.id, validatedAt: now, ...(regulation ? { regulationId: regulation.id } : {}) },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Cet échantillon vient d'être validé par un autre validateur." },
        { status: 409 }
      );
    }
    const updated = { id: sample.id, validatedAt: now };

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_VALIDATED_TECHNICAL",
      entity: "Sample",
      entityId: sample.id,
      metadata: { code: sample.code, step: "1/2", regulation: regulation?.title ?? null },
    });
    await recordRegulation();

    // Pending client decision n°11 (LabSettings): when the lab wants the
    // contamination alerts out as soon as the technical validation lands,
    // they leave here — the admin approval later finds alertsSentAt set and
    // does not send them again. Never blocks the validation itself.
    let dispatch: { alerts?: number; error?: string } | undefined;
    const settings = await getLabSettings();
    if (settings.alertAfterTechnicalValidation) {
      const alerts = await sendContaminationAlerts(sample.id, session.id).catch(
        (error) => {
          console.error("[validation] alert send failed", { error });
          return { ok: false as const, error: "Envoi des alertes impossible." };
        }
      );
      dispatch = alerts.ok ? { alerts: alerts.sent } : { error: alerts.error };
    }

    return NextResponse.json({ ...updated, awaiting: "ADMIN", dispatch });
  }

  if (action === "approve") {
    const check = canApprove(sample, session.role, session.id);
    if (!check.ok) {
      // A role that may never approve is refused (403, HANDOFF §3); the
      // Direction or an ADMIN meeting a state that forbids it now (or its
      // own technical signature) gets the 409.
      return NextResponse.json({ error: check.error }, { status: signsAdministratively(session.role) ? 409 : 403 });
    }

    // Atomic: only the request whose UPDATE moved the sample goes on to
    // issue and send the report. The technical signature checked above is
    // part of the guard — a send-back racing this approval clears it.
    const claimed = await prisma.sample.updateMany({
      where: { id: sample.id, status: "RESULTATS_SAISIS", validatedById: sample.validatedById },
      data: {
        approvedById: session.id,
        approvedAt: now,
        status: "VALIDE",
        ...(regulation ? { regulationId: regulation.id } : {}),
      },
    });
    if (claimed.count === 0) {
      return NextResponse.json(
        { error: "Cet échantillon vient d'être validé administrativement ou renvoyé par quelqu'un d'autre." },
        { status: 409 }
      );
    }
    const updated = { id: sample.id, code: sample.code, status: "VALIDE", approvedAt: now };

    // Approval is what makes the report official, so it is created here — with
    // the names frozen as they stand today, so a report downloaded next year
    // still shows who actually signed it. A report reopened for amendment is
    // not recreated: its next version (« -A1 ») is issued.
    await recordRegulation();
    const report = await issueReportFor(sample.id, session.id);

    // The client is served straight away: the report, then an alert if a
    // sensitive parameter is over its limit. Neither may break the approval,
    // which is already recorded — a failed send is visible in the journal and
    // can be retried from the interface.
    let dispatch: { report?: string; alerts?: number; error?: string } = {};
    if (report) {
      const sent = await sendReport(sample.id, session.id).catch((error) => {
        console.error("[validation] report send failed", { error });
        return { ok: false as const, error: "Envoi du rapport impossible." };
      });
      dispatch = sent.ok ? { report: sent.status } : { error: sent.error };

      const alerts = await sendContaminationAlerts(sample.id, session.id).catch(
        (error) => {
          console.error("[validation] alert send failed", { error });
          return { ok: false as const, error: "Envoi des alertes impossible." };
        }
      );
      if (alerts.ok) dispatch.alerts = alerts.sent;
      else dispatch.error = [dispatch.error, alerts.error].filter(Boolean).join(" ");
    } else {
      // The approval stands; the send retries the issue (`sendReport`).
      dispatch.error = "Le rapport n'a pas pu être émis : utilisez « Générer et envoyer le rapport » ou « Renvoyer au client ».";
    }

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_APPROVED",
      entity: "Sample",
      entityId: sample.id,
      metadata: {
        from: "RESULTATS_SAISIS",
        to: "VALIDE",
        code: sample.code,
        step: "2/2",
        reportNumber: report?.number ?? null,
        ...(report?.amended ? { amendment: true } : {}),
      },
    });

    return NextResponse.json({ ...updated, report, dispatch });
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
      },
    });

    return NextResponse.json(updated);
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
