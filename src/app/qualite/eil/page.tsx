import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { EilManager, type EilRow } from "@/components/qualite/EilManager";
import type { EilStatusValue } from "@/lib/quality-validation";
import { parseView, viewHref } from "@/lib/dashboard-view";
import { EIL_VIEWS, eilViewStatuses } from "@/lib/management-views";

export const metadata = { title: "EIL" };

/**
 * The EIL register. `?vue=ouvertes` is the qualité tile « Campagnes EIL
 * ouvertes » (« comme un tri »): the campaigns not yet closed, filtered by
 * the database and again by the register when it reloads its rows.
 */
export default async function EilPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("VALIDATEUR", "ADMIN");
  const view = parseView((await searchParams).vue, EIL_VIEWS);
  const statuses = eilViewStatuses(view);
  const campaigns = await prisma.eilCampaign.findMany({
    where: statuses ? { status: { in: [...statuses] } } : undefined,
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    take: 100,
  });

  const rows: EilRow[] = campaigns.map((campaign) => ({
    id: campaign.id,
    name: campaign.name,
    organizer: campaign.organizer,
    scope: campaign.scope,
    startDate: campaign.startDate?.toISOString() ?? null,
    resultDate: campaign.resultDate?.toISOString() ?? null,
    status: campaign.status as EilStatusValue,
    outcome: campaign.outcome,
    satisfactory: campaign.satisfactory,
    notes: campaign.notes,
  }));

  return (
    <div>
      <PageHeader
        badge="Système Qualité"
        title="Essais interlaboratoires"
        subtitle="Les campagnes de comparaison (BIPEA, LNCM…) : planification, résultats, verdicts."
      />
      {view && (
        <ViewFilterNotice label={EIL_VIEWS[view]} resetHref={viewHref("/qualite/eil", null)} className="mb-4" />
      )}
      {/* Keyed by the view: the router keeps a page's client state across a
          change of its search params, so without the key « Tout afficher »
          would keep the open campaigns loaded for `?vue=ouvertes`. */}
      <EilManager key={view ?? "toutes"} initialCampaigns={rows} statuses={statuses} />
    </div>
  );
}
