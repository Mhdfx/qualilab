import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { LegacySampleView } from "@/components/legacy-history/LegacyHistory";
import { LEGACY_HISTORY_ON_PORTAL } from "@/lib/lab-proposals";
import { LEGACY_HISTORY_TITLE, parseLegacySampleId } from "@/lib/legacy-history";
import { loadLegacySample } from "@/lib/legacy-history-server";
import { requirePortalPage } from "@/lib/portal-server";
import { PortalClosed } from "../../_components/PortalClosed";

export const metadata = { title: LEGACY_HISTORY_TITLE };

/** One sample of the client's history (lot 5B, HA4); another client's is not found (HA6). */
export default async function PortailHistoriqueSamplePage({ params }: { params: Promise<{ id: string }> }) {
  const { access } = await requirePortalPage();
  if (!access.ok) return <PortalClosed reason={access.reason} />;
  if (!LEGACY_HISTORY_ON_PORTAL) notFound();

  const id = parseLegacySampleId((await params).id);
  const sample = id === null ? null : await loadLegacySample(access.clientId, id);
  if (!sample) notFound();

  return (
    <div>
      <PageHeader badge="Espace client" title={LEGACY_HISTORY_TITLE} subtitle="Un échantillon analysé avec l'ancien logiciel." />
      <LegacySampleView sample={sample} backHref="/portail/historique" />
    </div>
  );
}
