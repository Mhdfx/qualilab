import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateCalibration } from "@/lib/quality-validation";

/**
 * The calibration register of one equipment. Recording a calibration also
 * advances the equipment's lastCalibratedAt when the record is the newest —
 * a back-dated record filling the register never rewinds the schedule.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const calibrations = await prisma.calibrationRecord.findMany({
    where: { equipmentId: id },
    orderBy: { performedAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json(calibrations);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const equipment = await prisma.equipment.findUnique({
    where: { id },
    select: { id: true, name: true, archived: true, lastCalibratedAt: true },
  });
  if (!equipment || equipment.archived) {
    return NextResponse.json(
      { error: "Équipement invalide ou archivé." },
      { status: 400 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const validated = validateCalibration((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const [record] = await prisma.$transaction([
    prisma.calibrationRecord.create({
      data: {
        equipmentId: equipment.id,
        ...validated.value,
        createdById: session.id,
      },
    }),
    ...(equipment.lastCalibratedAt === null ||
    validated.value.performedAt > equipment.lastCalibratedAt
      ? [
          prisma.equipment.update({
            where: { id: equipment.id },
            data: { lastCalibratedAt: validated.value.performedAt },
          }),
        ]
      : []),
  ]);

  await logAudit({
    actorId: session.id,
    action: "CALIBRATION_RECORDED",
    entity: "Equipment",
    entityId: equipment.id,
    metadata: {
      name: equipment.name,
      performedAt: validated.value.performedAt,
      result: validated.value.result,
      provider: validated.value.provider,
      certificate: validated.value.certificate,
    },
  });

  return NextResponse.json(record, { status: 201 });
}
