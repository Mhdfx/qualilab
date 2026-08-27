import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogueManager } from "@/components/admin/CatalogueManager";

export const metadata = { title: "Catalogue" };

export default async function CataloguePage() {
  await requireRole("ADMIN");

  const services = await prisma.labService.findMany({
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Catalogue des prestations"
        subtitle="Libellés et tarifs — ces prix remplissent les lignes de facture proposées depuis les analyses validées."
      />
      <CatalogueManager
        services={services.map((service) => ({
          id: service.id,
          name: service.name,
          category: service.category,
          unitPrice: toMoney(service.unitPrice),
          active: service.active,
        }))}
      />
    </div>
  );
}
