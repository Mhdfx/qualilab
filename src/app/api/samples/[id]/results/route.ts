import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { loadAssignedSample } from "@/lib/sample-access";
import { canTransition } from "@/lib/sample-status";
import { loadBenchPlans } from "@/lib/bench-plan";
import { TYPED_RESULT_WHERE, canEnterParameter, hasTypedResult } from "@/lib/bench-access";
import { lockTakeState } from "@/lib/bench-take-server";
import { effectiveFactor } from "@/lib/dilution";
import { benchUnit } from "@/lib/bench-reading";
import {
  applyUnitFactor,
  judgeUnits,
  parseUnitReading,
  suggestUnitsConformity,
  summariseReadings,
  verdictToConform,
  type UnitReading,
} from "@/lib/interpretation";
import { NOT_DONE_MESSAGE, benchConformity, isNotDoneText, singleValueEntry, suggestConformity } from "@/lib/result-value";
import type { Interpretation, ResultWorkStatus } from "@/generated/prisma/enums";
import { Prisma } from "@/generated/prisma/client";

const WORK_STATUSES: ResultWorkStatus[] = ["EN_COURS", "TERMINE", "ANOMALIE"];
/** A save is a sheet's worth of lines — a ceiling against a flooded body. */
const MAX_LINES = 500;
/** The sheet on screen is older than the programme: the form reloads on 409. */
const PROGRAMME_CHANGED = "Le programme d'analyse de cet échantillon a changé : rechargez la fiche.";
const MAX_UNIT_TEXT = 40;

/**
 * « NE », « non effectué »… typed as a result (16/10, Q91): the report
 * never says an analysis was not done — it is withdrawn from the programme
 * by the responsable des paramètres (« Corriger les analyses »), and the
 * other readings stay.
 */
