import { requireRole } from "@/lib/auth";
import { loadFamilyList } from "@/lib/family-catalogue";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductTypesManager } from "@/components/admin/ProductTypesManager";

export const metadata = { title: "Familles & critères" };

/**
 * The responsable des paramètres manages the familles de produits and their
 * criteria (16/10, Q122 / Q125 — RETOUR-LABO-16-10.md F4): the list the
 * administrator has at /admin/types-produits, in his own space.
 */
export default async function FamiliesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("PROGRAMMATEUR", "ADMIN");
  const data = await loadFamilyList(await searchParams);

  return (
    <div>
      <PageHeader
        badge="Enregistrement des paramètres"
        title="Familles & critères"
        subtitle="Les familles de produits, par type d'analyse, et pour chacune les critères d'interprétation (n, c, m, M) par germe et par version de norme. La famille choisie sur la fiche de programme en apporte les germes ; le rapport en tire ses verdicts."
      />
      <ProductTypesManager
        basePath="/programmation/familles"
        types={data.types}
        germNames={data.germNames}
        natures={data.natures}
        clients={data.clients}
        initialFilter={data.filter}
      />
    </div>
  );
}
