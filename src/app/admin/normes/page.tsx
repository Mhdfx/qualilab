import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { NormsManager } from "@/components/admin/NormsManager";

export const metadata = { title: "Normes" };

export default async function NormsPage() {
  await requireRole("ADMIN");

  const norms = await prisma.norm.findMany({
    select: {
      id: true,
      code: true,
      versions: {
        select: { id: true, version: true, label: true, effectiveFrom: true, supersededOn: true, current: true, _count: { select: { criteria: true } } },
        orderBy: { version: "desc" },
      },
    },
    orderBy: { code: "asc" },
  });

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Normes et versions"
        subtitle="Chaque norme garde ses versions datées ; une seule est en vigueur. Le rapport imprime la version sous laquelle le résultat a été lu — les anciens rapports ne changent pas quand une norme évolue."
      />
      <NormsManager
        norms={norms.map((n) => ({
          id: n.id,
          code: n.code,
          versions: n.versions.map((v) => ({
            id: v.id,
            version: v.version,
            label: v.label,
            effectiveFrom: v.effectiveFrom ? v.effectiveFrom.toISOString().slice(0, 10) : "",
            supersededOn: v.supersededOn ? v.supersededOn.toISOString().slice(0, 10) : "",
            current: v.current,
            criteriaCount: v._count.criteria,
          })),
        }))}
      />
    </div>
  );
}
