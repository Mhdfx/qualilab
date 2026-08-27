import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { isOutOfRange } from "@/lib/quality";
import { validateReading } from "@/lib/quality-validation";

/**
 * Temperature readings. TECHNICIEN may record them too — reading the
 * fridges is bench work — while the register screens live in the quality
 * space. The out-of-range verdict is stored with the reading, judged
 * against the bounds of that day.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN", "TECHNICIEN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const equipmentId = searchParams.get("equipmentId");
  if (!equipmentId) {
    return NextResponse.json({ error: "Équipement manquant." }, { status: 400 });
  }

  const readings = await prisma.temperatureReading.findMany({
    where: { equipmentId },
    orderBy: { readAt: "desc" },
    take: 50,
    include: { createdBy: { select: { name: true } } },
  });

  return NextResponse.json(readings);
}

export async function POST(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN", "TECHNICIEN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const equipmentId =
    typeof input.equipmentId === "string" ? input.equipmentId : "";
  const equipment = equipmentId
    ? await prisma.equipment.findUnique({
        where: { id: equipmentId },
        select: {
          id: true,
          name: true,
          archived: true,
          tempMin: true,
          tempMax: true,
        },
      })
    : null;
  if (!equipment || equipment.archived) {
    return NextResponse.json(
      { error: "Équipement invalide ou archivé." },
      { status: 400 }
    );
  }
  if (equipment.tempMin === null && equipment.tempMax === null) {
    return NextResponse.json(
      { error: "Cet équipement n'a pas de bornes de température — définissez-les d'abord." },
      { status: 400 }
    );
  }

  const validated = validateReading(input);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const outOfRange = isOutOfRange(
    validated.value.value,
    equipment.tempMin,
    equipment.tempMax
  );

  const reading = await prisma.temperatureReading.create({
    data: {
      equipmentId: equipment.id,
      value: validated.value.value,
      note: validated.value.note,
      outOfRange,
      createdById: session.id,
    },
  });

  await logAudit({
    actorId: session.id,
    action: outOfRange ? "TEMPERATURE_OUT_OF_RANGE" : "TEMPERATURE_RECORDED",
    entity: "Equipment",
    entityId: equipment.id,
    metadata: {
      name: equipment.name,
      value: validated.value.value,
      bounds: [equipment.tempMin, equipment.tempMax],
      outOfRange,
    },
  });

  return NextResponse.json(reading, { status: 201 });
}
