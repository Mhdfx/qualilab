import "server-only";
import { prisma } from "./prisma";
import type { MonitoredEquipment } from "@/components/qualite/TemperatureBoard";

/**
 * The equipment under temperature watch — not archived, with a lower or an
 * upper bound — each with its last reading, by name. One loader for the two
 * boards that record readings: the quality space (`/qualite/temperatures`)
 * and the bench (`/technicien/temperatures`).
 *
 * The last reading is one `LIMIT 1` read per equipment on
 * `@@index([equipmentId, readAt])` (Perf 3, P2-5): a nested `take: 1` would
 * read every reading of every equipment and keep the first in memory —
 * a cost that grows with each reading recorded.
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
    },
  });
  const lastReadings = await Promise.all(
    equipments.map((equipment) =>
      prisma.temperatureReading.findFirst({
        where: { equipmentId: equipment.id },
        orderBy: { readAt: "desc" },
        select: { value: true, readAt: true, outOfRange: true },
      })
    )
  );

  return equipments.map((equipment, index) => {
    const last = lastReadings[index];
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
