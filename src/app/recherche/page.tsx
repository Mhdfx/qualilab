import Link from "next/link";
import { Download, FileText, Search } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SAMPLE_STATUS_LABELS, SAMPLE_TYPE_LABELS, formatDate } from "@/lib/labels";
import { UNDECLARED_SAMPLING, parseSampleSearch, searchQueryString, type Conclusion } from "@/lib/sample-search";
import { searchSamples } from "@/lib/sample-search-server";
import { benchHidesClient, benchSearchScope } from "@/lib/bench-access";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ClientSiteFilter } from "@/components/recherche/ClientSiteFilter";
import { ReportActions } from "@/components/validation/ReportActions";
import { amendedNumber } from "@/lib/report-amendment";
import { canReadReports, reportVersionSent } from "@/lib/report-actions";
import { sampleLinkFor } from "@/lib/sample-verbs";

export const metadata = { title: "Recherche des analyses" };

const PAGE_SIZE = 50;

const TONES: Record<Conclusion["tone"], string> = {
  ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  mid: "bg-amber-50 text-amber-700 ring-amber-200",
  no: "bg-rose-50 text-rose-700 ring-rose-200",
  pending: "bg-slate-100 text-slate-600 ring-slate-200",
  muted: "bg-slate-50 text-slate-400 ring-slate-200",
};

/**
 * Finding the analyses done or in progress (RETOUR-LABO-29-09.md, slice F):
 * by client and site (RETOUR-LABO-06-10.md §5, V5), period (reception or
 * sampling), domain, type of analysis, state or exact step, with or without
 * a report, plus free text. A plain GET form: the URL is the search, so it
 * can be bookmarked or sent to a colleague — and the dashboards' tiles open
 * it on exactly what they count (`rechercheHref`); every filter a tile can
 * set has its field here, so « Rechercher » again keeps it.
 * Server-side and paginated.
 */
