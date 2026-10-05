import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadAssignedSample } from "@/lib/sample-access";
import { canTransition } from "@/lib/sample-status";
import { canEditParameter } from "@/lib/bench-access";

/**
 * Submits the completed sheet to quality validation:
 * `EN_ANALYSE → RESULTATS_SAISIS`.
 *
 * A sheet can only leave the bench once every requested parameter has been
 * answered — a missing line would reach the validateur as a silent gap. A
 * germ read per unit (CRITERES.md) must have every unit read: an
 * « Incomplet » verdict stays on the bench — and so must any parameter of a
 * sample taken on several units with a repetition left blank or typed in a
 * notation the engine cannot read.
 *
 * Every parameter must be done whoever holds it (PROGRAMME.md §6): any
 * technician of the line may submit once everything is finished; until a
 * colleague has finished theirs the answer says how many lines remain
 * with other technicians.
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
      interpretation: true,
      parameter: { select: { name: true } },
      // value null + detected null = a reading the engine could not parse.
      units: { select: { value: true, detected: true } },
    },
  });
  const perUnit = sample.unitCount > 1;

  const byParameter = new Map(results.map((r) => [r.parameterId, r]));
  const missing: string[] = [];
  // The incomplete lines that belong to other technicians — mine come first
  // in the message, since they are the ones I can finish.
  const foreign: string[] = [];

  for (const line of sample.parameters) {
    const { parameter } = line;
    const result = byParameter.get(parameter.id);
    if (
      !result?.value ||
      result.workStatus === "EN_COURS" ||
      result.interpretation === "INCOMPLET" ||
      (perUnit && result.units.length < sample.unitCount) ||
      result.units.some((u) => u.value === null && u.detected === null)
    ) {
      if (session.role === "TECHNICIEN" && !canEditParameter(sample, line, session.id)) {
        foreign.push(parameter.name);
      } else {
        missing.push(parameter.name);
      }
    }
  }

  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Paramètres incomplets : ${missing.join(", ")}.`,
        missing: [...missing, ...foreign],
      },
      { status: 400 }
    );
  }
  if (foreign.length > 0) {
    return NextResponse.json(
      {
        error: `Il reste ${foreign.length} paramètre${foreign.length > 1 ? "s" : ""} à d'autres techniciens : ${foreign.join(", ")}.`,
        missing: foreign,
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
      nonSatisfaisants: results.filter((r) => r.interpretation === "NON_SATISFAISANT").length,
    },
  });

  return NextResponse.json(updated);
}
