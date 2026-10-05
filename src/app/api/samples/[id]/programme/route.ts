import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { SAMPLE_STATUS_LABELS } from "@/lib/labels";
import { canTransition, PROGRAMMABLE_STATUSES } from "@/lib/sample-status";
import { validateProgramme, type ProgrammeContext } from "@/lib/programme-input";
import {
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
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN", "TECHNICIEN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await loadProgrammeSample(id);
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });

  const referential = await loadProgrammeReferential(sample);
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

/**
 * PUT — writes the programme: a draft (the line stays RECU), the
 * confirmation (RECU → PROGRAMME, `programmedAt`, `programmedById`,
 * journal SAMPLE_PROGRAMMED) or an edit of a confirmed programme (journal
 * SAMPLE_PROGRAMME_UPDATED). The `SampleParameter` rows are replaced as a
 * block — no result can exist before EN_ANALYSE — and `Sample.technicianId`
 * receives the default technician.
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
      { error: `Le programme ne peut plus être modifié : la ligne est « ${SAMPLE_STATUS_LABELS[sample.status]} ».` },
      { status: 409 }
    );
  }
  // Held at reception (LabSettings.blockNonConformAtReception): the admin's
  // release — which needs the line still RECU — comes before any programme.
  if (sample.analysisBlocked) {
    return NextResponse.json(
      { error: "Cette ligne est bloquée en réception : un administrateur doit la libérer avant la programmation." },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as { productTypeId?: unknown };
  const technicianIds = namedTechnicians(body);

  // The referential the rules are checked against — only what the request names.
  const [parameters, technicians, productTypes] = await Promise.all([
    prisma.analysisParameter.findMany({ where: { category: sample.type }, select: { id: true } }),
    technicianIds.length > 0
      ? prisma.user.findMany({ where: { id: { in: technicianIds } }, select: { id: true, role: true, banned: true } })
      : Promise.resolve([]),
    typeof input.productTypeId === "string" && input.productTypeId
      ? prisma.productType.findMany({ where: { id: input.productTypeId }, select: { id: true, clientId: true, active: true } })
      : Promise.resolve([]),
  ]);
  const normVersions = await normVersionsForParameters(
    parameters.map((p) => p.id),
    sample.parameters.map((p) => ({ parameterId: p.parameterId, normVersionId: p.normVersionId }))
  );

  const ctx: ProgrammeContext = {
    status: sample.status,
    clientId: sample.clientId,
    productTypes,
    parameterIds: parameters.map((p) => p.id),
    technicians,
    normVersionIds: Object.fromEntries(
      Object.entries(normVersions).map(([parameterId, options]) => [parameterId, options.map((o) => o.id)])
    ),
  };
  const checked = validateProgramme(body, ctx);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: checked.httpStatus });
  const value = checked.value;

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
        where: { id, status: sample.status },
        data: {
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
        { error: "La ligne a changé d'état entre-temps : rechargez la fiche." },
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
      before,
      after: programmeOf(updated),
    },
  });

  return NextResponse.json(serializeProgramme(updated));
}
