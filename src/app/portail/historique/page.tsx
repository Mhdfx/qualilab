import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { LegacyHistoryList, LegacyHistoryNotice } from "@/components/legacy-history/LegacyHistory";
import { LEGACY_HISTORY_ON_PORTAL } from "@/lib/lab-proposals";
import { LEGACY_HISTORY_TITLE, parseLegacyHistoryFilters } from "@/lib/legacy-history";
import { loadLegacyHistory, loadLegacySites } from "@/lib/legacy-history-server";
import { requirePortalPage } from "@/lib/portal-server";
import { PortalClosed } from "../_components/PortalClosed";

export const metadata = { title: LEGACY_HISTORY_TITLE };

/**
 * « Historique (ancien logiciel) » (lot 5B, HA4 — RETOUR-LABO-20-11.md §6,
 * Q20): what the old software reported for the account's client since 2017,
 * read-only, apart from « Mes échantillons » (its numbers cross ours). 50 per
 * page, newest first; the notice says the signed report prevails. Only the
 * account's own client, always; `LEGACY_HISTORY_ON_PORTAL` off: not found.
 */
export default async function PortailHistoriquePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { access } = await requirePortalPage();
  if (!access.ok) return <PortalClosed reason={access.reason} />;
  if (!LEGACY_HISTORY_ON_PORTAL) notFound();

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  const filters = parseLegacyHistoryFilters(params);
  const [page, sites] = await Promise.all([loadLegacyHistory(access.clientId, filters), loadLegacySites(access.clientId)]);

  return (
    <div>
      <PageHeader
        badge="Espace client"
        title={LEGACY_HISTORY_TITLE}
        subtitle="Les analyses réalisées pour vous avant la mise en service du nouveau logiciel."
      />
      <div className="mb-5">
        <LegacyHistoryNotice />
      </div>
      <LegacyHistoryList page={page} filters={filters} sites={sites} basePath="/portail/historique" />
    </div>
  );
}
