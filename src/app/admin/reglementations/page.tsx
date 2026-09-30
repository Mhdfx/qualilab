import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { RegulationsManager } from "@/components/admin/RegulationsManager";

export const metadata = { title: "Réglementations" };

export default async function RegulationsPage() {
  await requireRole("ADMIN");
  const rows = await prisma.regulation.findMany({
    select: { id: true, title: true, text: true, active: true, sortOrder: true, legacyId: true, _count: { select: { samples: true } } },
    orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
  });
  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Réglementations"
        subtitle="Les textes que le validateur technique choisit pour chaque échantillon ; celui choisi est imprimé en tête du rapport et figé. Proposé ensuite d'après le dernier choix pour le même produit du client, puis le type de produit."
      />
      <RegulationsManager rows={rows.map(({ _count, ...r }) => ({ ...r, samples: _count.samples }))} />
    </div>
  );
}
