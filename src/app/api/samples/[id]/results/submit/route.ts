import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadAssignedSample } from "@/lib/sample-access";
import { canTransition } from "@/lib/sample-status";
import type { SampleStatus } from "@/generated/prisma/enums";
import { TAKE_MESSAGES, canEnterParameter } from "@/lib/bench-access";
import { lockTakeState } from "@/lib/bench-take-server";
import { awaitsManualConformity } from "@/lib/bench-reading";
import { effectiveFactor } from "@/lib/dilution";

/**
 * Submits the completed sheet to quality validation:
 * `EN_ANALYSE → RESULTATS_SAISIS`.
 *
 * A sheet can only leave the bench once every requested parameter has been
 * answered — a missing line would reach the validateur as a silent gap. A
 * germ read per unit (CRITERES.md) must have every unit read: an
 * « Incomplet » verdict stays on the bench — and so must any parameter of a
 * sample taken on several units with a repetition left blank or typed in a
 * notation the engine cannot read. A line judged against the parameter's own
 * limit whose reading asks the technician for « Conforme » / « Non
 * conforme » (« Présence », a « > x » below the limit…) stays too until the
 * choice is stored: the screen keeps « Soumettre » closed, and this route
 * checks it again with the screen's own rule (`awaitsManualConformity`).
 *
 * Only a sample somebody took leaves the bench (PROGRAMME.md §10): its
 * holder submits it — the sheet saves first, and a first typed result takes
 * a free sample — and the admin may submit it in their place. A free one is
 * refused (409), so every submitted sample names its analyst; a colleague's
 * is refused (403). On a line a legacy programme handed parameter by
 * parameter, every parameter must be done whoever holds it; until a
 * colleague has finished theirs the answer says how many lines remain with
 * other technicians.
 *
 * Every check runs under the Sample row lock, like the save, the take and
 * « Libérer »: nothing can free the sample, change its programme or empty
 * its sheet between the checks and the status change.
 */
type Outcome =
  | { refusal: { status: 400 | 403 | 404 | 409; error: string; missing?: string[] } }
  | {
      from: SampleStatus;
      code: string;
      parameters: number;
      anomalies: number;
      nonConformes: number;
      nonSatisfaisants: number;
    };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("TECHNICIEN", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  // The quick answers first (missing, a colleague's, held at reception);
  // everything is decided again under the lock below.
  const loaded = await loadAssignedSample(id, session);
  if (loaded.error) return loaded.error;

  const outcome: Outcome = await prisma.$transaction(async (tx) => {
    const locked = await lockTakeState(tx, id);
    if (!locked) return { refusal: { status: 404, error: "Échantillon introuvable." } };
    if (locked.technicianId === null && !locked.heldByParameter) {
      return { refusal: { status: 409, error: TAKE_MESSAGES.submitUnclaimed } };
    }
    if (
      session.role === "TECHNICIEN" &&
      locked.technicianId !== session.id &&
      !locked.parameterHolderIds.includes(session.id)
    ) {
      return { refusal: { status: 403, error: TAKE_MESSAGES.heldByOther(locked.holderName ?? "un collègue") } };
    }
    const transition = canTransition(locked.status, "RESULTATS_SAISIS", session.role);
    if (!transition.ok) return { refusal: { status: 409, error: transition.error } };

    // Read after the lock: the programme and the readings as they are now.
    const lines = await tx.sampleParameter.findMany({
      where: { sampleId: id },
      select: {
        technicianId: true,
        // The programmed dilution, the factor and the limit the reading is judged with.
        dilutionFactor: true,
        parameter: { select: { id: true, name: true, limitValue: true, calcFactor: true } },
      },
    });
    const results = await tx.result.findMany({
      where: { sampleId: id },
      select: {
        parameterId: true,
        value: true,
        rawValue: true,
        workStatus: true,
        conform: true,
        interpretation: true,
        criterion: true,
        // value null + detected null = a reading the engine could not parse.
        units: { select: { unitIndex: true, rawValue: true, value: true, detected: true } },
      },
    });
    const perUnit = locked.unitCount > 1;
    const byParameter = new Map(results.map((r) => [r.parameterId, r]));
    const bench = { technicianId: locked.technicianId, parameters: lines };
    const missing: string[] = [];
    // The incomplete lines that belong to other technicians — mine come first
    // in the message, since they are the ones I can finish.
    const foreign: string[] = [];

    for (const line of lines) {
      const { parameter } = line;
      const result = byParameter.get(parameter.id);
      if (
        !result?.value ||
        result.workStatus === "EN_COURS" ||
        result.interpretation === "INCOMPLET" ||
        (perUnit && result.units.length < locked.unitCount) ||
        result.units.some((u) => u.value === null && u.detected === null) ||
        awaitsManualConformity(result, {
          unitCount: locked.unitCount,
          factor: effectiveFactor(line.dilutionFactor, parameter.calcFactor),
          limitValue: parameter.limitValue,
        })
      ) {
        if (session.role === "TECHNICIEN" && !canEnterParameter(bench, line, session.id)) {
          foreign.push(parameter.name);
        } else {
          missing.push(parameter.name);
        }
      }
    }

    if (missing.length > 0) {
      return {
        refusal: {
          status: 400,
          error: `Paramètres incomplets : ${missing.join(", ")}.`,
          missing: [...missing, ...foreign],
        },
      };
    }
    if (foreign.length > 0) {
      return {
        refusal: {
          status: 400,
          error: `Il reste ${foreign.length} paramètre${foreign.length > 1 ? "s" : ""} à d'autres techniciens : ${foreign.join(", ")}.`,
          missing: foreign,
        },
      };
    }

    // Guarded by the status as well, though the lock already holds it: only
    // the request that moved the sample is answered 200 and journalled.
    const moved = await tx.sample.updateMany({
      where: { id, status: locked.status },
      data: { status: "RESULTATS_SAISIS" },
    });
    if (moved.count === 0) {
      return {
        refusal: {
          status: 409,
          error: "Cet échantillon vient d'être soumis ou de changer d'état : rechargez la fiche.",
        },
      };
    }
    return {
      from: locked.status,
      code: locked.code,
      parameters: lines.length,
      anomalies: results.filter((r) => r.workStatus === "ANOMALIE").length,
      nonConformes: results.filter((r) => r.conform === false).length,
      nonSatisfaisants: results.filter((r) => r.interpretation === "NON_SATISFAISANT").length,
    };
  });

  if ("refusal" in outcome) {
    const { status, ...body } = outcome.refusal;
    return NextResponse.json(body, { status });
  }

  await logAudit({
    actorId: session.id,
    action: "RESULTS_SUBMITTED",
    entity: "Sample",
    entityId: id,
    metadata: {
      from: outcome.from,
      to: "RESULTATS_SAISIS",
      code: outcome.code,
      parameters: outcome.parameters,
      anomalies: outcome.anomalies,
      nonConformes: outcome.nonConformes,
      nonSatisfaisants: outcome.nonSatisfaisants,
    },
  });

  return NextResponse.json({ id, code: outcome.code, status: "RESULTATS_SAISIS" as const });
}
