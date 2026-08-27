import { requireRole } from "@/lib/auth";
import { getLabSettings } from "@/lib/lab-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { LabSettingsForm } from "@/components/admin/LabSettingsForm";

export const metadata = { title: "Réglages du circuit" };

export default async function ReglagesPage() {
  await requireRole("ADMIN");

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Réglages du circuit"
        subtitle="Les décisions de fonctionnement en attente du laboratoire — les deux comportements existent, le réglage choisit."
      />
      <div className="max-w-3xl">
        <LabSettingsForm initial={await getLabSettings()} />
      </div>
    </div>
  );
}
