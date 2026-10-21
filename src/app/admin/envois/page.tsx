import Link from "next/link";
import { ChevronRight, Filter, RotateCcw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { DEFAULT_PAGE_SIZE, toPage } from "@/lib/pagination";
import { amendedNumber } from "@/lib/report-amendment";
import { dayRangeParams } from "@/lib/day-range";
import { alertSamplesOf, type AlertSample } from "@/lib/alert-log-samples-server";
import {
  EMAIL_LOG_STATUSES,
  EMAIL_STATUS_LABELS,
  EMAIL_TYPE_LABELS,
  emailLogHref,
  emailLogWhere,
  hasEmailLogFilter,
  parseEmailLogFilters,
} from "@/lib/email-log-filters";
import { Card } from "@/components/ui/Card";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmailStatusBadge } from "@/components/emails/EmailStatusBadge";

export const metadata = { title: "Envois d'e-mails" };

const ENVOIS_PATH = "/admin/envois";

/**
 * The send journal (finalversion.md:123: date, recipient, status, resend):
 * every message written to `EmailLog` — reports, contamination alerts,
 * destruction notices — newest first, 50 per page (`lib/pagination.ts`),
 * filtered by a plain GET form so a view can be bookmarked. Read-only: a
 * report is resent from its sample's validation page (« Renvoyer au
 * client »), linked from each line. A contamination alert sent at the
 * technical validation, before the report existed, has no report: it links
 * to its sample, found through the alert's journal row (`alertSamplesOf`).
 */
export default async function EnvoisPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("ADMIN");
  const filters = parseEmailLogFilters(await searchParams);
  const { du, au } = dayRangeParams(filters);

  const rows = await prisma.emailLog.findMany({
    where: emailLogWhere(filters),
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: DEFAULT_PAGE_SIZE + 1,
    ...(filters.cursor ? { cursor: { id: filters.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      createdAt: true,
      type: true,
      to: true,
      subject: true,
      status: true,
      error: true,
      report: { select: { sampleId: true, number: true, version: true } },
    },
  });
  const { items: entries, nextCursor } = toPage(rows, DEFAULT_PAGE_SIZE);
  const filtered = hasEmailLogFilter(filters);
  // The alerts of this page that no report carries: their sample instead.
  const alertSamples = await alertSamplesOf(
    entries.filter((entry) => !entry.report && entry.type === "ALERTE_CONTAMINATION")
  );

  return (
    <div>
      <PageHeader
        badge="Système"
        title="Envois d'e-mails"
        subtitle="Rapports, alertes de contamination, avis de destruction et avis d'échantillon non reçu : date, destinataires, statut. 50 envois par page, les plus récents d'abord."
      />

      {!process.env.RESEND_API_KEY && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
          <b>Mode démonstration :</b> aucun service d&apos;envoi n&apos;est configuré. Les messages sont inscrits ici
          avec le statut « {EMAIL_STATUS_LABELS.SIMULE} » mais ne quittent pas le laboratoire.
        </p>
      )}

      <Card className="p-5">
        <form method="GET" action={ENVOIS_PATH} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="type" className="block text-sm font-medium text-slate-700">Type</label>
            <select id="type" name="type" defaultValue={filters.type ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              {(Object.keys(EMAIL_TYPE_LABELS) as (keyof typeof EMAIL_TYPE_LABELS)[]).map((type) => (
                <option key={type} value={type}>{EMAIL_TYPE_LABELS[type]}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="statut" className="block text-sm font-medium text-slate-700">Statut</label>
            <select id="statut" name="statut" defaultValue={filters.status ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              {EMAIL_LOG_STATUSES.map((status) => (
                <option key={status} value={status}>{EMAIL_STATUS_LABELS[status]}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="du" className="block text-sm font-medium text-slate-700">Du</label>
            <input id="du" name="du" type="date" defaultValue={du} className="input-field mt-1.5 px-3" />
          </div>
          <div>
            <label htmlFor="au" className="block text-sm font-medium text-slate-700">Au</label>
            <input id="au" name="au" type="date" defaultValue={au} className="input-field mt-1.5 px-3" />
          </div>
          <div className="flex flex-wrap items-start gap-2 sm:col-span-2 lg:col-span-6">
            <button
              type="submit"
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              Filtrer
            </button>
            {filtered && (
              <Link
                href={ENVOIS_PATH}
                className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Effacer
              </Link>
            )}
          </div>
        </form>
      </Card>

      <Card className="mt-4 overflow-hidden">
        {entries.length === 0 ? (
          <p role="status" className="p-8 text-center text-sm text-slate-500">
            {filters.cursor
              ? "Aucun envoi plus ancien."
              : filtered
                ? "Aucun envoi ne correspond à ces critères."
                : "Aucun e-mail envoyé pour le moment."}
          </p>
        ) : (
          // `relative`: the links' screen-reader texts (absolute) stay inside
          // the scroller instead of widening the page on a phone.
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <caption className="sr-only">Journal des envois d&apos;e-mails, du plus récent au plus ancien</caption>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-2.5 font-medium">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Destinataires</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Objet</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">Statut</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Échantillon</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-slate-600">
                      <time dateTime={entry.createdAt.toISOString()}>{formatDateTime(entry.createdAt)}</time>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{EMAIL_TYPE_LABELS[entry.type]}</td>
                    <td className="max-w-[16rem] break-words px-3 py-2.5 text-slate-800">{entry.to}</td>
                    <td className="max-w-[18rem] break-words px-3 py-2.5 text-slate-700">{entry.subject}</td>
                    <td className="px-3 py-2.5">
                      <EmailStatusBadge status={entry.status} />
                      {entry.error && (
                        <span className="mt-1 block max-w-[14rem] break-words text-xs text-rose-700">{entry.error}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {entry.report ? (
                        <Link
                          href={`/validation/${entry.report.sampleId}`}
                          className="inline-flex items-center gap-1 rounded font-mono text-xs font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          {amendedNumber(entry.report.number, entry.report.version)}
                          <span className="sr-only"> — ouvrir l&apos;échantillon</span>
                          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      ) : (
                        <UnlinkedSend sample={alertSamples.get(entry.id)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {(nextCursor || filters.cursor) && (
        <nav aria-label="Pages des envois" className="mt-4 flex flex-wrap items-center justify-end gap-2 text-sm">
          {filters.cursor && (
            <Link
              href={emailLogHref(filters)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Revenir aux plus récents
            </Link>
          )}
          {nextCursor && (
            <Link
              href={emailLogHref(filters, nextCursor)}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Envois plus anciens
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

/**
 * The « Échantillon » cell of a send no report carries: an alert sent at the
 * technical validation (the only alerts without a report — the sample may
 * have been cancelled since, and never get one) links to its sample;
 * anything else (a destruction notice, « non reçu », an alert whose sample
 * is not found) reads « non rattaché ».
 */
function UnlinkedSend({ sample }: { sample: AlertSample | undefined }) {
  if (!sample) return <span className="text-xs text-slate-400">non rattaché</span>;
  return (
    <>
      <Link
        href={`/validation/${sample.id}`}
        className="inline-flex items-center gap-1 rounded font-mono text-xs font-semibold text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        {sample.reference}
        <span className="sr-only"> — ouvrir l&apos;échantillon</span>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
      <span className="mt-0.5 block whitespace-nowrap text-[11px] text-slate-500">alerte à la validation technique</span>
    </>
  );
}
