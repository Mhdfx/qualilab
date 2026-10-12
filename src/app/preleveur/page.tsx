import { PreleveurDashboard } from "@/components/PreleveurDashboard";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VIEW_PARAM, parseView } from "@/lib/dashboard-view";
import { PRELEVEUR_VIEWS, visitViewStart } from "@/lib/circuit-views";

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
  // The tiles count every visit of theirs — the visits `/api/series?mine=1`
  // pages through (`createdById`) — exactly, on the server, rather than over
  // the page of visits the list loads. « Aujourd'hui » and « semaine » start
  // where the list's views start (`visitViewStart`).
  const now = new Date();
  const mine = { createdById: session.id };
  const [totalSamples, todayVisits, weekSamples] = await Promise.all([
    prisma.sample.count({ where: { serie: mine } }),
    prisma.serie.count({ where: { ...mine, startedAt: { gte: visitViewStart("aujourdhui", now) } } }),
    prisma.sample.count({ where: { serie: { ...mine, startedAt: { gte: visitViewStart("semaine", now) } } } }),
  ]);
  return (
    <PreleveurDashboard
      userName={session.name}
      view={view}
      totalSamples={totalSamples}
      todayVisits={todayVisits}
      weekSamples={weekSamples}
    />
  );
}
