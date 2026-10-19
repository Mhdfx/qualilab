import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  analysesChangesOnly,
  correctionTouches,
  resultsToReset,
  validateIntake,
  type IntakeCurrent,
  type ResultsReset,
} from "@/lib/intake-input";
import { CORRECTABLE_STATUSES } from "@/lib/sample-status";
import { correctionRefusal, correctionRights } from "@/lib/sample-verbs";

const INTAKE_SELECT = {
  id: true,
  code: true,
  controlCode: true,
  status: true,
  lineKind: true,
  type: true,
  produit: true,
  lieu: true,
  numeroLot: true,
  productionDate: true,
  expiryDate: true,
  quantity: true,
  quantityUnit: true,
  productTemperature: true,
  ambientTemperature: true,
  surfaceLabel: true,
  surfaceAreaCm2: true,
  surfaceAreaNote: true,
  surfaceState: true,
  personName: true,
  personRole: true,
  handsState: true,
  airMethod: true,
  airExposureMin: true,
  remarks: true,
  unitCount: true,
  productTypeId: true,
  clientId: true,
  validatedById: true,
  // The programme d'analyse per parameter (PROGRAMME.md §3): kept when the
  // analyses are corrected, for every analysis that stays — the rows carried
  // over are read again under the row lock, in the transaction.
  parameters: {
    select: { parameterId: true, technicianId: true, normVersionId: true, dilutionFactor: true, note: true },
  },
} as const;

