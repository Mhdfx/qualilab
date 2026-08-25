import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ParametersManager } from "@/components/admin/ParametersManager";

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
        subtitle="Unités, seuils de référence et limites — ce sont ces valeurs qui décident de la conformité d'un résultat et des alertes de contamination."
      />
      <ParametersManager parameters={parameters} />
    </div>
  );
}
