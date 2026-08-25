import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadAssignedSample } from "@/lib/sample-access";
import { canTransition } from "@/lib/sample-status";

/**
 * Submits the completed sheet to quality validation:
 * `EN_ANALYSE → RESULTATS_SAISIS`.
 *
 * A sheet can only leave the bench once every requested parameter has been
 * answered — a missing line would reach the validateur as a silent gap.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("TECHNICIEN", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const loaded = await loadAssignedSample(id, session);
  if (loaded.error) return loaded.error;
  const sample = loaded.sample;

  const transition = canTransition(
    sample.status,
    "RESULTATS_SAISIS",
    session.role
  );
  if (!transition.ok) {
    return NextResponse.json({ error: transition.error }, { status: 409 });
  }

  const results = await prisma.result.findMany({
    where: { sampleId: sample.id },
    select: {
      parameterId: true,
      value: true,
      workStatus: true,
      conform: true,
      parameter: { select: { name: true } },
    },
  });

  const byParameter = new Map(results.map((r) => [r.parameterId, r]));
  const missing: string[] = [];

  for (const { parameter } of sample.parameters) {
    const result = byParameter.get(parameter.id);
    if (!result?.value || result.workStatus === "EN_COURS") {
      missing.push(parameter.name);
    }
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Paramètres incomplets : ${missing.join(", ")}.`,
        missing,
      },
      { status: 400 }
    );
  }

  const updated = await prisma.sample.update({
    where: { id: sample.id, status: sample.status },
    data: { status: "RESULTATS_SAISIS" },
    select: { id: true, code: true, status: true },
  });

  await logAudit({
    actorId: session.id,
    action: "RESULTS_SUBMITTED",
    entity: "Sample",
    entityId: sample.id,
    metadata: {
      from: sample.status,
      to: "RESULTATS_SAISIS",
      code: sample.code,
      parameters: sample.parameters.length,
      anomalies: results.filter((r) => r.workStatus === "ANOMALIE").length,
      nonConformes: results.filter((r) => r.conform === false).length,
    },
  });

  return NextResponse.json(updated);
}
