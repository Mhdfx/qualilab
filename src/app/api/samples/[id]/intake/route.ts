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
  personName: true,
  personRole: true,
  handsState: true,
  remarks: true,
  unitCount: true,
  validatedById: true,
  parameters: { select: { parameterId: true } },
} as const;

/**
 * « Corriger la fiche » (WORKFLOW.md §8): the identification fields of a
 * sample may be fixed until its approval, with a reason and a before/after
 * audit line. Changing the analyses empties the results and sends the
 * sample back to the bench.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sample = await prisma.sample.findUnique({ where: { id }, select: INTAKE_SELECT });
  if (!sample) return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
  if (!CORRECTABLE_STATUSES.includes(sample.status)) {
    return NextResponse.json(
      { error: "La fiche est figée : l'échantillon est approuvé, envoyé ou annulé." },
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
    personName: sample.personName,
    personRole: sample.personRole,
    handsState: sample.handsState,
    remarks: sample.remarks,
    unitCount: sample.unitCount,
    parameterIds: sample.parameters.map((p) => p.parameterId),
  };

  const checked = validateIntake(body, current);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { changes, parameterIds, reason } = checked.value;

  if (parameterIds) {
    const known = await prisma.analysisParameter.findMany({ where: { id: { in: parameterIds } }, select: { id: true } });
    if (known.length !== parameterIds.length) {
      return NextResponse.json({ error: "Une des analyses demandées n'existe pas." }, { status: 400 });
    }
  }

  // A new parameter list means the bench starts again: results go, the
  // technical validation too, and the sample returns to EN_ANALYSE if it
  // had left it.
  const backToBench = parameterIds !== null && sample.status === "RESULTATS_SAISIS";

  const updated = await prisma.$transaction(async (tx) => {
    if (parameterIds) {
      await tx.result.deleteMany({ where: { sampleId: id } });
      await tx.sampleParameter.deleteMany({ where: { sampleId: id } });
      await tx.sampleParameter.createMany({ data: parameterIds.map((parameterId) => ({ sampleId: id, parameterId })) });
    }
    return tx.sample.update({
      where: { id },
      data: {
        ...changes,
        ...(backToBench ? { status: "EN_ANALYSE", validatedById: null, validatedAt: null } : {}),
      },
      select: INTAKE_SELECT,
    });
  });

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
      backToBench,
    },
  });

  return NextResponse.json({ ...updated, parameterIds: updated.parameters.map((p) => p.parameterId) });
}
