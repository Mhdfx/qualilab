import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ParametersManager } from "@/components/admin/ParametersManager";

export const metadata = { title: "Paramètres d'analyse" };

export default async function ParametresPage() {
  await requireRole("ADMIN");

  const parameters = await prisma.analysisParameter.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Paramètres d'analyse"
        subtitle="Unités, seuils de référence, limites et famille — ces valeurs décident de la conformité d'un résultat, des alertes de contamination et de l'échantillon (microbiologie ou physico-chimie) qui reçoit chaque analyse."
      />
      <ParametersManager parameters={parameters} />
    </div>
  );
}
