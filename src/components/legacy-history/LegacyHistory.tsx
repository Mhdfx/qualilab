import Link from "@/components/ui/AppLink";
import { AlertTriangle, CheckCircle2, History, Info, Search, XCircle } from "lucide-react";
import type { Interpretation } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { INTERPRETATION_LABELS } from "@/lib/interpretation";
import { formatDate, formatDecimal } from "@/lib/labels";
import {
  LEGACY_HISTORY_NOTICE,
  LEGACY_NON_SATISFYING_MARK,
  LEGACY_SIEGE,
  legacyHistoryQueryString,
  type LegacyHistoryFilters,
} from "@/lib/legacy-history";
import type { LegacyHistoryPage, LegacyHistoryRow, LegacySampleDetail } from "@/lib/legacy-history-server";

/**
 * Lot 5B, HA4–HA5 (RETOUR-LABO-20-11.md §6) — the screens of the old
 * software's history, the same for the portal and the fiche client: the
 * notice that the signed report prevails, the list (50 per page, newest
 * first, filters by period, site and text) and one sample's analyses. Server
 * components: every row they get was loaded for one client only
 * (legacy-history-server.ts). No price, no member of the staff.
 */

const nf = (value: number) => formatDecimal(value, 0);

/** « Données reprises de l'ancien logiciel… — le rapport signé fait foi. » */
export function LegacyHistoryNotice() {
  return (
    <p role="note" className="flex items-start gap-2.5 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" aria-hidden="true" />
      <span>
        {LEGACY_HISTORY_NOTICE}{" "}
        Pour un document officiel, demandez au laboratoire le rapport d&apos;origine.
      </span>
    </p>
  );
}

const TONES: Record<Interpretation, { className: string; Icon: typeof CheckCircle2 }> = {
  SATISFAISANT: { className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CheckCircle2 },
  ACCEPTABLE: { className: "bg-amber-50 text-amber-700 ring-amber-200", Icon: AlertTriangle },
  NON_SATISFAISANT: { className: "bg-rose-50 text-rose-700 ring-rose-200", Icon: XCircle },
  INCOMPLET: { className: "bg-slate-100 text-slate-600 ring-slate-200", Icon: Info },
};

/**
 * The old software's verdict in its own words (« Conforme », « Satisfaisant »,
 * « Nettoyage urgent »), coloured by our scale; a wording with no place on it
 * (an oil's grade) in grey; none: a dash.
 */
