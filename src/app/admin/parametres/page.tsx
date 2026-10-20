import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { normInForce } from "@/lib/parameter-caption";
import { normVersionsForParameters } from "@/lib/programme-referential";
import { PageHeader } from "@/components/ui/PageHeader";
import { ParametersManager } from "@/components/admin/ParametersManager";

export const metadata = { title: "Paramètres d'analyse" };

export default async function ParametresPage() {
  await requireRole("ADMIN");

  const parameters = await prisma.analysisParameter.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  // The norm in force of each one (as `GET /api/parameters`): shown under
  // the name and searched — « NM ISO 6579 » finds its germs (D-19).
  const versions = await normVersionsForParameters(parameters.map((parameter) => parameter.id));

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Paramètres d'analyse"
        subtitle="Unités, seuils de référence, limites et domaine — ces valeurs décident de la conformité d'un résultat, des alertes de contamination et de l'échantillon (microbiologie ou physico-chimie) qui reçoit chaque analyse."
      />
      <ParametersManager
        parameters={parameters.map((parameter) => ({ ...parameter, normLabel: normInForce(versions[parameter.id] ?? []) }))}
      />
    </div>
  );
}