/**
 * « Corriger la fiche » (WORKFLOW.md §8): the identification fields of a
 * sample may be fixed until its approval, with a reason and a before/after
 * audit line.
 *
 * Who changes what (16/10, Q128 — RP3b (a), `correctionRights`): the
 * identification belongs to the reception, the validation desks and the
 * administrator; once the programme is confirmed, the analyses — their
 * list, the product type, the number of units — to the responsable des
 * paramètres (from the bench's start; before, his programme sheet) and the
 * administrator. Decided field by field on what the correction actually
 * changes: 403 with the person to ask.
 *
 * What it does to the results (16/10, Q91 — `resultsToReset`): withdrawing
 * analyses, and nothing else, deletes their readings only — the others and
 * the sample's step stay (an analysis not done is withdrawn, never printed
 * « non effectué »); at RESULTATS_SAISIS the technical validation, given on
 * the former list, is cleared. Adding an analysis, or changing the product
 * type or the number of units, empties every result and sends the sample
 * back to the bench, as before.
 *
 * RETOUR-LABO-06-10.md §5: a SURFACE line also corrects its « État de la
 * surface » (`surfaceState`) and an AIR line its « Méthode de prélèvement »
 * (`airMethod`); both come back in the answer and in the journal's
 * before/after like the other fields. Since 16/10 (RETOUR-LABO-16-10.md
 * §3, A1 and A6–A8) the same goes for the hands state, the two
 * temperatures, the surface's « Autre » text (`surfaceAreaNote`) and the
 * exposed plate's duration (`airExposureMin`) — decided by `validateIntake`.
 *
 * A correction never changes who holds the sample at the bench (« prise
 * en charge libre », 13/10): `Sample.technicianId` / `assignedAt` are not
 * written here, and a legacy per-analysis technician stays on the analyses
 * kept. The Sample row is locked first, like every writer of the holders.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await prisma.sample.findUnique({ where: { id }, select: INTAKE_SELECT });
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
  if (!CORRECTABLE_STATUSES.includes(sample.status)) {
    return NextResponse.json(
      { error: "La fiche est figée : l'échantillon est validé, envoyé ou annulé." },
      { status: 409 }
    );
  }
  // Nothing of this fiche is this person's at this step (the responsable des
  // paramètres before the bench: his programme sheet is open).
  const rights = correctionRights(session.role, sample.status);
  if (!rights.identification && !rights.analyses) {
    const refusal = correctionRefusal(session.role, sample.status, { identification: true, analyses: true });
    return NextResponse.json({ error: refusal }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const current: IntakeCurrent = {
    lineKind: sample.lineKind,
    produit: sample.produit,
    lieu: sample.lieu,
    numeroLot: sample.numeroLot,
    productionDate: sample.productionDate,
    expiryDate: sample.expiryDate,
    quantity: sample.quantity === null ? null : Number(sample.quantity),
    quantityUnit: sample.quantityUnit,
    productTemperature: sample.productTemperature,
    ambientTemperature: sample.ambientTemperature,
    surfaceLabel: sample.surfaceLabel,
    surfaceAreaCm2: sample.surfaceAreaCm2,
    surfaceAreaNote: sample.surfaceAreaNote,
    surfaceState: sample.surfaceState,
    personName: sample.personName,
    personRole: sample.personRole,
    handsState: sample.handsState,
    airMethod: sample.airMethod,
    airExposureMin: sample.airExposureMin,
    remarks: sample.remarks,
    unitCount: sample.unitCount,
    productTypeId: sample.productTypeId,
    parameterIds: sample.parameters.map((p) => p.parameterId),
  };

  const checked = validateIntake(body, current);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { parameterIds, reason } = checked.value;
  // Field by field: the analyses' half and the identification's half each
  // belong to their own people at this step.
  const refusal = correctionRefusal(session.role, sample.status, correctionTouches(body, checked.value));
  if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  // The responsable des paramètres writes the analyses only — an old row's
  // field the line rules would tidy on the way stays as it was.
  const changes = rights.identification ? checked.value.changes : analysesChangesOnly(checked.value.changes);
  if (Object.keys(changes).length === 0 && parameterIds === null) {
    return NextResponse.json({ error: "Aucune modification à enregistrer." }, { status: 400 });
  }

  if (parameterIds) {
    const known = await prisma.analysisParameter.findMany({
      where: { id: { in: parameterIds } },
      select: { id: true, name: true, category: true },
    });
    if (known.length !== parameterIds.length) {
      return NextResponse.json({ error: "Une des analyses demandées n'existe pas." }, { status: 400 });
    }
    // An analysis added here belongs to the sample's category, like on the
    // programme; one the sample already carries stays whatever its category.
    const foreign = known.find(
      (parameter) => parameter.category !== sample.type && !current.parameterIds.includes(parameter.id)
    );
    if (foreign) {
      return NextResponse.json(
        { error: `L'analyse « ${foreign.name} » n'existe pas pour la nature de cet échantillon.` },
        { status: 400 }
      );
    }
  }
  if (changes.productTypeId) {
    const type = await prisma.productType.findFirst({
      where: { id: changes.productTypeId, active: true, OR: [{ clientId: null }, { clientId: sample.clientId }] },
      select: { id: true },
    });
    if (!type) return NextResponse.json({ error: "Famille de produits inconnue pour ce client." }, { status: 400 });
  }

  // Changing the product type or the number of units changes the criteria
  // the readings were judged against: every result goes — a stale verdict
  // must never reach the report (CRITERES.md §6) — the technical validation
  // too, and the sample returns to EN_ANALYSE if it had left it. So does an
  // added analysis (the bench starts again). Analyses withdrawn, and nothing
  // else, take only their own readings with them (16/10, Q91). Decided
  // under the lock, on the list as it stands then.
  const criteriaChanged = changes.productTypeId !== undefined || changes.unitCount !== undefined;

  const outcome = await prisma.$transaction(async (tx) => {
    // The Sample row first, as the programme, the take, « Libérer » and the
    // results save do: the lock order is always Sample, then SampleParameter
    // (no deadlock), and a « Libérer » committed meanwhile is seen below.
    // The status is read again under the lock: a submission, a validation
    // or an approval committed since the read above changes what this
    // correction may do (back to the bench, or not at all) — refused, the
    // fiche is reloaded.
    const locked = await tx.$queryRaw<{ status: string }[]>`
      SELECT \`status\` FROM \`Sample\` WHERE \`id\` = ${id} FOR UPDATE`;
    if (locked[0]?.status !== sample.status) return null;
    // An analysis the programme already decided keeps its norm version,
    // dilution, note and its legacy per-analysis technician, if any (before
    // 13/10); an analysis added here starts bare and belongs to whoever took
    // the sample — the responsable des paramètres completes it on a
    // programmed line. Read now, under the lock: the snapshot loaded before
    // the transaction would undo a « Libérer » meanwhile.
    const lines = parameterIds
      ? await tx.sampleParameter.findMany({
          where: { sampleId: id },
          select: { parameterId: true, technicianId: true, normVersionId: true, dilutionFactor: true, note: true },
        })
      : [];
    const reset: ResultsReset = resultsToReset(
      lines.map((line) => line.parameterId),
      parameterIds,
      criteriaChanged
    );
    const resetAll = reset.kind === "all";
    const backToBench = resetAll && sample.status === "RESULTATS_SAISIS";
    // The technical signature was given on the former list: a withdrawal at
    // validation keeps the step, not the signature.
    const clearValidation = reset.kind === "removed" && sample.status === "RESULTATS_SAISIS";
    if (resetAll) {
      await tx.result.deleteMany({ where: { sampleId: id } });
    } else if (reset.kind === "removed") {
      await tx.result.deleteMany({ where: { sampleId: id, parameterId: { in: reset.parameterIds } } });
    }
    if (parameterIds) {
      const programmed = new Map(lines.map((line) => [line.parameterId, line]));
      await tx.sampleParameter.deleteMany({ where: { sampleId: id } });
      await tx.sampleParameter.createMany({
        data: parameterIds.map((parameterId) => {
          const previous = programmed.get(parameterId);
          return {
            sampleId: id,
            parameterId,
            technicianId: previous?.technicianId ?? null,
            normVersionId: previous?.normVersionId ?? null,
            dilutionFactor: previous?.dilutionFactor ?? null,
            note: previous?.note ?? null,
          };
        }),
      });
    }
    const updated = await tx.sample.update({
      where: { id },
      data: {
        ...changes,
        // The readings are gone: the contamination alert of the previous
        // ones must not silence the alert of the new ones. A withdrawal
        // keeps the readings left, and the alerts already sent for them.
        ...(resetAll ? { alertsSentAt: null } : {}),
        ...(backToBench ? { status: "EN_ANALYSE", validatedById: null, validatedAt: null } : {}),
        ...(clearValidation ? { validatedById: null, validatedAt: null } : {}),
      },
      select: INTAKE_SELECT,
    });
    return { updated, reset, backToBench, clearValidation };
  });

  if (!outcome) {
    return NextResponse.json(
      { error: "Cet échantillon vient de changer d'état : rechargez la fiche avant de la corriger." },
      { status: 409 }
    );
  }

  await logAudit({
    actorId: session.id,
    action: "SAMPLE_INTAKE_CORRECTED",
    entity: "Sample",
    entityId: id,
    metadata: {
      code: sample.code,
      controlCode: sample.controlCode,
      reason,
      before: Object.fromEntries(Object.keys(changes).map((k) => [k, current[k as keyof typeof current]])),
      after: changes,
      parameterIds: parameterIds ? { before: current.parameterIds, after: parameterIds } : undefined,
      resetResults: outcome.reset.kind === "all",
      // A withdrawal (16/10, Q91): the analyses whose readings were deleted.
      resultsRemoved: outcome.reset.kind === "removed" ? outcome.reset.parameterIds : undefined,
      technicalValidationCleared: outcome.clearValidation || undefined,
      backToBench: outcome.backToBench,
    },
  });

  const { updated } = outcome;
  return NextResponse.json({ ...updated, parameterIds: updated.parameters.map((p) => p.parameterId) });
}
