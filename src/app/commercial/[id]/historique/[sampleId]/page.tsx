import Link from "@/components/ui/AppLink";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { LegacySampleView } from "@/components/legacy-history/LegacyHistory";
import { LEGACY_HISTORY_TITLE, parseLegacySampleId } from "@/lib/legacy-history";
import { loadLegacySample } from "@/lib/legacy-history-server";

export const metadata = { title: LEGACY_HISTORY_TITLE };

/** One sample of a client's history (lot 5B, HA5); a sample of another client is not found under this one. */
export default async function ClientHistoriqueSamplePage({ params }: { params: Promise<{ id: string; sampleId: string }> }) {
  await requireRole("GESTIONNAIRE", "ADMIN");
  const { id, sampleId } = await params;
  const legacyId = parseLegacySampleId(sampleId);
  const [client, sample] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { id: true, name: true } }),
    legacyId === null ? null : loadLegacySample(id, legacyId),
  ]);
  if (!client || !sample) notFound();

  return (
    <div>
      <Link href={`/commercial/${client.id}/historique`} className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {LEGACY_HISTORY_TITLE}
      </Link>
      <PageHeader badge={client.name} title={LEGACY_HISTORY_TITLE} subtitle="Un échantillon analysé avec l'ancien logiciel." />
      <LegacySampleView sample={sample} backHref={`/commercial/${client.id}/historique`} />
    </div>
  );
}
