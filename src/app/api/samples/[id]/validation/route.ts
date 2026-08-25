import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  canApprove,
  canTransition,
  canValidateTechnically,
} from "@/lib/sample-status";
import { generateReportNumber } from "@/lib/report-number";
import { buildConclusion } from "@/lib/report-html";
import { sendReport, sendContaminationAlerts } from "@/lib/report-dispatch";

/**
 * Quality validation — the two approvals, and the rejection.
 *
 * `action: "validate"`  VALIDATEUR signs off technically. Recorded on the
 *                       sample; the status does not move yet.
 * `action: "approve"`   ADMIN gives the final approval, which is what sets
 *                       the status to VALIDE.
 * `action: "reject"`    Either desk sends it back to the technician with a
 *                       mandatory reason (`RESULTATS_SAISIS → EN_ANALYSE`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
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

  const { action, reason } = (body ?? {}) as {
    action?: unknown;
    reason?: unknown;
  };
  const motif = typeof reason === "string" ? reason.trim() : "";
  const now = new Date();

  if (action === "validate") {
    const check = canValidateTechnically(sample, session.role);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 409 });
    }

    const updated = await prisma.sample.update({
      // Guard against two validateurs signing the same sample at once.
      where: { id: sample.id, validatedById: null },
      data: { validatedById: session.id, validatedAt: now },
      select: { id: true, validatedAt: true },
    });

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_VALIDATED_TECHNICAL",
      entity: "Sample",
      entityId: sample.id,
      metadata: { code: sample.code, step: "1/2" },
    });

    return NextResponse.json({ ...updated, awaiting: "ADMIN" });
  }

  if (action === "approve") {
    const check = canApprove(sample, session.role);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 409 });
    }

    const updated = await prisma.sample.update({
      where: { id: sample.id, status: "RESULTATS_SAISIS" },
      data: {
        approvedById: session.id,
        approvedAt: now,
        status: "VALIDE",
      },
      select: { id: true, code: true, status: true, approvedAt: true },
    });

    // Approval is what makes the report official, so it is created here — with
    // the names frozen as they stand today, so a report downloaded next year
    // still shows who actually signed it.
    const report = await createReportFor(sample.id);

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

    const updated = await prisma.sample.update({
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
      },
      select: { id: true, code: true, status: true },
    });

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

/**
 * Creates the report record for a freshly approved sample.
 *
 * The PDF itself is rendered on demand from this snapshot plus the results —
 * there is no file to store, back up or lose, and a re-download is always
 * identical to what was sent.
 */
async function createReportFor(sampleId: string) {
  const existing = await prisma.report.findUnique({
    where: { sampleId },
    select: { id: true, number: true },
  });
  if (existing) return existing;

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      validatedAt: true,
      technician: { select: { name: true } },
      validatedBy: { select: { name: true } },
      results: {
        select: { conform: true, parameter: { select: { name: true } } },
      },
    },
  });
  if (!sample) return null;

  try {
    return await prisma.report.create({
      data: {
        sampleId,
        number: await generateReportNumber(),
        conclusion: buildConclusion(
          sample.results.map((r) => ({
            conform: r.conform,
            parameter: r.parameter.name,
          }))
        ),
        technicianName: sample.technician?.name ?? null,
        validatorName: sample.validatedBy?.name ?? null,
        validatedAt: sample.validatedAt,
      },
      select: { id: true, number: true },
    });
  } catch (error) {
    // A report must never block the approval itself — the sample is validated
    // either way, and the report can be regenerated.
    console.error("[validation] report creation failed", { sampleId, error });
    return null;
  }
}
