import Link from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { LegacyHistoryList, LegacyHistoryNotice } from "@/components/legacy-history/LegacyHistory";
import { LEGACY_HISTORY_TITLE, parseLegacyHistoryFilters } from "@/lib/legacy-history";
import { loadLegacyHistory, loadLegacySites } from "@/lib/legacy-history-server";

export const metadata = { title: LEGACY_HISTORY_TITLE };

/**
 * The whole history of the old software of one client (lot 5B, HA5 —
 * RETOUR-LABO-20-11.md §6), for the laboratory: the portal's list (same
 * component), from the fiche client. GESTIONNAIRE and ADMIN, the roles of
 * the fiche (HA6); the technician never (2.15).
 */
export default async function ClientHistoriquePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("GESTIONNAIRE", "ADMIN");
  const { id } = await params;
  const raw = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") query.set(key, value);
  const filters = parseLegacyHistoryFilters(query);

  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, name: true } });
  if (!client) notFound();
  const [page, sites] = await Promise.all([loadLegacyHistory(client.id, filters), loadLegacySites(client.id)]);

  return (
    <div>
      <Link href={`/commercial/${client.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Fiche client
      </Link>
      <PageHeader badge={client.name} title={LEGACY_HISTORY_TITLE} subtitle="Les échantillons que l'ancien logiciel a rendus pour ce client, en lecture seule." />
      <div className="mb-5">
        <LegacyHistoryNotice />
      </div>
      <LegacyHistoryList page={page} filters={filters} sites={sites} basePath={`/commercial/${client.id}/historique`} />
    </div>
  );
}
