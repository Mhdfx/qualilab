import "server-only";
import { prisma } from "./prisma";
import type { MonitoredEquipment } from "@/components/qualite/TemperatureBoard";

/**
 * The equipment under temperature watch — not archived, with a lower or an
 * upper bound — each with its last reading, by name. One query for the two
 * boards that record readings: the quality space (`/qualite/temperatures`)
 * and the bench (`/technicien/temperatures`).
 */
export async function loadMonitoredEquipment(): Promise<MonitoredEquipment[]> {
  const equipments = await prisma.equipment.findMany({
    where: {
      archived: false,
      OR: [{ tempMin: { not: null } }, { tempMax: { not: null } }],
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      location: true,
      tempMin: true,
      tempMax: true,
      temperatures: {
        orderBy: { readAt: "desc" },
        take: 1,
        select: { value: true, readAt: true, outOfRange: true },
      },
    },
  });

  return equipments.map((equipment) => {
    const last = equipment.temperatures[0];
    return {
      id: equipment.id,
      name: equipment.name,
      location: equipment.location,
      tempMin: equipment.tempMin,
      tempMax: equipment.tempMax,
      lastReading: last
        ? { value: last.value, readAt: last.readAt.toISOString(), outOfRange: last.outOfRange }
        : null,
    };
  });
}
