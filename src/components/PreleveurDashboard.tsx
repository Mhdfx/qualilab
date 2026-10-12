"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Plus, FlaskConical, Calendar, ClipboardList, ChevronRight, MapPin, Search, RefreshCw } from "lucide-react";
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
  /** Their visits started today, counted on the server over every visit (`visitViewStart`). */
  todayVisits: number;
  /** The samples of their visits of the week, counted on the server over every visit. */
  weekSamples: number;
};

/** One page of visits; « Voir plus » appends the next one. */
const PAGE_SIZE = 50;

/** The search waits for a pause in the typing. */
const SEARCH_DELAY_MS = 300;

/** The status filter's choices, in the circuit's order. */
const STATUS_CHOICES = Object.keys(SERIE_STATUS_LABELS) as SerieStatus[];

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

type VisitList = {
  /** The search and status the list was loaded for (`listKey`). */
  key: string;
  items: VisitSummary[];
  nextCursor: string | null;
  failed: boolean;
};

function listKey(query: string, status: SerieStatus | "") {
  return `${status}|${query}`;
}

/** `GET /api/series` — a préleveur always gets their own visits only (the route forces it). */
function visitsUrl(query: string, status: SerieStatus | "", cursor: string | null) {
  const params = new URLSearchParams({ mine: "1", limit: String(PAGE_SIZE) });
  if (query) params.set("q", query);
  if (status) params.set("status", status);
  if (cursor) params.set("cursor", cursor);
  return `/api/series?${params.toString()}`;
}

async function fetchVisits(url: string, signal?: AbortSignal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error("visites");
  const data = (await response.json()) as { items?: VisitSummary[]; nextCursor?: string | null };
  return { items: data.items ?? [], nextCursor: data.nextCursor ?? null };
}

/**
 * The préleveur's home: their visits, most recent first, and their whole
 * history behind « Voir plus ». The search (n° de série, client, site,
 * référence) and the status filter go through every visit on the server,
 * not only the page loaded. A visit is one protocol with several samples;
 * the numbers here count what they carry.
 *
 * The tiles are counted on the server over every visit (/preleveur page),
 * and each is a sort of « Mes visites » (`?vue=`): today's visits, the
 * week's, or all of them — the list filtered with the rule the tile counts
 * with (`visitViewStart`).
 */
export function PreleveurDashboard({ userName, view, totalSamples, todayVisits, weekSamples }: PreleveurDashboardProps) {
  const searchId = useId();
  const statusId = useId();
  const [input, setInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<SerieStatus | "">("");
  const [list, setList] = useState<VisitList | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [input]);

  // The first page for the current search and status; « Voir plus » appends.
  useEffect(() => {
    const key = listKey(query, status);
    const controller = new AbortController();
    fetchVisits(visitsUrl(query, status, null), controller.signal)
      .then((page) => setList({ key, ...page, failed: false }))
      .catch(() => {
        if (!controller.signal.aborted) setList({ key, items: [], nextCursor: null, failed: true });
      });
    return () => controller.abort();
  }, [query, status]);

  const currentKey = listKey(query, status);
  const loading = list === null || list.key !== currentKey;
  const visits = !loading && list ? list.items : [];
  const nextCursor = !loading && list ? list.nextCursor : null;
  const failed = !loading && list ? list.failed : false;

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    const key = currentKey;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const page = await fetchVisits(visitsUrl(query, status, nextCursor));
      setList((current) => {
        if (!current || current.key !== key) return current;
        const known = new Set(current.items.map((visit) => visit.id));
        return {
          ...current,
          items: [...current.items, ...page.items.filter((visit) => !known.has(visit.id))],
          nextCursor: page.nextCursor,
        };
      });
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const shown = visitsInView(visits, view, new Date());
  const filtered = query !== "" || status !== "";

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
          {!loading && !failed && (
            <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {shown.length} visite{shown.length !== 1 ? "s" : ""}
              {nextCursor ? ` affichée${shown.length !== 1 ? "s" : ""}` : ""}
            </span>
          )}
        </div>
        {view && (
          <ViewFilterNotice label={PRELEVEUR_VIEWS[view]} resetHref={viewHref(PATH, null, ANCHOR)} className="mt-2" />
        )}

        <div role="search" aria-label="Rechercher dans mes visites" className="mt-3 flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 flex-1">
            <label htmlFor={searchId} className="sr-only">
              Rechercher une visite
            </label>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              id={searchId}
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="N° de série, client, site ou référence"
              autoComplete="off"
              className="input-field pl-9 pr-3 text-base sm:text-sm"
            />
          </div>
          <div className="sm:w-56">
            <label htmlFor={statusId} className="sr-only">
              Statut des visites
            </label>
            <select
              id={statusId}
              value={status}
              onChange={(event) => setStatus(event.target.value as SerieStatus | "")}
              className="input-field px-3 text-base sm:text-sm"
            >
              <option value="">Tous les statuts</option>
              {STATUS_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {SERIE_STATUS_LABELS[choice]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : failed ? (
        <Card className="p-8 text-center text-sm text-rose-700">
          <p role="alert">Vos visites n&apos;ont pas pu être chargées. Vérifiez la connexion, puis rechargez la page.</p>
        </Card>
      ) : shown.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          {view
            ? EMPTY[view]
            : filtered
              ? "Aucune visite ne correspond à cette recherche."
              : "Aucune visite pour l'instant. Commencez par « Nouvelle visite »."}
          {nextCursor ? " Les visites plus anciennes sont derrière « Voir plus »." : ""}
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

      {!loading && !failed && nextCursor && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-brand/30 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
          >
            {loadingMore && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loadingMore ? "Chargement…" : "Voir plus"}
          </button>
          {moreFailed && (
            <p role="alert" className="text-sm text-rose-700">
              La suite n&apos;a pas pu être chargée. Réessayez.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
