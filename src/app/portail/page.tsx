import Link from "next/link";
import { ArrowRight, CheckCircle2, FlaskConical, Inbox, Layers } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { formatDate } from "@/lib/labels";
import { portalQueryString } from "@/lib/portal-query";
import { loadPortalDashboard, requirePortalPage } from "@/lib/portal-server";
import { PortalClosed } from "./_components/PortalClosed";
import { AmendedBadge } from "./_components/StageBadge";
import { ReportLink } from "./_components/ReportLink";

export const metadata = { title: "Tableau de bord" };

/**
 * The client's dashboard (PORTAIL.md §2): their samples of the last 12
 * months by state, and the latest reports — amended ones first.
 */
export default async function PortailPage() {
  const { access } = await requirePortalPage();
  if (!access.ok) return <PortalClosed reason={access.reason} />;

  const dashboard = await loadPortalDashboard(access.clientId);
  const { counts, since } = dashboard;
  const list = (extra: Parameters<typeof portalQueryString>[0] = {}) =>
    `/portail/echantillons?${portalQueryString({ from: since, ...extra })}`;

  return (
    <div>
      <PageHeader
        badge="Espace client"
        title={access.clientName}
        subtitle={`Vos échantillons et vos rapports d'analyse depuis le ${formatDate(since)}.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={list()} className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <StatCard label="Échantillons (12 mois)" value={counts.total - counts.ANNULE} icon={Layers} accent="brand" />
        </Link>
        <Link href={list({ stage: "RECU" })} className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <StatCard label="Reçus" value={counts.RECU} icon={Inbox} accent="blue" />
        </Link>
        <Link href={list({ stage: "EN_ANALYSE" })} className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <StatCard label="En analyse" value={counts.EN_ANALYSE} icon={FlaskConical} accent="amber" />
        </Link>
        <Link href={list({ stage: "RAPPORT_DISPONIBLE" })} className="rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
          <StatCard label="Rapports disponibles" value={counts.RAPPORT_DISPONIBLE} icon={CheckCircle2} accent="emerald" />
        </Link>
      </div>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Rapports récents</h2>
          <Link
            href={list({ stage: "RAPPORT_DISPONIBLE" })}
            className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
          >
            Tous les rapports
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {dashboard.recentReports.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            Aucun rapport disponible sur les 12 derniers mois.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {dashboard.recentReports.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-800">
                    <span className="font-mono">{row.controlCode ?? row.serialNumber}</span>
                    <span className="truncate text-slate-600">{row.designation ?? "—"}</span>
                    {row.report?.amended && <AmendedBadge />}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {row.siteName ?? "Siège"} · prélevé le {formatDate(row.sampledAt)}
                    {row.report?.sentAt && <> · rapport envoyé le {formatDate(row.report.sentAt)}</>}
                  </p>
                </div>
                {row.report && <ReportLink sampleId={row.id} number={row.report.number} />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <p className="mt-4 text-xs text-slate-500">
        Les résultats d&apos;analyse vous sont communiqués dans le rapport, une fois celui-ci envoyé par le
        laboratoire.
      </p>
    </div>
  );
}