export function LegacyVerdict({ interpretation, label }: { interpretation: Interpretation | null; label: string | null }) {
  const text = label ?? (interpretation ? INTERPRETATION_LABELS[interpretation] : null);
  if (!text) return <span className="text-slate-400">—</span>;
  if (!interpretation) {
    return <span className="inline-flex whitespace-nowrap rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">{text}</span>;
  }
  const { className, Icon } = TONES[interpretation];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${className}`}>
      <Icon className="h-3 w-3" aria-hidden="true" />
      {text}
    </span>
  );
}

const day = (date: Date | null) => (date ? formatDate(date) : "—");

/**
 * « Analyse non satisfaisante » — a sample with no verdict of its own but an
 * analysis read « non satisfaisant » (`legacyNonSatisfyingMark`): shown next
 * to the « — » so the non-conformity never hides behind a blank; no sample
 * verdict is invented.
 */
export function LegacyNonSatisfyingMark() {
  return (
    <span
      title="Le rapport ne porte pas de verdict pour l'échantillon ; au moins une de ses analyses est non satisfaisante — voir le détail."
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 ring-1 ring-rose-200"
    >
      <XCircle className="h-3 w-3" aria-hidden="true" />
      {LEGACY_NON_SATISFYING_MARK}
    </span>
  );
}

/** The list with its filter form (a plain GET form: the URL is the search). */
export function LegacyHistoryList({
  page,
  filters,
  sites,
  basePath,
}: {
  page: LegacyHistoryPage;
  filters: LegacyHistoryFilters;
  sites: { id: string; name: string }[];
  /** « /portail/historique », « /commercial/<id>/historique »: the list's own path; a sample is `${basePath}/${id}`. */
  basePath: string;
}) {
  const filtered = Boolean(filters.q || filters.siteId || filters.fromDay || filters.toDay);
  return (
    <>
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
              <option value={LEGACY_SIEGE}>Siège</option>
              {sites.map((site) => (
                <option key={site.id} value={site.id}>{site.name}</option>
              ))}
            </select>
          </div>
          <div className="hidden lg:block" aria-hidden="true" />
          <div>
            <label htmlFor="du" className="block text-sm font-medium text-slate-700">Reçu du</label>
            <input id="du" name="du" type="date" defaultValue={filters.fromDay ?? ""} className="input-field mt-1.5 px-3" />
          </div>
          <div>
            <label htmlFor="au" className="block text-sm font-medium text-slate-700">Au</label>
            <input id="au" name="au" type="date" defaultValue={filters.toDay ?? ""} className="input-field mt-1.5 px-3" />
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
                href={basePath}
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Échantillons de l&apos;ancien logiciel</h2>
          <p className="text-sm text-slate-500">
            {nf(page.total)} échantillon{page.total > 1 ? "s" : ""}
            {page.pages > 1 && ` · page ${page.page} / ${page.pages}`}
          </p>
        </div>
        {page.rows.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {filtered ? "Aucun échantillon ne correspond à ces critères." : "Aucun échantillon repris de l'ancien logiciel."}
          </p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <LegacyRowsTable rows={page.rows} basePath={basePath} />
          </div>
        )}
        {page.pages > 1 && (
          <nav aria-label="Pagination" className="mt-4 flex items-center justify-end gap-2 text-sm">
            {page.page > 1 && (
              <Link href={`${basePath}?${legacyHistoryQueryString({ ...filters, page: page.page - 1 })}`} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Précédente
              </Link>
            )}
            {page.page < page.pages && (
              <Link href={`${basePath}?${legacyHistoryQueryString({ ...filters, page: page.page + 1 })}`} className="rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50">
                Suivante
              </Link>
            )}
          </nav>
        )}
      </Card>
    </>
  );
}

/** The rows of the list (also the fiche card's ten latest). */
export function LegacyRowsTable({ rows, basePath }: { rows: LegacyHistoryRow[]; basePath: string }) {
  return (
    <table className="w-full min-w-[1040px] text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th scope="col" className="pb-2 pr-3 font-medium">N° de contrôle</th>
          <th scope="col" className="pb-2 pr-3 font-medium">N° de série</th>
          <th scope="col" className="pb-2 pr-3 font-medium">Site</th>
          <th scope="col" className="pb-2 pr-3 font-medium">Désignation</th>
          <th scope="col" className="pb-2 pr-3 font-medium">Lot</th>
          <th scope="col" className="pb-2 pr-3 font-medium">Prélevé le</th>
          <th scope="col" className="pb-2 pr-3 font-medium">Reçu le</th>
          <th scope="col" className="pb-2 pr-3 font-medium">Rapport du</th>
          <th scope="col" className="pb-2 font-medium">Verdict</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
            <td className="py-2.5 pr-3 font-mono font-semibold">
              <Link href={`${basePath}/${row.id}`} className="text-brand underline-offset-2 hover:underline">
                {row.controlNumber ?? `n° ${row.id}`}
              </Link>
            </td>
            <td className="py-2.5 pr-3 font-mono text-slate-600">{row.serieNumber ?? "—"}</td>
            <td className="py-2.5 pr-3 text-slate-700">{row.siteName ?? "Siège"}</td>
            <td className="py-2.5 pr-3 text-slate-800">
              {row.designation ?? "—"}
              {row.place && <span className="block text-xs text-slate-500">{row.place}</span>}
            </td>
            <td className="py-2.5 pr-3 text-slate-600">{row.lot ?? "—"}</td>
            <td className="py-2.5 pr-3 text-slate-600">{day(row.sampledAt)}</td>
            <td className="py-2.5 pr-3 text-slate-600">{day(row.receivedAt)}</td>
            <td className="py-2.5 pr-3 text-slate-600">{day(row.reportedAt)}</td>
            <td className="py-2.5">
              <span className="inline-flex flex-wrap items-center gap-1.5">
                <LegacyVerdict interpretation={row.interpretation} label={row.verdictLabel} />
                {row.nonSatisfyingMark && <LegacyNonSatisfyingMark />}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** One sample: what it was, its analyses (per-unit readings when n > 1), its conclusion. */
export function LegacySampleView({ sample, backHref }: { sample: LegacySampleDetail; backHref: string }) {
  const facts: [string, string][] = [
    ["N° de contrôle", sample.controlNumber ?? "—"],
    ["N° de série", sample.serieNumber ?? "—"],
    ["Rapport", sample.reportNumber ? `n° ${sample.reportNumber}${sample.reportedAt ? ` du ${formatDate(sample.reportedAt)}` : ""}` : day(sample.reportedAt)],
    ["Site", sample.siteName ?? "Siège"],
    ["Type d'analyse", sample.nature ?? "—"],
    ["Famille de produits", sample.productType ?? "—"],
    ["Désignation", sample.designation ?? "—"],
    ["Lot", sample.lot ?? "—"],
    ["Lieu de prélèvement", sample.place ?? "—"],
    ["Prélevé le", day(sample.sampledAt)],
    ["Reçu le", day(sample.receivedAt)],
  ];
  return (
    <div className="space-y-5">
      <LegacyHistoryNotice />
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <History className="h-4 w-4 text-brand" aria-hidden="true" />
            Échantillon {sample.controlNumber ?? `n° ${sample.id}`}
          </h2>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <LegacyVerdict interpretation={sample.interpretation} label={sample.verdictLabel} />
            {sample.nonSatisfyingMark && <LegacyNonSatisfyingMark />}
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
              <dd className="mt-0.5 break-words text-sm font-medium text-slate-800">{value}</dd>
            </div>
          ))}
        </dl>
        {sample.amendmentNote && (
          <p className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2.5 text-sm text-violet-900">{sample.amendmentNote}</p>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Analyses</h2>
        {sample.results.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Aucune analyse reprise pour cet échantillon.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="pb-2 pr-3 font-medium">Paramètre</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Méthode</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Résultat</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Unité</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Critère</th>
                  <th scope="col" className="pb-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {sample.results.map((result) => (
                  <tr key={result.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="py-2.5 pr-3 font-medium text-slate-800">{result.parameter}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{result.method ?? "—"}</td>
                    <td className="py-2.5 pr-3 tabular-nums text-slate-900">
                      {result.readings.length > 1 ? (
                        <ol className="space-y-0.5">
                          {result.readings.map((reading) => (
                            <li key={reading.unit} className="whitespace-nowrap">
                              <span className="text-xs text-slate-500">Unité {reading.unit} :</span> {reading.value ?? "—"}
                              {reading.verdict && <span className="ml-1 text-xs text-slate-500">({reading.verdict.toLowerCase()})</span>}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        result.value ?? "—"
                      )}
                    </td>
                    <td className="py-2.5 pr-3 text-slate-600">{result.unit ?? "—"}</td>
                    <td className="py-2.5 pr-3 text-slate-600">{result.criterion ?? "—"}</td>
                    <td className="py-2.5">
                      <LegacyVerdict
                        interpretation={result.interpretation}
                        label={result.interpretation ? null : result.readings.length === 1 ? result.readings[0].verdict : null}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {(sample.conclusion || sample.observation) && (
          <div className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            {sample.conclusion && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Conclusion</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{sample.conclusion}</p>
              </div>
            )}
            {sample.observation && (
              <div>
                <h3 className="text-xs font-medium uppercase tracking-wide text-slate-500">Observation</h3>
                <p className="mt-1 whitespace-pre-line text-sm text-slate-800">{sample.observation}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      <Link href={backHref} className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
        Retour à l&apos;historique
      </Link>
    </div>
  );
}
