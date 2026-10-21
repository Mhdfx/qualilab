import Link from "next/link";
import { ChevronRight, Filter, RotateCcw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERIE_KIND_LABELS, formatDateTime } from "@/lib/labels";
import { DEFAULT_PAGE_SIZE, toPage } from "@/lib/pagination";
import { dayRangeParams } from "@/lib/day-range";
import {
  RECEPTION_HISTORY_PATH,
  CLIENT_QUERY_MAX,
  hasReceptionHistoryFilter,
  parseReceptionHistoryFilters,
  receptionCounts,
  receptionHistoryHref,
  receptionHistoryWhere,
} from "@/lib/reception-history";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Historique des réceptions" };

/**
 * « Historique des réceptions »: every série already received, newest
 * reception first, 50 per page (`lib/pagination.ts`), by period (the
 * reception's day on the laboratory's clock, `lib/day-range.ts`) and client. Each row opens
 * the série's page, which shows a received série as received.
 */
export default async function ReceptionHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("RECEPTIONNISTE", "ADMIN");
  const filters = parseReceptionHistoryFilters(await searchParams);
  const { du, au } = dayRangeParams(filters);

  const rows = await prisma.serie.findMany({
    where: receptionHistoryWhere(filters),
    orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
    take: DEFAULT_PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      serialNumber: true,
      kind: true,
      receivedAt: true,
      client: { select: { name: true } },
      site: { select: { name: true } },
      receivedBy: { select: { name: true } },
      samples: { select: { conformity: true } },
    },
  });
  const { items: series, nextCursor } = toPage(rows, DEFAULT_PAGE_SIZE);
  const filtered = hasReceptionHistoryFilter(filters);

  return (
    <div>
      <PageHeader
        badge="Réception"
        title="Historique des réceptions"
        subtitle="Les séries déjà réceptionnées, de la plus récente à la plus ancienne. 50 séries par page."
      />

      <Card className="p-5">
        <form method="GET" action={RECEPTION_HISTORY_PATH} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="client" className="block text-sm font-medium text-slate-700">Client</label>
            <input
              id="client"
              name="client"
              type="search"
              defaultValue={filters.client ?? ""}
              maxLength={CLIENT_QUERY_MAX}
              placeholder="Nom ou partie du nom du client"
              className="input-field mt-1.5 px-3"
            />
          </div>
          <div>
            <label htmlFor="du" className="block text-sm font-medium text-slate-700">Reçue du</label>
            <input id="du" name="du" type="date" defaultValue={du} className="input-field mt-1.5 px-3" />
          </div>
          <div>
            <label htmlFor="au" className="block text-sm font-medium text-slate-700">Au</label>
            <input id="au" name="au" type="date" defaultValue={au} className="input-field mt-1.5 px-3" />
          </div>
          <div className="flex flex-wrap items-start gap-2 sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              Filtrer
            </button>
            {filtered && (
              <Link
                href={RECEPTION_HISTORY_PATH}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Effacer
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {series.length === 0 ? (
          <p role="status" className="p-8 text-center text-sm text-slate-500">
            {filters.cursor
              ? "Aucune série plus ancienne."
              : filtered
                ? "Aucune série réceptionnée ne correspond à ces critères."
                : "Aucune série réceptionnée pour le moment."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">Séries réceptionnées, de la plus récente à la plus ancienne</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">N° série</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Reçue le</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Client</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Reçue par</th>
                  <th scope="col" className="px-3 py-2.5 text-right font-medium">Échantillons</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Non conformes</th>
                </tr>
              </thead>
              <tbody>
                {series.map((serie) => {
                  const counts = receptionCounts(serie.samples);
                  return (
                    <tr key={serie.id} className="border-b border-slate-100 align-top transition-colors last:border-0 hover:bg-slate-50/70">
                      <td className="px-4 py-2.5">
                        <Link
                          href={`/reception/series/${serie.id}`}
                          className="inline-flex items-center gap-1 rounded font-mono font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {serie.serialNumber}
                          <span className="sr-only"> — ouvrir la série</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                        <span className="block text-xs text-slate-500">{SERIE_KIND_LABELS[serie.kind]}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-slate-600">
                        {serie.receivedAt ? (
                          <time dateTime={serie.receivedAt.toISOString()}>{formatDateTime(serie.receivedAt)}</time>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-slate-800">
                        {serie.client.name}
                        {serie.site && <span className="block text-xs text-slate-500">{serie.site.name}</span>}
                      </td>
                      <td className="px-3 py-2.5 text-slate-700">{serie.receivedBy?.name ?? <span className="text-slate-400">—</span>}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{counts.samples}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {counts.nonConform > 0 ? (
                          <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                            {counts.nonConform}
                          </span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(nextCursor || filters.cursor) && (
        <nav aria-label="Pages de l'historique" className="mt-4 flex flex-wrap items-center justify-end gap-2 text-sm">
          {filters.cursor && (
            <Link
              href={receptionHistoryHref(filters)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Revenir aux plus récentes
            </Link>
          )}
          {nextCursor && (
            <Link
              href={receptionHistoryHref(filters, nextCursor)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Séries plus anciennes
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
