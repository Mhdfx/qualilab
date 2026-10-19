import { requireRole } from "@/lib/auth";
import { loadFamilyList } from "@/lib/family-catalogue";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductTypesManager } from "@/components/admin/ProductTypesManager";

export const metadata = { title: "Familles de produits & critères" };

export default async function ProductTypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("ADMIN");
  const data = await loadFamilyList(await searchParams);

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Familles de produits & critères"
        subtitle="Les familles de produits, par type d'analyse, et pour chacune les critères d'interprétation (n, c, m, M) par germe et par version de norme. Un échantillon reçoit sa famille (au dépôt ou sur la fiche de programme) ; le rapport en tire ses verdicts."
      />
      <ProductTypesManager
        basePath="/admin/types-produits"
        types={data.types}
        germNames={data.germNames}
        natures={data.natures}
        clients={data.clients}
        initialFilter={data.filter}
      />
    </div>
  );
}
