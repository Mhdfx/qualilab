import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { SAMPLE_STATUS_LABELS } from "@/lib/labels";
import { canTransition, PROGRAMMABLE_STATUSES } from "@/lib/sample-status";
import { resolveProgrammeNature, validateProgramme, type ProgrammeContext } from "@/lib/programme-input";
import {
  loadProgrammeNatures,
  loadProgrammeReferential,
  loadProgrammeSample,
  normVersionsForParameters,
  programmeOf,
  serializeProgramme,
} from "@/lib/programme-referential";

/**
 * The programme d'analyse of a line (PROGRAMME.md §5).
 *
 * GET — the line, its current programme and the referential the fiche
 * needs. The responsable des paramètres and the admin write it; a
 * technician reads it (the bench shows what was decided).
 *
 * `?natureId=` computes the referential for another nature the line may
 * take (RETOUR-LABO-06-10.md §5, V3 — Q49 by default: an active nature of
 * the same family): its parameters, profiles and prices. The line itself is
 * unchanged until a PUT names that nature.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN", "TECHNICIEN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await loadProgrammeSample(id);
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

  const requested = new URL(request.url).searchParams.get("natureId") || null;
  const natures = await loadProgrammeNatures(sample, requested);
  const nature = resolveProgrammeNature(
    { natureId: requested },
    { natureId: sample.natureId, natureFamily: sample.nature.family, natures }
  );
  if (!nature.ok) return NextResponse.json({ error: nature.error }, { status: 400 });

  const referential = await loadProgrammeReferential(sample, { natureId: nature.natureId, natures });
  return NextResponse.json({ ...serializeProgramme(sample), referential });
}

/** The user ids a request names as technicians, to load them in one query. */
function namedTechnicians(input: unknown): string[] {
  const body = (input ?? {}) as { technicianId?: unknown; parameters?: unknown };
  const ids = new Set<string>();
  if (typeof body.technicianId === "string" && body.technicianId) ids.add(body.technicianId);
  if (Array.isArray(body.parameters)) {
    for (const entry of body.parameters) {
      const technicianId = (entry as { technicianId?: unknown } | null)?.technicianId;
      if (typeof technicianId === "string" && technicianId) ids.add(technicianId);
    }
  }
  return [...ids];
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
 * block — no result can exist before EN_ANALYSE — and `Sample.technicianId`
 * receives the default technician.
 *
 * The request may name another nature of the line's family (Q49): the line
 * then takes it in the same transaction — `Sample.natureId` and
 * `Sample.type` (its category) — and the analyses are checked against the
 * new category. The journal line carries the nature before and after.
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
  // Held at reception (LabSettings.blockNonConformAtReception): the admin's
  // release — which needs the line still RECU — comes before any programme.
  if (sample.analysisBlocked) {
    return NextResponse.json(
      { error: "Cet échantillon est bloqué en réception : un administrateur doit le libérer avant la programmation." },
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
  const technicianIds = namedTechnicians(body);
  const requestedParameterIds = namedParameters(body);

  // The nature first: it decides the category whose parameters are offered.
  // `validateProgramme` resolves it again and refuses what is not allowed.
  const natures = await loadProgrammeNatures(
    sample,
    typeof input.natureId === "string" && input.natureId ? input.natureId : null
  );
  const natureCtx = { natureId: sample.natureId, natureFamily: sample.nature.family, natures };
  const resolved = resolveProgrammeNature(body, natureCtx);
  const newNature = resolved.ok ? resolved.changed : null;
  const category = newNature ? newNature.legacyType : sample.type;

  // The referential the rules are checked against — only what the request
  // names, plus the names of the analyses it asks for (to say which is refused).
  const [parameters, technicians, productTypes] = await Promise.all([
    prisma.analysisParameter.findMany({
      where:
        requestedParameterIds.length > 0
          ? { OR: [{ category }, { id: { in: requestedParameterIds } }] }
          : { category },
      select: { id: true, name: true, category: true },
    }),
    technicianIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: technicianIds } }, select: { id: true, role: true, banned: true } })
      : Promise.resolve([]),
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
    technicians,
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
  const technicianChanged = value.technicianId !== sample.technicianId;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.sampleParameter.deleteMany({ where: { sampleId: id } });
      if (value.parameters.length > 0) {
        await tx.sampleParameter.createMany({
          data: value.parameters.map((p) => ({
            sampleId: id,
            parameterId: p.parameterId,
            technicianId: p.technicianId,
            normVersionId: p.normVersionId,
            dilutionFactor: p.dilutionFactor,
            note: p.note,
          })),
        });
      }
      await tx.sample.update({
        // The status in the guard doubles as optimistic concurrency: a line
        // that moved meanwhile (bench started, cancelled) gets a clean 409.
        // The nature in the guard does the same for a nature changed meanwhile.
        where: { id, status: sample.status, natureId: sample.natureId },
        data: {
          // Q49: the fine nature, and the category the line is filed under.
          ...(natureChange ? { natureId: natureChange.id, type: natureChange.legacyType } : {}),
          productTypeId: value.productTypeId,
          unitCount: value.unitCount,
          testPortion: value.testPortion,
          technicianId: value.technicianId,
          // The assignment stamp follows the default technician.
          ...(technicianChanged ? { assignedAt: value.technicianId ? now : null } : {}),
          priority: value.priority,
          dueAt: value.dueAt,
          programmeNote: value.programmeNote,
          ...(confirming ? { status: "PROGRAMME", programmedAt: now, programmedById: session.id } : {}),
        },
        select: { id: true },
      });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2025") {
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
      before,
      after: programmeOf(updated),
    },
  });

  return NextResponse.json(serializeProgramme(updated));
}
