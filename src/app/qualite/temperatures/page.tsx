import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  TemperatureBoard,
  type MonitoredEquipment,
} from "@/components/qualite/TemperatureBoard";

export const metadata = { title: "Températures" };

export default async function TemperaturesPage() {
  const equipments = await prisma.equipment.findMany({
    where: {
      archived: false,
      OR: [{ tempMin: { not: null } }, { tempMax: { not: null } }],
    },
    orderBy: { name: "asc" },
    include: {
      temperatures: {
        orderBy: { readAt: "desc" },
        take: 1,
        select: { value: true, readAt: true, outOfRange: true },
      },
    },
  });

  const rows: MonitoredEquipment[] = equipments.map((equipment) => ({
    id: equipment.id,
    name: equipment.name,
    location: equipment.location,
    tempMin: equipment.tempMin,
    tempMax: equipment.tempMax,
    lastReading: equipment.temperatures[0]
      ? {
          value: equipment.temperatures[0].value,
          readAt: equipment.temperatures[0].readAt.toISOString(),
          outOfRange: equipment.temperatures[0].outOfRange,
        }
      : null,
  }));

  return (
    <div>
      <PageHeader
        badge="Système Qualité"
        title="Relevés de température"
        subtitle="Un relevé par équipement surveillé — toute sortie de plage est marquée et journalisée à l'instant de la saisie."
      />
      <TemperatureBoard equipments={rows} />
    </div>
  );
}
