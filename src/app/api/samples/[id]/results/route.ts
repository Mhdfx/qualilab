import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadAssignedSample } from "@/lib/sample-access";
import { canTransition } from "@/lib/sample-status";
import {
  applyCalcFactor,
  formatLabValue,
  parseLabValue,
} from "@/lib/result-value";
import type { ResultWorkStatus } from "@/generated/prisma/enums";

const WORK_STATUSES: ResultWorkStatus[] = ["EN_COURS", "TERMINE", "ANOMALIE"];

type IncomingResult = {
  parameterId?: unknown;
  value?: unknown;
  note?: unknown;
  workStatus?: unknown;
  conform?: unknown;
};

/**
 * Saves the technician's bench entries — the "save as you go" step.
 *
 * Results may be entered over several sittings, so this accepts a partial
 * sheet and never forces the sample forward on its own. The first save moves
 * `RECU → EN_ANALYSE`, because work has visibly started.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("TECHNICIEN", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const loaded = await loadAssignedSample(id, session);
  if (loaded.error) return loaded.error;
  const sample = loaded.sample;

  if (sample.status !== "RECU" && sample.status !== "EN_ANALYSE") {
    return NextResponse.json(
      {
        error:
          "Les résultats ne peuvent plus être modifiés à ce stade du circuit.",
      },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { results } = (body ?? {}) as { results?: unknown };
  if (!Array.isArray(results)) {
    return NextResponse.json(
      { error: "Aucun résultat à enregistrer." },
      { status: 400 }
    );
  }

  // Only the parameters actually requested for this sample may be filled in.
  const allowed = new Map(
    sample.parameters.map(({ parameter }) => [parameter.id, parameter])
  );

  const entries: {
    parameterId: string;
    value: string | null;
    rawValue: string | null;
    numericValue: number | null;
    unit: string | null;
    threshold: string | null;
    conform: boolean | null;
    workStatus: ResultWorkStatus;
    note: string | null;
  }[] = [];

  for (const raw of results as IncomingResult[]) {
    const parameterId =
      typeof raw?.parameterId === "string" ? raw.parameterId : "";
    const parameter = allowed.get(parameterId);
    if (!parameter) {
      return NextResponse.json(
        { error: "Paramètre inconnu pour cet échantillon." },
        { status: 400 }
      );
    }

    const value = typeof raw.value === "string" ? raw.value.trim() : "";
    const note = typeof raw.note === "string" ? raw.note.trim() : "";
    const workStatus = WORK_STATUSES.includes(raw.workStatus as ResultWorkStatus)
      ? (raw.workStatus as ResultWorkStatus)
      : "EN_COURS";

    if (workStatus === "ANOMALIE" && !note) {
      return NextResponse.json(
        { error: `Une anomalie doit être décrite (${parameter.name}).` },
        { status: 400 }
      );
    }

    // The value is stored as typed and as a number: the alert compares
    // figures. A calcFactor (dilution) turns the bench reading into the final
    // value; the raw entry is kept alongside so nothing is lost.
    const parsed = value
      ? applyCalcFactor(parseLabValue(value), parameter.calcFactor)
      : { numeric: null };
    const transformed =
      parameter.calcFactor !== 1 && value !== "" && parsed.numeric !== null;

    entries.push({
      parameterId,
      value: transformed ? formatLabValue(parsed.numeric!) : value || null,
      rawValue: transformed ? value : null,
      numericValue: parsed.numeric,
      unit: parameter.unit,
      threshold: parameter.threshold,
      conform: typeof raw.conform === "boolean" ? raw.conform : null,
      workStatus,
      note: note || null,
    });
  }

  const now = new Date();

  await prisma.$transaction(
    entries.map((entry) =>
      prisma.result.upsert({
        where: {
          sampleId_parameterId: {
            sampleId: sample.id,
            parameterId: entry.parameterId,
          },
        },
        create: {
          sampleId: sample.id,
          ...entry,
          enteredById: session.id,
          enteredAt: now,
        },
        update: {
          ...entry,
          enteredById: session.id,
          enteredAt: now,
        },
      })
    )
  );

  // Starting to record results is what puts a sample "en analyse".
  let status = sample.status;
  if (sample.status === "RECU") {
    const transition = canTransition("RECU", "EN_ANALYSE", session.role);
    if (transition.ok) {
      await prisma.sample.update({
        where: { id: sample.id },
        data: { status: "EN_ANALYSE" },
      });
      status = "EN_ANALYSE";

      await logAudit({
        actorId: session.id,
        action: "SAMPLE_ANALYSIS_STARTED",
        entity: "Sample",
        entityId: sample.id,
        metadata: { from: "RECU", to: "EN_ANALYSE", code: sample.code },
      });
    }
  }

  await logAudit({
    actorId: session.id,
    action: "RESULTS_SAVED",
    entity: "Sample",
    entityId: sample.id,
    metadata: { code: sample.code, count: entries.length },
  });

  return NextResponse.json({ status, saved: entries.length });
}
