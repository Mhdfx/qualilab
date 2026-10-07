import Link from "next/link";
import { Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatDate } from "@/lib/labels";
import { PORTAL_SIEGE, isoDay, parsePortalFilters, portalQueryString } from "@/lib/portal-query";
import { loadPortalSamples, loadPortalSites, requirePortalPage } from "@/lib/portal-server";
import { PORTAL_STAGES, PORTAL_STAGE_LABELS } from "@/lib/portal-status";
import { PortalClosed } from "../_components/PortalClosed";
import { AmendedBadge, StageBadge } from "../_components/StageBadge";
import { ReportLink } from "../_components/ReportLink";

export const metadata = { title: "Mes échantillons" };

/**
 * The client's samples (PORTAIL.md §2): a plain GET form — the URL is the
 * search — over the period (sampling date), the site, the state and free
 * text; 50 per page, newest first. Only the account's own client, always.
 */
export default async function PortailEchantillonsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { access } = await requirePortalPage();
  if (!access.ok) return <PortalClosed reason={access.reason} />;

  const raw = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) if (typeof value === "string") params.set(key, value);
  const filters = parsePortalFilters(params);
  const filtered = [...params.keys()].some((key) => key !== "page");

  const [result, sites] = await Promise.all([
    loadPortalSamples(access.clientId, filters),
    loadPortalSites(access.clientId),
  ]);
  const { page, pages } = result;

  return (
    <div>
      <PageHeader
        badge="Espace client"
        title="Mes échantillons"
        subtitle="Suivez vos échantillons et téléchargez vos rapports dès qu'ils sont envoyés."
      />

      <Card className="p-5">
        <form method="GET" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <label htmlFor="q" className="block text-sm font-medium text-slate-700">Recherche</label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q ?? ""}
              placeholder="N° de contrôle, N° de série, désignation, lot…"
              className="input-field mt-1.5 px-3"
            />
          </div>
          <div>
            <label htmlFor="site" className="block text-sm font-medium text-slate-700">Site</label>
            <select id="site" name="site" defaultValue={filters.siteId ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              <option value={PORTAL_SIEGE}>Siège</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="etat" className="block text-sm font-medium text-slate-700">État</label>
            <select id="etat" name="etat" defaultValue={filters.stage ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              {PORTAL_STAGES.map((stage) => (
                <option key={stage} value={stage}>{PORTAL_STAGE_LABELS[stage]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="du" className="block text-sm font-medium text-slate-700">Prélevé du</label>
            <input id="du" name="du" type="date" defaultValue={filters.from ? isoDay(filters.from) : ""} className="input-field mt-1.5 px-3" />
          </div>
          <div>
            <label htmlFor="au" className="block text-sm font-medium text-slate-700">Au</label>
            <input id="au" name="au" type="date" defaultValue={filters.to ? isoDay(filters.to) : ""} className="input-field mt-1.5 px-3" />
          </div>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2">
            <button
              type="submit"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              Rechercher
            </button>
            {filtered && (
              <Link
                href="/portail/echantillons"
                className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Effacer
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card className="mt-5 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Échantillons</h2>
          <p className="text-sm text-slate-500">
            {result.total} échantillon{result.total > 1 ? "s" : ""}
            {pages > 1 && ` · page ${page} / ${pages}`}
          </p>
        </div>
        {result.rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {filtered ? "Aucun échantillon ne correspond à ces critères." : "Aucun échantillon pour le moment."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">N° de contrôle</th>
                  <th className="pb-2 pr-3 font-medium">N° de série</th>
                  <th className="pb-2 pr-3 font-medium">Site</th>
                  <th className="pb-2 pr-3 font-medium">Désignation</th>
                  <th className="pb-2 pr-3 font-medium">Lot</th>
                  <th className="pb-2 pr-3 font-medium">Prélevé le</th>
                  <th className="pb-2 pr-3 font-medium">Reçu le</th>
                  <th className="pb-2 pr-3 font-medium">État</th>
                  <th className="pb-2 font-medium">Rapport</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top">
                    <td className="py-2.5 pr-3 font-mono font-semibold text-slate-900">{row.controlCode ?? "—"}</td>
                    <td className="py-2.5 pr-3 font-mono text-slate-600">{row.serialNumber}</td>
                    <td className="py-2.5 pr-3 text-slate-700">{row.siteName ?? "Siège"}</td>
                    <td className="py-2.5 pr-3 text-slate-800">{row.designation ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{row.numeroLot ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{formatDate(row.sampledAt)}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{row.receivedAt ? formatDate(row.receivedAt) : "—"}</td>
                    <td className="py-2.5 pr-3"><StageBadge stage={row.stage} /></td>
                    <td className="py-2.5">
                      {row.report ? (
                        <div className="flex flex-col items-start gap-1">
                          <ReportLink sampleId={row.id} number={row.report.number} />
                          {row.report.sentAt && (
                            <span className="text-xs text-slate-500">envoyé le {formatDate(row.report.sentAt)}</span>
                          )}
                          {row.report.amended && <AmendedBadge />}
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-end gap-2 text-sm">
            {page > 1 && (
              <Link
                href={`/portail/echantillons?${portalQueryString({ ...filters, page: page - 1 })}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
              >
                Précédente
              </Link>
            )}
            {page < pages && (
              <Link
                href={`/portail/echantillons?${portalQueryString({ ...filters, page: page + 1 })}`}
                className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
              >
                Suivante
              </Link>
            )}
          </nav>
        )}
      </Card>
    </div>
  );
}
