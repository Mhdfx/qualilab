import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateIntake, type IntakeCurrent } from "@/lib/intake-input";
import { CORRECTABLE_STATUSES } from "@/lib/sample-status";

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
 * audit line. Changing the analyses empties the results and sends the
 * sample back to the bench.
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
  const session = await requireApiRole("RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "ADMIN");
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
  const { changes, parameterIds, reason } = checked.value;

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
    if (!type) return NextResponse.json({ error: "Type de produit inconnu pour ce client." }, { status: 400 });
  }

  // A new parameter list means the bench starts again: results go, the
  // technical validation too, and the sample returns to EN_ANALYSE if it
  // had left it. Changing the product type or the number of units changes
  // the criteria the readings were judged against, so those results go too
  // — a stale verdict must never reach the report (CRITERES.md §6).
  const criteriaChanged = changes.productTypeId !== undefined || changes.unitCount !== undefined;
  const resetResults = parameterIds !== null || criteriaChanged;
  const backToBench = resetResults && sample.status === "RESULTATS_SAISIS";

  const updated = await prisma.$transaction(async (tx) => {
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
    if (resetResults) {
      await tx.result.deleteMany({ where: { sampleId: id } });
    }
    if (parameterIds) {
      // An analysis the programme already decided keeps its norm version,
      // dilution, note and its legacy per-analysis technician, if any
      // (before 13/10); an analysis added here starts bare and belongs to
      // whoever took the sample — the responsable des paramètres completes
      // it on a programmed line. Read now, under the lock: the snapshot
      // loaded before the transaction would undo a « Libérer » meanwhile.
      const lines = await tx.sampleParameter.findMany({
        where: { sampleId: id },
        select: { parameterId: true, technicianId: true, normVersionId: true, dilutionFactor: true, note: true },
      });
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
    return tx.sample.update({
      where: { id },
      data: {
        ...changes,
        // The readings are gone: the contamination alert of the previous
        // ones must not silence the alert of the new ones.
        ...(resetResults ? { alertsSentAt: null } : {}),
        ...(backToBench ? { status: "EN_ANALYSE", validatedById: null, validatedAt: null } : {}),
      },
      select: INTAKE_SELECT,
    });
  });

  if (!updated) {
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
      resetResults,
      backToBench,
    },
  });

  return NextResponse.json({ ...updated, parameterIds: updated.parameters.map((p) => p.parameterId) });
}
