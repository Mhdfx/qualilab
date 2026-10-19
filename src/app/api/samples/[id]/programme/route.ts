import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { SAMPLE_STATUS_LABELS } from "@/lib/labels";
import { billedAnalysesChanged, billedAnalysesNotice, heldInvoiceLabel, isLockConflict } from "@/lib/billing";
import { heldInvoices } from "@/lib/billing-hold";
import { TYPED_RESULT_WHERE } from "@/lib/bench-access";
import { canTransition, PROGRAMMABLE_STATUSES } from "@/lib/sample-status";
import {
  programmeParameterRows,
  resolveProgrammeNature,
  validateProgramme,
  type ProgrammeContext,
} from "@/lib/programme-input";
import {
  loadProgrammeNatures,
  loadProgrammeReferential,
  loadProgrammeSample,
  normVersionsForParameters,
  programmeNatureContext,
  programmeOf,
  serializeProgramme,
} from "@/lib/programme-referential";

/** The guarded write found the line moved meanwhile: rolls back, then the 409. */
class StaleProgramme extends Error {}

/**
 * The programme d'analyse of a line (PROGRAMME.md §5).
 *
 * GET — the line, its current programme and the referential the fiche
 * needs. Only the responsable des paramètres and the admin, who write it,
 * read it here: the referential carries every famille with its criteria,
 * the profiles and the catalogue prices, and no bench screen calls this
 * route — the bench reads the programme from its own pages (RETOUR-LABO-14-10
 * RP3c: « le technicien n'a pas les droits pour changer les paramètres »;
 * technician-guards.test.ts). The line carries who took it at the bench
 * (`technician`, `assignedAt`), read-only.
 *
 * `?natureId=` computes the referential for another nature the line may
 * take (RETOUR-LABO-06-10.md §5, V3 — Q49 by default: an active nature of
 * the same family; since 16/10, Q129, also « Autres analyses » and back —
 * `programmeNatureFamilies`): its parameters, profiles and prices. The line
 * itself is unchanged until a PUT names that nature.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await loadProgrammeSample(id);
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

  const requested = new URL(request.url).searchParams.get("natureId") || null;
  const natures = await loadProgrammeNatures(sample, requested);
  const nature = resolveProgrammeNature({ natureId: requested }, programmeNatureContext(sample, natures));
  if (!nature.ok) return NextResponse.json({ error: nature.error }, { status: 400 });

  const referential = await loadProgrammeReferential(sample, { natureId: nature.natureId, natures });
  return NextResponse.json({ ...serializeProgramme(sample), referential });
}

/** The parameter ids a request names, to load their names in the same query. */
function namedParameters(input: unknown): string[] {
  const list = (input as { parameterIds?: unknown } | null)?.parameterIds;
  if (!Array.isArray(list)) return [];
  return [...new Set(list.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

/**
 * PUT — writes the programme: a draft (the line stays RECU), the
 * confirmation (RECU → PROGRAMME, `programmedAt`, `programmedById`,
 * journal SAMPLE_PROGRAMMED) or an edit of a confirmed programme (journal
 * SAMPLE_PROGRAMME_UPDATED). The `SampleParameter` rows are replaced as a
 * block — nothing typed can exist before EN_ANALYSE; the empty result row
 * of an analysis removed goes with it.
 *
 * The programme assigns nobody (« prise en charge libre », 13/10 —
 * PROGRAMME.md §10): confirming puts the line in the shared « À prendre »
 * list of the bench. `Sample.technicianId` / `assignedAt` are written only
 * by the bench — « Prendre en charge » / « Libérer » (`…/take`) and the
 * first result typed (`…/results`) — never here, so an edit of a line a
 * technician already took (still PROGRAMME) leaves it with them. A
 * `technicianId` in the request is ignored (`validateProgramme`). A legacy
 * per-analysis technician (before 13/10) stays on the analyses kept
 * (`programmeParameterRows`), read under the row lock.
 *
 * The request may name another nature of the line's family (Q49), or of
 * « Autres analyses » and back (Q129): the line then takes it in the same
 * transaction — `Sample.natureId` and `Sample.type` (its category) — and
 * the analyses are checked against the new category. `code` and
 * `controlCode` never change. The journal line carries the nature before
 * and after.
 *
 * A confirmed programme is billable: an invoice may already hold the line.
 * A change of its analyses (or of its category) never reaches that invoice
 * by itself — the journal names it (`billedOn`, read by the invoice sheet)
 * and the answer carries `billing.notice` for the sheet to say so.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await loadProgrammeSample(id);
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
  if (!PROGRAMMABLE_STATUSES.includes(sample.status)) {
    return NextResponse.json(
      { error: `Le programme ne peut plus être modifié : l'échantillon est « ${SAMPLE_STATUS_LABELS[sample.status]} ».` },
      { status: 409 }
    );
  }
  // Held at reception — « en attente du client » (A9), or another hold: the
  // release (reception or admin, which needs the line still RECU) comes
  // before any programme.
  if (sample.analysisBlocked) {
    return NextResponse.json(
      { error: "Cet échantillon est bloqué en réception : il doit être libéré depuis « Bloqués » de la réception avant la programmation." },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as { productTypeId?: unknown; natureId?: unknown };
  const requestedParameterIds = namedParameters(body);

  // The nature first: it decides the category whose parameters are offered.
  // `validateProgramme` resolves it again and refuses what is not allowed.
  const natures = await loadProgrammeNatures(
    sample,
    typeof input.natureId === "string" && input.natureId ? input.natureId : null
  );
  const natureCtx = programmeNatureContext(sample, natures);
  const resolved = resolveProgrammeNature(body, natureCtx);
  const newNature = resolved.ok ? resolved.changed : null;
  const category = newNature ? newNature.legacyType : sample.type;

  // The referential the rules are checked against — only what the request
  // names, plus the names of the analyses it asks for (to say which is refused).
  const [parameters, productTypes] = await Promise.all([
    prisma.analysisParameter.findMany({
      where:
        requestedParameterIds.length > 0
          ? { OR: [{ category }, { id: { in: requestedParameterIds } }] }
          : { category },
      select: { id: true, name: true, category: true },
    }),
    typeof input.productTypeId === "string" && input.productTypeId
      ? prisma.productType.findMany({ where: { id: input.productTypeId }, select: { id: true, clientId: true, active: true } })
      : Promise.resolve([]),
  ]);
  const allowedParameterIds = parameters.filter((p) => p.category === category).map((p) => p.id);
  const normVersions = await normVersionsForParameters(
    allowedParameterIds,
    sample.parameters.map((p) => ({ parameterId: p.parameterId, normVersionId: p.normVersionId }))
  );

  const ctx: ProgrammeContext = {
    status: sample.status,
    clientId: sample.clientId,
    ...natureCtx,
    productTypes,
    parameterIds: allowedParameterIds,
    parameterNames: Object.fromEntries(parameters.map((p) => [p.id, p.name])),
    normVersionIds: Object.fromEntries(
      Object.entries(normVersions).map(([parameterId, options]) => [parameterId, options.map((o) => o.id)])
    ),
  };
  const checked = validateProgramme(body, ctx);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.httpStatus });
  const value = checked.value;
  // The validator resolved the same nature: a change is exactly `newNature`.
  const natureChange = value.natureId !== sample.natureId ? newNature : null;

  const confirming = sample.status === "RECU" && value.confirm;
  if (confirming) {
    const transition = canTransition("RECU", "PROGRAMME", session.role);
    if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: 403 });
  }

  const now = new Date();
  const before = programmeOf(sample);

  try {
    await prisma.$transaction(async (tx) => {
      // Two saves of the same sheet are serialised on the sample row: both
      // clearing then re-inserting its parameters deadlocked (a 500 for the
      // second « Confirmer »); now the second waits, then meets the guard.
      // The bench's writers (take, « Libérer », the first result) lock the
      // same row first: the order is always Sample, then SampleParameter.
      await tx.$queryRaw`SELECT \`id\` FROM \`Sample\` WHERE \`id\` = ${id} FOR UPDATE`;
      // The legacy per-analysis technicians, read now — after the lock, so
      // a « Libérer » committed meanwhile is seen and not undone (the
      // snapshot loaded before the transaction would resurrect them).
      const legacy = await tx.sampleParameter.findMany({
        where: { sampleId: id, technicianId: { not: null } },
        select: { parameterId: true, technicianId: true },
      });
      await tx.sampleParameter.deleteMany({ where: { sampleId: id } });
      if (value.parameters.length > 0) {
        await tx.sampleParameter.createMany({ data: programmeParameterRows(id, value.parameters, legacy) });
      }
      // A programmed line may now carry result rows with nothing typed in
      // them — an « Enregistrer » at the bench that did not start the
      // analysis (anything typed moves the line to EN_ANALYSE, which this
      // route refuses). An analysis that leaves the programme takes its
      // empty row with it; a typed row is never touched here.
      await tx.result.deleteMany({
        where: { sampleId: id, parameterId: { notIn: value.parameterIds }, NOT: TYPED_RESULT_WHERE },
      });
      const saved = await tx.sample.updateMany({
        // The status in the guard doubles as optimistic concurrency: a line
        // that moved meanwhile (bench started, cancelled) gets a clean 409.
        // The nature in the guard does the same for a nature changed meanwhile.
        // `updateMany` re-checks it in the UPDATE and counts the rows. The
        // holder is deliberately not in it: a « Prendre en charge » landing
        // between the load and this save is no conflict — the two writes
        // touch different columns.
        where: { id, status: sample.status, natureId: sample.natureId },
        data: {
          // Q49: the fine nature, and the category the line is filed under.
          ...(natureChange ? { natureId: natureChange.id, type: natureChange.legacyType } : {}),
          productTypeId: value.productTypeId,
          unitCount: value.unitCount,
          testPortion: value.testPortion,
          // No `technicianId` / `assignedAt`: only the bench writes them.
          priority: value.priority,
          dueAt: value.dueAt,
          programmeNote: value.programmeNote,
          ...(confirming ? { status: "PROGRAMME", programmedAt: now, programmedById: session.id } : {}),
        },
      });
      if (saved.count === 0) throw new StaleProgramme();
    });
  } catch (error) {
    if (error instanceof StaleProgramme || isLockConflict(error)) {
      return NextResponse.json(
        { error: "L'échantillon a changé d'état entre-temps : rechargez la fiche." },
        { status: 409 }
      );
    }
    console.error("[programme] failed", { sampleId: id, error });
    return NextResponse.json({ error: "Impossible d'enregistrer le programme." }, { status: 500 });
  }

  const updated = await loadProgrammeSample(id);
  if (!updated) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
  // Already billed? Only an edit of a confirmed programme can be.
  const held =
    !confirming &&
    sample.status === "PROGRAMME" &&
    billedAnalysesChanged(
      { parameterIds: before.parameterIds, type: sample.type },
      { parameterIds: updated.parameters.map((p) => p.parameterId), type: updated.type }
    )
      ? (await heldInvoices([id])).get(id) ?? null
      : null;

  await logAudit({
    actorId: session.id,
    action: confirming ? "SAMPLE_PROGRAMMED" : "SAMPLE_PROGRAMME_UPDATED",
    entity: "Sample",
    entityId: id,
    metadata: {
      code: sample.code,
      controlCode: sample.controlCode,
      from: sample.status,
      to: updated.status,
      // A save on a received line that does not confirm is a draft.
      draft: !confirming && sample.status === "RECU",
      // Q49: the nature changed on the fiche, readable without a lookup.
      nature: natureChange
        ? {
            before: { id: sample.nature.id, code: sample.nature.code, label: sample.nature.label, type: sample.type },
            after: { id: updated.nature.id, code: updated.nature.code, label: updated.nature.label, type: updated.type },
          }
        : undefined,
      // Who held the line at the bench when its programme was written —
      // context only: the programme assigns nobody.
      heldBy: updated.technician ? { id: updated.technician.id, name: updated.technician.name } : null,
      before,
      after: programmeOf(updated),
      // The invoice that bills the former list (« Analyses modifiées après facturation »).
      billedOn: held ? { invoiceId: held.invoiceId, number: heldInvoiceLabel(held) } : undefined,
    },
  });

  return NextResponse.json({
    ...serializeProgramme(updated),
    ...(held ? { billing: { invoice: heldInvoiceLabel(held), notice: billedAnalysesNotice(held) } } : {}),
  });
}
