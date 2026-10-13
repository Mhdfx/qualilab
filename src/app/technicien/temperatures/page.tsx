import { Thermometer } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { loadMonitoredEquipment } from "@/lib/monitored-equipment";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { TemperatureBoard } from "@/components/qualite/TemperatureBoard";

export const metadata = { title: "Relevés de température" };

/**
 * The fridges and incubators read from the bench: the technician records a
 * reading here without entering the quality space (VALIDATEUR, DIRECTION, ADMIN), the
 * same board and the same route (`POST /api/temperatures`, which admits
 * TECHNICIEN). Declaring an equipment and its bounds stays in Qualité.
 */
export default async function TechnicienTemperaturesPage() {
  await requireRole("TECHNICIEN", "ADMIN");
  const equipments = await loadMonitoredEquipment();

  return (
    <div>
      <PageHeader
        badge="Espace technicien"
        title="Relevés de température"
        subtitle="Un relevé par équipement surveillé — toute sortie de plage est marquée et journalisée à l'instant de la saisie."
      />
      {equipments.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Thermometer className="h-6 w-6 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-3 font-semibold text-slate-700">
            Aucun équipement surveillé — à déclarer par le validateur dans Qualité
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Un équipement apparaît ici dès qu&apos;une plage de température (min / max) lui est
            attribuée dans le registre de métrologie.
          </p>
        </Card>
      ) : (
        <TemperatureBoard equipments={equipments} />
      )}
    </div>
  );
}
