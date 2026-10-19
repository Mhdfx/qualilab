import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { CriteriaGrid } from "@/components/admin/CriteriaGrid";
import { RegulationEditor } from "@/components/admin/RegulationEditor";
import { withFamilyListQuery } from "@/lib/family-list";
import type { FamilyDetailData } from "@/lib/family-catalogue";

/**
 * One famille de produits: its header (name, type d'analyse, client), the
 * regulation proposed for its samples and its criteria grid — the same
 * screen for the administrator (/admin/types-produits/[id]) and the
 * responsable des paramètres (/programmation/familles/[id],
 * RETOUR-LABO-16-10.md F4). Each page keeps its own guard and says where
 * the list is (`basePath`); the way back finds the list's filters again.
 * The parameters, norms and regulations themselves stay the
 * administrator's (Q125): anyone else gets no link into /admin.
 */
export function FamilyDetailView({
  data,
  basePath,
  backLabel,
  badge,
  administrator,
}: {
  data: FamilyDetailData;
  basePath: string;
  backLabel: string;
  badge: string;
  /** The signed-in account is the administrator, who manages the lists the grid picks from. */
  administrator: boolean;
}) {
  const { type } = data;
  return (
    <div>
      <Link
        href={withFamilyListQuery(basePath, data.filter)}
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {backLabel}
      </Link>
      <PageHeader
        badge={badge}
        title={type.name}
        subtitle="Les critères d'interprétation de cette famille : un germe, une version de norme, le plan n / c et les limites m / M. Une ligne par version quand l'ancienne et la nouvelle coexistent."
      />
      <RegulationEditor
        typeId={type.id}
        initialId={type.regulationId}
        options={data.regulations}
        familyDefault={data.familyDefaultRegulation}
        regulationsHref={administrator ? "/admin/reglementations" : null}
      />
      <CriteriaGrid
        type={{ id: type.id, name: type.name, family: type.family, natureId: type.natureId, clientId: type.clientId, active: type.active }}
        criteria={data.criteria}
        parameters={data.parameters}
        versions={data.versions}
        clients={data.clients}
        natures={data.natures}
      />
      {!administrator && (
        <p className="mt-4 text-xs text-slate-500">
          Un germe ou une norme absent des listes se crée par l&apos;administrateur (Paramètres d&apos;analyse, Normes).
        </p>
      )}
    </div>
  );
}
