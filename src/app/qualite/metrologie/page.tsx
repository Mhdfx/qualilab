import { prisma } from "@/lib/prisma";
import { calibrationDue } from "@/lib/quality";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  EquipmentManager,
  type EquipmentRow,
} from "@/components/qualite/EquipmentManager";

export const metadata = { title: "Métrologie" };

export default async function MetrologiePage() {
  const equipments = await prisma.equipment.findMany({
    where: { archived: false },
    orderBy: { name: "asc" },
  });

  const rows: EquipmentRow[] = equipments.map((equipment) => {
    const calibration = calibrationDue(
      equipment.lastCalibratedAt,
      equipment.calibrationFrequencyMonths
    );
    return {
      id: equipment.id,
      name: equipment.name,
      code: equipment.code,
      location: equipment.location,
      calibrationFrequencyMonths: equipment.calibrationFrequencyMonths,
      lastCalibratedAt: equipment.lastCalibratedAt?.toISOString() ?? null,
      tempMin: equipment.tempMin,
      tempMax: equipment.tempMax,
      archived: equipment.archived,
      calibration: {
        state: calibration.state,
        dueDate: calibration.dueDate?.toISOString() ?? null,
      },
    };
  });

  return (
    <div>
      <PageHeader
        badge="Système Qualité"
        title="Métrologie"
        subtitle="Le registre des équipements : périodicité d'étalonnage, certificats, bornes de température."
      />
      <EquipmentManager initialEquipments={rows} />
    </div>
  );
}
