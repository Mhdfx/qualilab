import { PreleveurDashboard } from "@/components/PreleveurDashboard";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView } from "@/lib/dashboard-view";
import { PRELEVEUR_VIEWS } from "@/lib/circuit-views";

export const metadata = { title: "Prélèvements" };

export default async function PreleveurPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard.
  const session = await requireRole("PRELEVEUR");
  // A tile is a sort (« comme un tri »): `?vue=` narrows « Mes visites » to
  // the visits that tile counts; the dashboard filters with the same rule.
  const view = parseView((await searchParams)[VIEW_PARAM], PRELEVEUR_VIEWS);
  // « Échantillons au total »: every sample of every visit of theirs — the
  // visits `/api/series?mine=1` pages through (`createdById`) — counted
  // exactly rather than summed over the most recent visits the list loads.
  const totalSamples = await prisma.sample.count({ where: { serie: { createdById: session.id } } });
  return <PreleveurDashboard userName={session.name} view={view} totalSamples={totalSamples} />;
}
