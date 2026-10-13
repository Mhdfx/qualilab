import { requireRole } from "@/lib/auth";
import { loadMonitoredEquipment } from "@/lib/monitored-equipment";
import { PageHeader } from "@/components/ui/PageHeader";
import { TemperatureBoard } from "@/components/qualite/TemperatureBoard";

export const metadata = { title: "Températures" };

export default async function TemperaturesPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("VALIDATEUR", "DIRECTION", "ADMIN");
  const rows = await loadMonitoredEquipment();

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