export default async function RecherchePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireRole("RECEPTIONNISTE", "PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) if (typeof v === "string") params.set(k, v);
  // A technician's search names no client nor site, and never filters or
  // matches by them (re-ask 2.15, `benchHidesClient`).
  const blind = benchHidesClient(session.role);
  const parsed = parseSampleSearch(params);
  const search = blind ? { ...parsed, clientId: null, siteId: null } : parsed;
  const page = Math.max(1, Number.parseInt(params.get("page") ?? "1", 10) || 1);
  const searched = [...params.keys()].some((k) => k !== "page");

  // The active clients — plus the one in the address even if archived (the
  // link of its fiche), so submitting the form again keeps it.
  const chosenClient = search.clientId ? [{ id: search.clientId }] : [];
  const [clientRows, sites, natures, result] = await Promise.all([
    blind ? [] : prisma.client.findMany({
      where: { OR: [{ archived: false }, ...chosenClient] },
      select: { id: true, name: true, archived: true },
      orderBy: { name: "asc" },
    }),
    // Every site of those clients, inactive ones included: old analyses were done there.
    blind ? [] : prisma.site.findMany({
      where: { OR: [{ client: { archived: false } }, ...chosenClient.map(({ id }) => ({ clientId: id }))] },
      select: { id: true, clientId: true, name: true, active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    prisma.analysisNature.findMany({ select: { id: true, label: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] }),
    searchSamples(search, {
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      // A technician's search stays on the samples they hold — taken, or a
      // legacy parameter line of theirs (PROGRAMME.md §10) — like the
      // samples API; « À prendre » and colleagues' samples are the bench's.
      // Blind, its free text never matches the client or the site alone,
      // and the client, the site and the place are not even loaded.
      scope: benchSearchScope(session, search.q),
      blind,
    }),
  ]);
  const clients = clientRows.map((c) => ({ id: c.id, name: c.archived ? `${c.name} (archivé)` : c.name }));
  const pages = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
  const canExport = session.role !== "TECHNICIEN";
  // The roles the report route admits (`REPORT_READ_ROLES`).
  const canReport = canReadReports(session.role);
  // The N° opens the sample where this person works on it (`sampleLinkFor`):
  // the validation desks on its validation page, where it is cancelled at the
  // bench or its report reopened (16/10, Q13); the responsable des
  // paramètres on its programme sheet, where « Corriger les analyses » is
  // once the bench has started (16/10, Q128).
  const linkOf = (id: string) => sampleLinkFor(session.role, id);
  // AMENDEMENT.md §4: the number of the version in force and any amendment
  // in progress, for the report actions of each row — and whether this
  // version has left yet (`reportVersionSent`), for « Envoyer / Renvoyer au
  // client » (gestionnaire, validator, Direction, administrator;
  // finalversion.md:116).
  const reports = canReport
    ? await prisma.report.findMany({
        where: { sampleId: { in: result.rows.filter((r) => r.hasReport).map((r) => r.id) } },
        select: { id: true, sampleId: true, number: true, version: true, amendmentPending: true, sentAt: true, amendedAt: true },
      })
    : [];
  const reportBySample = new Map(reports.map((r) => [r.sampleId, r]));
  const iso = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";

  return (
    <div>
      <PageHeader
        badge="Recherche"
        title="Recherche des analyses"
        subtitle={`Les analyses terminées ou en cours, par ${blind ? "" : "client et site, "}période, catégorie, type d'analyse, état ou étape.${canExport ? " Exportez le résultat en Excel." : ""}`}
      />

      <Card className="p-5">
        <form method="GET" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="block text-sm font-medium text-slate-700">Texte</label>
            <input id="q" name="q" defaultValue={search.q ?? ""} placeholder={blind ? "N° de contrôle, série, produit, lot…" : "N° de contrôle, série, produit, lot, lieu, site…"} className="input-field mt-1.5 px-3" />
          </div>
          {!blind && (
            <ClientSiteFilter
              // A new search (« Effacer », a bookmarked link) starts from the URL again.
              key={`${search.clientId ?? ""}|${search.siteId ?? ""}`}
              clients={clients}
              sites={sites}
              clientId={search.clientId}
              siteId={search.siteId}
            />
          )}
          <div>
            <label htmlFor="type" className="block text-sm font-medium text-slate-700">Catégorie</label>
            <select id="type" name="type" defaultValue={search.type ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              {(Object.keys(SAMPLE_TYPE_LABELS) as (keyof typeof SAMPLE_TYPE_LABELS)[]).map((type) => (
                <option key={type} value={type}>{SAMPLE_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="nature" className="block text-sm font-medium text-slate-700">Type d&apos;analyse</label>
            <select id="nature" name="nature" defaultValue={search.natureId ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              {natures.map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="etat" className="block text-sm font-medium text-slate-700">État</label>
            <select id="etat" name="etat" defaultValue={search.state ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              <option value="en_cours">En cours</option>
              <option value="terminees">Terminées</option>
              <option value="annulees">Annulées</option>
            </select>
          </div>
          <div>
            <label htmlFor="statut" className="block text-sm font-medium text-slate-700">Étape</label>
            {/* One exact step: it takes precedence over « État » (parseSampleSearch). */}
            <select id="statut" name="statut" defaultValue={search.status ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Toutes</option>
              {(Object.keys(SAMPLE_STATUS_LABELS) as (keyof typeof SAMPLE_STATUS_LABELS)[]).map((status) => (
                <option key={status} value={status}>{SAMPLE_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date" className="block text-sm font-medium text-slate-700">Période sur la date de</label>
            <select id="date" name="date" defaultValue={search.dateField} className="input-field mt-1.5 px-3">
              <option value="reception">Réception</option>
              <option value="prelevement">Prélèvement</option>
            </select>
          </div>
          <div>
            <label htmlFor="du" className="block text-sm font-medium text-slate-700">Du</label>
            <input id="du" name="du" type="date" defaultValue={iso(search.from)} className="input-field mt-1.5 px-3" />
          </div>
          <div>
            <label htmlFor="au" className="block text-sm font-medium text-slate-700">Au</label>
            <input id="au" name="au" type="date" defaultValue={iso(search.to)} className="input-field mt-1.5 px-3" />
          </div>
          <fieldset>
            <legend className="block text-sm font-medium text-slate-700">Rapport</legend>
            <label
              htmlFor="rapport"
              className="mt-1.5 flex cursor-pointer items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-3.5 text-sm text-slate-800 transition-colors hover:border-slate-300"
            >
              <input id="rapport" name="rapport" type="checkbox" value="1" defaultChecked={search.withReport} className="h-4 w-4 accent-brand" />
              Avec rapport seulement
            </label>
          </fieldset>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-4">
            <button type="submit" className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark">
              <Search className="h-4 w-4" aria-hidden="true" />
              Rechercher
            </button>
            {searched && (
              <Link href="/recherche" className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                Effacer
              </Link>
            )}
            {canExport && (
              <a
                href={`/api/samples/export?${searchQueryString(search)}`}
                className="ml-auto inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                Exporter en Excel
              </a>
            )}
          </div>
        </form>
      </Card>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Résultats</h2>
          <p className="text-sm text-slate-500">
            {result.total} analyse{result.total > 1 ? "s" : ""}
            {pages > 1 && ` · page ${page} / ${pages}`}
          </p>
        </div>
        {result.rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Aucune analyse ne correspond à ces critères.</p>
        ) : (
          // `relative`: the rows' screen-reader texts (absolute) stay inside
          // the scroller instead of widening the page on a phone.
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">N°</th>
                  <th className="pb-2 pr-3 font-medium">Série</th>
                  {!blind && <th className="pb-2 pr-3 font-medium">Client</th>}
                  <th className="pb-2 pr-3 font-medium">Produit</th>
                  <th className="pb-2 pr-3 font-medium">Analyse</th>
                  <th className="pb-2 pr-3 font-medium">Prélevé</th>
                  <th className="pb-2 pr-3 font-medium">Reçu</th>
                  <th className="pb-2 pr-3 font-medium">État</th>
                  <th className="pb-2 font-medium">Conclusion</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => {
                  const open = linkOf(row.id);
                  return (
                    <tr key={row.id} className="border-b border-slate-100 align-top">
                      <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">
                        {open ? (
                          <Link
                            href={open.href}
                            className="rounded text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            {row.controlCode ?? row.code}
                            <span className="sr-only"> — {open.label}</span>
                          </Link>
                        ) : (
                          (row.controlCode ?? row.code)
                        )}
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-slate-600">{row.serialNumber}</td>
                      {!blind && (
                        <td className="py-2.5 pr-3 text-slate-800">
                          {row.clientName}
                          {row.siteName && <span className="block text-xs text-slate-500">{row.siteName}</span>}
                        </td>
                      )}
                      <td className="py-2.5 pr-3 text-slate-800">
                        {row.produit ?? "—"}
                        {row.numeroLot && <span className="block text-xs text-slate-500">Lot {row.numeroLot}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{row.nature}</td>
                      {/* A deposit without a declared sampling time: its entry
                          instant is no sampling date (R6 / C5). */}
                      <td className="py-2.5 pr-3 text-slate-600">
                        {row.sampledAt ? formatDate(row.sampledAt) : <span className="text-slate-400">{UNDECLARED_SAMPLING}</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-600">{row.receptionAt ? formatDate(row.receptionAt) : "—"}</td>
                      <td className="py-2.5 pr-3"><StatusBadge status={row.status} /></td>
                      <td className="py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${TONES[row.conclusion.tone]}`}>
                          {row.conclusion.label}
                        </span>
                        {row.hasReport && canReport && (
                          <a href={`/api/samples/${row.id}/report`} className="ml-2 inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline">
                            <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                            Rapport
                          </a>
                        )}
                        {(() => {
                          const report = row.hasReport && canReport ? reportBySample.get(row.id) : undefined;
                          if (!report) return null;
                          const number = amendedNumber(report.number, report.version);
                          return (
                            <>
                              {report.version > 0 && <span className="mt-1 block font-mono text-[11px] text-slate-500">{number}</span>}
                              {report.amendmentPending && (
                                <span className="mt-1 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                                  Amendement en cours
                                </span>
                              )}
                              <ReportActions
                                compact
                                sampleId={row.id}
                                reportId={report.id}
                                role={session.role}
                                status={row.status}
                                number={number}
                                amendmentPending={report.amendmentPending}
                                sent={reportVersionSent(report)}
                              />
                            </>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-end gap-2 text-sm">
            {page > 1 && (
              <Link href={`/recherche?${searchQueryString(search, { page: String(page - 1) })}`} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Précédente
              </Link>
            )}
            {page < pages && (
              <Link href={`/recherche?${searchQueryString(search, { page: String(page + 1) })}`} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Suivante
              </Link>
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
