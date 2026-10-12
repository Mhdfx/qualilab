import { requireRole } from "@/lib/auth";
import { getLabSettings } from "@/lib/lab-settings";
import { PageHeader } from "@/components/ui/PageHeader";
import { LabSettingsForm } from "@/components/admin/LabSettingsForm";
import { ConclusionScaleForm } from "@/components/admin/ConclusionScaleForm";
import { CountersForm } from "@/components/admin/CountersForm";
import { loadCounterRows } from "@/lib/counter-rows";
import { prisma } from "@/lib/prisma";

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
      <div className="max-w-3xl space-y-5">
        <LabSettingsForm
          initial={await getLabSettings()}
          regulations={await prisma.regulation.findMany({
            where: { active: true },
            select: { id: true, title: true },
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
          })}
        />
        <ConclusionScaleForm initial={await prisma.conclusionScale.findMany()} />
        <CountersForm initial={await loadCounterRows(new Date().getFullYear())} />
      </div>
    </div>
  );
}