function notDone(parameterName: string, typed: string) {
  return NextResponse.json(
    { error: `${parameterName} : « ${typed} » n'est pas un résultat. ${NOT_DONE_MESSAGE}` },
    { status: 400 }
  );
}

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
 * sheet and never forces the sample forward on its own. The first save with
 * something typed moves `PROGRAMME → EN_ANALYSE`, because work has visibly
 * started; a line still waiting for its programme d'analyse is refused
 * (PROGRAMME.md §1).
 *
 * Prise en charge libre (PROGRAMME.md §10): a technician types on the
 * samples they took, and on a free one — their first typed result takes it
 * (holder and time, journalled SAMPLE_TAKEN « implicit »). A sample a
 * colleague holds is refused (403 before, 409 « Déjà pris » when the
 * colleague took it during the save). A line a legacy programme handed
 * parameter by parameter keeps its rule: each technician types their own.
 * The admin stands in on any sample and never takes one. The dilution
 * programmed for this sample replaces the parameter's catalogue factor
 * when present.
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

  // Only a programmed line may be opened at the bench: a received one
  // waits for the responsable des paramètres.
  if (sample.status === "PRELEVE" || sample.status === "RECU") {
    return NextResponse.json(
      {
        error:
          "En attente de programmation : le responsable des paramètres doit confirmer le programme d'analyse avant la saisie.",
      },
      { status: 409 }
    );
  }
  if (sample.status !== "PROGRAMME" && sample.status !== "EN_ANALYSE") {
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
  const allowed = new Map(sample.parameters.map((line) => [line.parameter.id, line]));
  // A line for an analysis the programme has since removed is answered 409
  // below, line by line — not swallowed by this ceiling (duplicates are
  // refused below too).
  if (results.length > MAX_LINES) {
    return NextResponse.json({ error: "Trop de résultats pour cet échantillon." }, { status: 400 });
  }
  const bench = await loadBenchPlans(sample.id);
  const seen = new Set<string>();

  const entries: Entry[] = [];

  for (const raw of results as IncomingResult[]) {
    const parameterId =
      typeof raw?.parameterId === "string" ? raw.parameterId : "";
    const line = allowed.get(parameterId);
    if (!line) {
      // The programme can change while a taken sample is still « Programmé »:
      // the sheet on screen is stale, not wrong (the form reloads on 409).
      return NextResponse.json({ error: PROGRAMME_CHANGED }, { status: 409 });
    }
    const parameter = line.parameter;
    // The same germ twice in one payload would write itself over silently.
    if (seen.has(parameterId)) {
      return NextResponse.json(
        { error: `Le paramètre ${parameter.name} figure deux fois dans la saisie.` },
        { status: 400 }
      );
    }
    seen.add(parameterId);
    // Mine, or a free sample's; a legacy line handed to a colleague stays theirs.
    if (session.role === "TECHNICIEN" && !canEnterParameter(sample, line, session.id)) {
      return NextResponse.json(
        {
          error: `Le paramètre ${parameter.name} est réservé à ${line.technician?.name ?? "un autre technicien"} : vous ne pouvez pas le saisir.`,
          parameterId,
        },
        { status: 403 }
      );
    }
    // The programmed dilution of this sample, else the catalogue's factor.
    const factor = effectiveFactor(line.dilutionFactor, parameter.calcFactor);

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
    // A TEXT column: a longer note was refused by the database (500).
    if (note.length > 5000) {
      return NextResponse.json(
        { error: `La note est trop longue pour ${parameter.name} (5 000 caractères max).` },
        { status: 400 }
      );
    }

    const plan = bench.plans.get(parameterId);
    // The sheet reads a line per unit or as one value exactly as the
    // programme does; a line sent the other way comes from a sheet opened
    // before the programme changed (units, product type) — nothing it holds
    // would be stored, so it is refused rather than saved empty.
    if (Boolean(plan) || bench.unitCount > 1 ? !Array.isArray(raw.units) : Array.isArray(raw.units)) {
      return NextResponse.json({ error: PROGRAMME_CHANGED }, { status: 409 });
    }
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
        if (isNotDoneText(text)) return notDone(parameter.name, text);
        units.push(text);
      }
      // A dilution factor applies to a unit exactly as to a single value.
      const readings = units.map((u) => applyUnitFactor(parseUnitReading(u), factor));
      const summary = summariseReadings(readings);
      const typedAny = readings.some((r) => r.kind !== "empty");
      if (plan) {
        const judged = judgeUnits(plan.plan, readings);
        entries.push({
          parameterId,
          value: summary.value,
          rawValue: null,
          numericValue: summary.numeric,
          unit: benchUnit(plan, parameter.unit),
          threshold: plan.label,
          conform: verdictToConform(judged.official?.verdict ?? null),
          workStatus,
          note: note || null,
          interpretation: typedAny ? judged.official?.verdict ?? null : null,
          informalInterpretation: typedAny ? judged.informal?.verdict ?? null : null,
          criterion: { ...plan.plan },
          // The method of the report: the programmed version, else the criterion's.
          normVersionId: line.normVersionId ?? plan.normVersionId,
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
          // The worst unit against the limit, as the screen computes it;
          // the technician's choice only where the screen asks for one.
          conform: benchConformity(suggestUnitsConformity(readings, parameter.limitValue), raw.conform),
          workStatus,
          note: note || null,
          interpretation: null,
          informalInterpretation: null,
          criterion: Prisma.DbNull,
          normVersionId: line.normVersionId,
          units: readings,
        });
      }
      continue;
    }

    // ---- single value, as before -------------------------------------------
    const value = typeof raw.value === "string" ? raw.value.trim() : "";

    // The value is stored as typed and as a number: the alert compares
    // figures. A factor (the programmed dilution, else the parameter's
    // calcFactor) turns the bench reading into the final value, and the
    // lab's shorthand « 3(-2) » prints in its notation (« 3.10² », « 0(-1) »
    // → « < 10 »), as on the unit grid; the raw entry is kept alongside so
    // nothing is lost. Only a genuine count, or the bound of « > x », is
    // rewritten — « Absence », « < 10 » and « Indénombrable » stay as typed
    // (their numeric 0 × factor is still 0, or there is none), otherwise the
    // report would print "0" where the technician wrote « Absence ».
    if (value.length > 191) {
      return NextResponse.json(
        { error: `Valeur trop longue pour ${parameter.name} (191 caractères max).` },
        { status: 400 }
      );
    }
    if (isNotDoneText(value)) return notDone(parameter.name, value);
    const stored = singleValueEntry(value, factor);
    const parsed = stored.parsed;

    entries.push({
      parameterId,
      value: stored.value,
      rawValue: stored.rawValue,
      numericValue: parsed.numeric,
      unit: parameter.unit,
      threshold: parameter.threshold,
      // The final value against the limit, as the screen computes it; the
      // technician's choice only where the screen asks for one.
      conform: benchConformity(suggestConformity(parsed.numeric, parameter.limitValue, parsed.kind), raw.conform),
      workStatus,
      note: note || null,
      interpretation: null,
      informalInterpretation: null,
      criterion: Prisma.DbNull,
      normVersionId: line.normVersionId,
      units: null,
    });
  }

  const now = new Date();
  // Something typed (a value, a reading, a note, a step) — an « Enregistrer »
  // with nothing in it neither takes the sample nor starts its analysis.
  const typed = entries.some((entry) =>
    hasTypedResult({
      value: entry.value,
      note: entry.note,
      workStatus: entry.workStatus,
      unitCount: (entry.units ?? []).filter((reading) => reading.kind !== "empty").length,
    })
  );
  const startAllowed = canTransition("PROGRAMME", "EN_ANALYSE", session.role).ok;

  type Written =
    | { kind: "stale" }
    | { kind: "programme" }
    | { kind: "held"; holderName: string | null }
    | { kind: "ok"; took: boolean; started: boolean; status: typeof sample.status };
  const written: Written = await prisma.$transaction(async (tx) => {
    // Two saves of the same sheet (double click, two technicians on a free
    // sample) are serialised on the sample row: racing upserts of a first
    // reading and the clear-then-insert of the units deadlocked or collided
    // (500). The status and the holder are read again under the lock: a
    // sheet submitted meanwhile is no longer written, and a sample a
    // colleague took meanwhile is no longer mine to type on.
    const locked = await lockTakeState(tx, sample.id);
    if (!locked || (locked.status !== "PROGRAMME" && locked.status !== "EN_ANALYSE")) return { kind: "stale" };
    // The programme read again under the lock: an edit committed since the
    // reads above (analyses, dilutions, versions, units, product type) means
    // these entries were computed from the old one — refused, never stored.
    const programmed = await tx.sampleParameter.findMany({
      where: { sampleId: sample.id },
      select: { parameterId: true, dilutionFactor: true, normVersionId: true },
    });
    const programmedNow = new Map(programmed.map((line) => [line.parameterId, line]));
    const programmeChanged =
      locked.unitCount !== bench.unitCount ||
      locked.productTypeId !== (bench.productType?.id ?? null) ||
      programmed.length !== allowed.size ||
      [...allowed.values()].some((was) => {
        const is = programmedNow.get(was.parameterId);
        return (
          !is ||
          is.normVersionId !== was.normVersionId ||
          String(is.dilutionFactor ?? "") !== String(was.dilutionFactor ?? "")
        );
      });
    if (programmeChanged) return { kind: "programme" };
    const free = locked.technicianId === null && !locked.heldByParameter;
    if (
      session.role === "TECHNICIEN" &&
      !free &&
      locked.technicianId !== session.id &&
      !locked.parameterHolderIds.includes(session.id)
    ) {
      return { kind: "held", holderName: locked.holderName };
    }
    // The first typed result of a technician on a free sample takes it — and
    // so does a save that rewrites readings already typed there (by the admin
    // standing in): whoever changes the readings answers for them.
    let took = false;
    const rewrites =
      session.role === "TECHNICIEN" && free && !typed
        ? (await tx.result.count({ where: { sampleId: sample.id, ...TYPED_RESULT_WHERE } })) > 0
        : false;
    if (session.role === "TECHNICIEN" && free && (typed || rewrites)) {
      const taken = await tx.sample.updateMany({
        where: { id: sample.id, technicianId: null },
        data: { technicianId: session.id, assignedAt: now },
      });
      took = taken.count > 0;
    }
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
    // Starting to record results is what puts a sample « en analyse » — in
    // the same transaction, so a programme edit cannot slip between the
    // readings and the status (it is refused once the line is EN_ANALYSE).
    // Only the save whose UPDATE changed the row journals the start.
    let started = false;
    if (locked.status === "PROGRAMME" && typed && startAllowed) {
      const moved = await tx.sample.updateMany({
        where: { id: sample.id, status: "PROGRAMME" },
        data: { status: "EN_ANALYSE" },
      });
      started = moved.count > 0;
    }
    return { kind: "ok", took, started, status: started ? "EN_ANALYSE" : locked.status };
  });
  if (written.kind === "stale") {
    return NextResponse.json(
      { error: "Les résultats ne peuvent plus être modifiés à ce stade du circuit." },
      { status: 409 }
    );
  }
  if (written.kind === "programme") {
    return NextResponse.json({ error: PROGRAMME_CHANGED }, { status: 409 });
  }
  if (written.kind === "held") {
    return NextResponse.json(
      { error: `Déjà pris par ${written.holderName ?? "un collègue"}.` },
      { status: 409 }
    );
  }

  if (written.took) {
    await logAudit({
      actorId: session.id,
      action: "SAMPLE_TAKEN",
      entity: "Sample",
      entityId: sample.id,
      metadata: { code: sample.code, controlCode: sample.controlCode, implicit: true },
    });
  }
  if (written.started) {
    await logAudit({
      actorId: session.id,
      action: "SAMPLE_ANALYSIS_STARTED",
      entity: "Sample",
      entityId: sample.id,
      metadata: { from: "PROGRAMME", to: "EN_ANALYSE", code: sample.code },
    });
  }
  const status = written.status;

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
    taken: written.took,
    verdicts: Object.fromEntries(entries.map((e) => [e.parameterId, e.interpretation])),
  });
}
