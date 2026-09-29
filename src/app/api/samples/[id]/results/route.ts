import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadAssignedSample } from "@/lib/sample-access";
import { canTransition } from "@/lib/sample-status";
import { loadBenchPlans } from "@/lib/bench-plan";
import {
  applyUnitFactor,
  judgeUnits,
  parseUnitReading,
  summariseReadings,
  verdictToConform,
  type UnitReading,
} from "@/lib/interpretation";
import {
  applyCalcFactor,
  formatLabValue,
  parseLabValue,
} from "@/lib/result-value";
import type { Interpretation, ResultWorkStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

const WORK_STATUSES: ResultWorkStatus[] = ["EN_COURS", "TERMINE", "ANOMALIE"];
const MAX_UNIT_TEXT = 40;

type IncomingResult = {
  parameterId?: unknown;
  value?: unknown;
  units?: unknown;
  note?: unknown;
  workStatus?: unknown;
  conform?: unknown;
};

type Entry = {
  parameterId: string;
  value: string | null;
  rawValue: string | null;
  numericValue: number | null;
  unit: string | null;
  threshold: string | null;
  conform: boolean | null;
  workStatus: ResultWorkStatus;
  note: string | null;
  interpretation: Interpretation | null;
  informalInterpretation: Interpretation | null;
  /** The plan, frozen with the result for the report (slice C). */
  criterion: Prisma.InputJsonValue | typeof Prisma.DbNull;
  normVersionId: string | null;
  /** The readings per unit (R1 … Rn); null = single value. */
  units: UnitReading[] | null;
};

/**
 * Saves the technician's bench entries — the "save as you go" step.
 *
 * Results may be entered over several sittings, so this accepts a partial
 * sheet and never forces the sample forward on its own. The first save moves
 * `RECU → EN_ANALYSE`, because work has visibly started.
 *
 * A germ with a criterion (the sample's product type, CRITERES.md) is read
 * per unit, and so is every parameter of a sample taken on several units
 * (RETOUR-LABO-29-09.md, slice B — histamine, n = 9): the readings are
 * stored one by one, the verdict is computed here with the same engine the
 * screen used, and the line's `value` is the worst unit — what the alerts
 * and the old columns keep reading. Fewer units than the plan's n: no
 * official verdict, an indicative one for the e-mail.
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
  if (results.length > allowed.size) {
    return NextResponse.json({ error: "Trop de résultats pour cet échantillon." }, { status: 400 });
  }
  const bench = await loadBenchPlans(sample.id);
  const seen = new Set<string>();

  const entries: Entry[] = [];

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
    // The same germ twice in one payload would write itself over silently.
    if (seen.has(parameterId)) {
      return NextResponse.json(
        { error: `Le paramètre ${parameter.name} figure deux fois dans la saisie.` },
        { status: 400 }
      );
    }
    seen.add(parameterId);

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

    const plan = bench.plans.get(parameterId);
    if (plan || bench.unitCount > 1) {
      // ---- one reading per unit taken: R1 … Rn --------------------------------
      const typed = Array.isArray(raw.units) ? raw.units : [];
      const units: string[] = [];
      for (let i = 0; i < Math.max(1, bench.unitCount); i += 1) {
        const text = typeof typed[i] === "string" ? (typed[i] as string).trim() : "";
        if (text.length > MAX_UNIT_TEXT) {
          return NextResponse.json(
            { error: `Lecture trop longue pour ${parameter.name}, R${i + 1} (${MAX_UNIT_TEXT} caractères max).` },
            { status: 400 }
          );
        }
        units.push(text);
      }
      // A dilution factor applies to a unit exactly as to a single value.
      const readings = units.map((u) => applyUnitFactor(parseUnitReading(u), parameter.calcFactor));
      const summary = summariseReadings(readings);
      const typedAny = readings.some((r) => r.kind !== "empty");
      if (plan) {
        const judged = judgeUnits(plan.plan, readings);
        entries.push({
          parameterId,
          value: summary.value,
          rawValue: null,
          numericValue: summary.numeric,
          unit: plan.unit ?? parameter.unit,
          threshold: plan.label,
          conform: verdictToConform(judged.official?.verdict ?? null),
          workStatus,
          note: note || null,
          interpretation: typedAny ? judged.official?.verdict ?? null : null,
          informalInterpretation: typedAny ? judged.informal?.verdict ?? null : null,
          criterion: { ...plan.plan },
          normVersionId: plan.normVersionId,
          units: readings,
        });
      } else {
        // No criterion: the worst unit against the parameter's own limit,
        // exactly like a single value (the screen computes it the same way).
        entries.push({
          parameterId,
          value: summary.value,
          rawValue: null,
          numericValue: summary.numeric,
          unit: parameter.unit,
          threshold: parameter.threshold,
          conform: typeof raw.conform === "boolean" ? raw.conform : null,
          workStatus,
          note: note || null,
          interpretation: null,
          informalInterpretation: null,
          criterion: Prisma.DbNull,
          normVersionId: null,
          units: readings,
        });
      }
      continue;
    }

    // ---- single value, as before -------------------------------------------
    const value = typeof raw.value === "string" ? raw.value.trim() : "";

    // The value is stored as typed and as a number: the alert compares
    // figures. A calcFactor (dilution) turns the bench reading into the final
    // value; the raw entry is kept alongside so nothing is lost. Only a
    // genuine count is rewritten — « Absence » and « < 10 » stay as typed
    // (their numeric 0 × factor is still 0), otherwise the report would print
    // "0" where the technician wrote « Absence ».
    if (value.length > 191) {
      return NextResponse.json(
        { error: `Valeur trop longue pour ${parameter.name} (191 caractères max).` },
        { status: 400 }
      );
    }
    const parsed = value
      ? applyCalcFactor(parseLabValue(value), parameter.calcFactor)
      : { numeric: null, kind: "unreadable" as const };
    const transformed =
      parameter.calcFactor !== 1 && parsed.kind === "number" && parsed.numeric !== null;

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
      interpretation: null,
      informalInterpretation: null,
      criterion: Prisma.DbNull,
      normVersionId: null,
      units: null,
    });
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      const { units, ...data } = entry;
      const result = await tx.result.upsert({
        where: {
          sampleId_parameterId: {
            sampleId: sample.id,
            parameterId: entry.parameterId,
          },
        },
        create: {
          sampleId: sample.id,
          ...data,
          enteredById: session.id,
          enteredAt: now,
        },
        update: {
          ...data,
          enteredById: session.id,
          enteredAt: now,
        },
        select: { id: true },
      });
      // The readings are replaced whole: the grid on screen is the truth.
      await tx.resultUnit.deleteMany({ where: { resultId: result.id } });
      const rows = (units ?? [])
        .map((reading, index) => ({ reading, index }))
        .filter(({ reading }) => reading.kind !== "empty")
        .map(({ reading, index }) => ({
          resultId: result.id,
          unitIndex: index + 1,
          rawValue: reading.raw,
          value: reading.value,
          detected: reading.detected,
        }));
      if (rows.length > 0) await tx.resultUnit.createMany({ data: rows });
    }
  });

  // Starting to record results is what puts a sample "en analyse".
  let status = sample.status;
  if (sample.status === "RECU") {
    const transition = canTransition("RECU", "EN_ANALYSE", session.role);
    if (transition.ok) {
      await prisma.sample
        .update({
          where: { id: sample.id, status: "RECU" },
          data: { status: "EN_ANALYSE" },
        })
        .catch((error) => {
          // A concurrent save already moved it: nothing left to do.
          if ((error as { code?: string }).code !== "P2025") throw error;
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
    metadata: {
      code: sample.code,
      count: entries.length,
      verdicts: Object.fromEntries(entries.filter((e) => e.interpretation).map((e) => [e.parameterId, e.interpretation])),
      indicative: Object.fromEntries(entries.filter((e) => e.informalInterpretation).map((e) => [e.parameterId, e.informalInterpretation])),
    },
  });

  return NextResponse.json({
    status,
    saved: entries.length,
    verdicts: Object.fromEntries(entries.map((e) => [e.parameterId, e.interpretation])),
  });
}
