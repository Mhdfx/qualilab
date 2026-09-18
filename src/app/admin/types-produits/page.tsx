import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductTypesManager } from "@/components/admin/ProductTypesManager";

export const metadata = { title: "Types de produits & critères" };

export default async function ProductTypesPage() {
  await requireRole("ADMIN");

  const [types, clients] = await Promise.all([
    prisma.productType.findMany({
      select: {
        id: true,
        name: true,
        family: true,
        clientId: true,
        active: true,
        client: { select: { name: true } },
        _count: { select: { criteria: { where: { active: true } }, samples: true } },
      },
      orderBy: [{ clientId: "desc" }, { name: "asc" }],
    }),
    prisma.client.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Types de produits & critères"
        subtitle="Le catalogue des produits analysés et, pour chacun, les critères d'interprétation (n, c, m, M) par germe et par version de norme. Une ligne de prélèvement choisit son type ; le rapport en tire ses verdicts."
      />
      <ProductTypesManager
        clients={clients}
        types={types.map((t) => ({
          id: t.id,
          name: t.name,
          family: t.family,
          clientId: t.clientId,
          clientName: t.client?.name ?? null,
          active: t.active,
          criteriaCount: t._count.criteria,
          sampleCount: t._count.samples,
        }))}
      />
    </div>
  );
}
