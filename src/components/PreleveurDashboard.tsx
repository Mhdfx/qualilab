"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FlaskConical, Calendar, ClipboardList, ChevronRight, MapPin } from "lucide-react";
import { PrimaryLink } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { Card } from "@/components/ui/Card";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { formatDateTime } from "@/lib/labels";
import { SERIE_STATUS_LABELS, type SerieProgress, type SerieStatus } from "@/lib/series";
import { viewHref } from "@/lib/dashboard-view";
import { PRELEVEUR_VIEWS, visitsInView, type PreleveurView } from "@/lib/circuit-views";

type VisitSummary = {
  id: string;
  serialNumber: string;
  kind: "VISITE" | "DEPOT";
  client: { id: string; name: string };
  site: { id: string; name: string } | null;
  startedAt: string;
  arrivedAt: string | null;
  status: SerieStatus;
  progress: SerieProgress;
  samples: { id: string; lineNumber: number }[];
};

type PreleveurDashboardProps = {
  userName: string;
  /** The tile chosen as a sort (`?vue=`, read by the server page); null = every visit. */
  view: PreleveurView | null;
  /** Every sample of every visit of theirs, counted on the server. */
  totalSamples: number;
};

/** The most recent visits the dashboard loads: one page, not the archive. */
const VISIT_LIMIT = 50;

const PATH = "/preleveur";
const ANCHOR = "visites";

const EMPTY: Record<PreleveurView, string> = {
  aujourdhui: "Aucune visite aujourd'hui.",
  semaine: "Aucune visite cette semaine.",
};

const STATUS_STYLES: Record<SerieStatus, string> = {
  A_RECEPTIONNER: "bg-sky-50 text-sky-700 ring-sky-200/60",
  EN_COURS: "bg-violet-50 text-violet-700 ring-violet-200/60",
  TERMINEE: "bg-emerald-50 text-emerald-700 ring-emerald-200/60",
  ANNULEE: "bg-slate-100 text-slate-500 ring-slate-200/60",
};

/**
 * The préleveur's home: their visits, most recent first. A visit is one
 * protocol with several samples; the numbers here count what they carry.
 * Each tile is a sort of « Mes visites » (`?vue=`): today's visits, the
 * week's, or all of them — filtered with the rule the tile counts with.
 */
export function PreleveurDashboard({ userName, view, totalSamples }: PreleveurDashboardProps) {
  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Paginated: the dashboard shows the most recent page, not the archive.
    fetch(`/api/series?mine=1&limit=${VISIT_LIMIT}`)
      .then((r) => r.json())
      .then((data) => {
        setVisits(data.items ?? []);
        setHasMore(Boolean(data.nextCursor));
      })
      .finally(() => setLoading(false));
  }, []);

  // One clock for the tiles and the list, so a tile and its view agree.
  const now = new Date();
  const todayVisits = visitsInView(visits, "aujourdhui", now).length;
  const weekSamples = visitsInView(visits, "semaine", now).reduce((n, v) => n + v.progress.total, 0);
  const shown = visitsInView(visits, view, now);

  const firstName = userName.split(" ")[0];

  const stats = [
    {
      label: "Visites aujourd'hui",
      value: todayVisits,
      icon: Calendar,
      accent: "blue" as const,
      href: viewHref(PATH, "aujourdhui", ANCHOR),
      active: view === "aujourdhui",
    },
    {
      label: "Échantillons cette semaine",
      value: weekSamples,
      icon: ClipboardList,
      accent: "emerald" as const,
      href: viewHref(PATH, "semaine", ANCHOR),
      active: view === "semaine",
    },
    {
      label: "Échantillons au total",
      value: totalSamples,
      icon: FlaskConical,
      accent: "violet" as const,
      // Every visit: the whole list, no view.
      href: viewHref(PATH, null, ANCHOR),
      active: false,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        badge="Module Préleveur"
        title={`Bonjour, ${firstName}`}
        subtitle="Une visite, un numéro de série, tous les échantillons en une fois"
        action={
          <PrimaryLink href="/preleveur/nouvelle-visite" className="shadow-lg shadow-black/20">
            <Plus className="h-4 w-4" />
            Nouvelle visite
          </PrimaryLink>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map(({ label, value, icon, accent, href, active }) => (
          <StatCard key={label} label={label} value={value} icon={icon} accent={accent} href={href} active={active} />
        ))}
      </div>

      <div id={ANCHOR} className="mb-5 scroll-mt-24">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-800">{view ? PRELEVEUR_VIEWS[view] : "Mes visites"}</h2>
          {!loading && (
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {shown.length} visite{shown.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        {view && (
          <ViewFilterNotice label={PRELEVEUR_VIEWS[view]} resetHref={viewHref(PATH, null, ANCHOR)} className="mt-2" />
        )}
        {!loading && hasMore && (
          <p className="mt-2 text-xs text-slate-500">
            Parmi vos {VISIT_LIMIT} visites les plus récentes.
          </p>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : shown.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {view ? EMPTY[view] : "Aucune visite pour l'instant. Commencez par « Nouvelle visite »."}
        </Card>
      ) : (
        <ul className="space-y-3">
          {shown.map((visit) => (
            <li key={visit.id}>
              <Link
                href={`/preleveur/visites/${visit.id}`}
                className="block rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Card className="flex items-center gap-4 p-4 transition hover:border-brand/30 hover:shadow-md sm:p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-base font-bold text-brand">{visit.serialNumber}</span>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ${STATUS_STYLES[visit.status]}`}
                      >
                        {SERIE_STATUS_LABELS[visit.status]}
                      </span>
                    </div>
                    <p className="mt-1 truncate font-medium text-slate-900">
                      {visit.client.name}
                      {visit.site ? ` · ${visit.site.name}` : ""}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>{formatDateTime(visit.startedAt)}</span>
                      <span>
                        {visit.progress.total} échantillon{visit.progress.total > 1 ? "s" : ""}
                        {visit.progress.aReceptionner > 0 && visit.status !== "A_RECEPTIONNER"
                          ? ` · ${visit.progress.aReceptionner} à réceptionner`
                          : ""}
                        {visit.progress.enCours > 0 ? ` · ${visit.progress.enCours} en cours` : ""}
                        {visit.progress.termines > 0 ? ` · ${visit.progress.termines} terminé${visit.progress.termines > 1 ? "s" : ""}` : ""}
                      </span>
                      {!visit.arrivedAt && visit.status === "A_RECEPTIONNER" && (
                        <span className="inline-flex items-center gap-1 text-amber-700">
                          <MapPin className="h-3 w-3" aria-hidden="true" />
                          arrivée au labo à compléter
                        </span>
                      )}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
