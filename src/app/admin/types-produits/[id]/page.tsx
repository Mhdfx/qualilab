import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { CriteriaGrid } from "@/components/admin/CriteriaGrid";

export const metadata = { title: "Critères d'un type de produit" };

export default async function ProductTypeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("ADMIN");
  const { id } = await params;

  const [type, parameters, norms, clients] = await Promise.all([
    prisma.productType.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        family: true,
        clientId: true,
        active: true,
        criteria: {
          select: { id: true, parameterId: true, normVersionId: true, unit: true, n: true, c: true, mKind: true, m: true, bigM: true, active: true },
          orderBy: [{ parameter: { name: "asc" } }, { normVersion: { version: "desc" } }],
        },
      },
    }),
    prisma.analysisParameter.findMany({ select: { id: true, name: true, category: true, unit: true }, orderBy: { name: "asc" } }),
    prisma.norm.findMany({
      select: { code: true, versions: { select: { id: true, version: true, label: true, current: true }, orderBy: { version: "desc" } } },
      orderBy: { code: "asc" },
    }),
    prisma.client.findMany({ where: { archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!type) notFound();

  return (
    <div>
      <Link
        href="/admin/types-produits"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Types de produits
      </Link>
      <PageHeader
        badge="Configuration"
        title={type.name}
        subtitle="Les critères d'interprétation de ce type : un germe, une version de norme, le plan n / c et les limites m / M. Une ligne par version quand l'ancienne et la nouvelle coexistent."
      />
      <CriteriaGrid
        type={{ id: type.id, name: type.name, family: type.family, clientId: type.clientId, active: type.active }}
        criteria={type.criteria}
        parameters={parameters}
        versions={norms.flatMap((n) => n.versions.map((v) => ({ id: v.id, code: n.code, version: v.version, label: v.label, current: v.current })))}
        clients={clients}
      />
    </div>
  );
}
