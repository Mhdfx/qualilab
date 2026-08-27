import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { calibrationDue } from "@/lib/quality";
import { validateEquipment } from "@/lib/quality-validation";

/**
 * The equipment register — Phase 7. Quality is the VALIDATEUR's domain;
 * ADMIN keeps oversight as everywhere. Each row is served with its computed
 * calibration state so every screen judges the schedule identically.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "true";

  const equipments = await prisma.equipment.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    equipments.map((equipment) => ({
      ...equipment,
      calibration: calibrationDue(
        equipment.lastCalibratedAt,
        equipment.calibrationFrequencyMonths
      ),
    }))
  );
}

export async function POST(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const validated = validateEquipment((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.code) {
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

  const equipment = await prisma.equipment.create({ data: validated.value });

  await logAudit({
    actorId: session.id,
    action: "EQUIPMENT_CREATED",
    entity: "Equipment",
    entityId: equipment.id,
    metadata: {
      name: equipment.name,
      code: equipment.code,
      calibrationFrequencyMonths: equipment.calibrationFrequencyMonths,
      tempMin: equipment.tempMin,
      tempMax: equipment.tempMax,
    },
  });

  return NextResponse.json(
    {
      ...equipment,
      calibration: calibrationDue(
        equipment.lastCalibratedAt,
        equipment.calibrationFrequencyMonths
      ),
    },
    { status: 201 }
  );
}
