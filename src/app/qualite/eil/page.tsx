import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { EilManager, type EilRow } from "@/components/qualite/EilManager";
import type { EilStatusValue } from "@/lib/quality-validation";

export const metadata = { title: "EIL" };

export default async function EilPage() {
  const campaigns = await prisma.eilCampaign.findMany({
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
      <EilManager initialCampaigns={rows} />
    </div>
  );
}
