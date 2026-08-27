import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { calibrationDue } from "@/lib/quality";
import { validateEquipment } from "@/lib/quality-validation";

/** Edit (identity, schedule, bounds) or archive one equipment. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.equipment.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Équipement introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  if (typeof input.archived === "boolean" && Object.keys(input).length === 1) {
    const equipment = await prisma.equipment.update({
      where: { id },
      data: { archived: input.archived },
    });
    await logAudit({
      actorId: session.id,
      action: input.archived ? "EQUIPMENT_ARCHIVED" : "EQUIPMENT_RESTORED",
      entity: "Equipment",
      entityId: id,
      metadata: { name: equipment.name },
    });
    return NextResponse.json(equipment);
  }

  const validated = validateEquipment({ name: existing.name, ...input });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.code && validated.value.code !== existing.code) {
    const duplicate = await prisma.equipment.findUnique({
      where: { code: validated.value.code },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Un équipement porte déjà ce code." },
        { status: 409 }
      );
    }
  }

  const equipment = await prisma.equipment.update({
    where: { id },
    data: validated.value,
  });

  await logAudit({
    actorId: session.id,
    action: "EQUIPMENT_UPDATED",
    entity: "Equipment",
    entityId: id,
    metadata: {
      name: equipment.name,
      before: {
        calibrationFrequencyMonths: existing.calibrationFrequencyMonths,
        tempMin: existing.tempMin,
        tempMax: existing.tempMax,
      },
      after: {
        calibrationFrequencyMonths: equipment.calibrationFrequencyMonths,
        tempMin: equipment.tempMin,
        tempMax: equipment.tempMax,
      },
    },
  });

  return NextResponse.json({
    ...equipment,
    calibration: calibrationDue(
      equipment.lastCalibratedAt,
      equipment.calibrationFrequencyMonths
    ),
  });
}
