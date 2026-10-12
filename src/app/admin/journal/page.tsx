import Link from "next/link";
import { ChevronRight, Filter, RotateCcw } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/labels";
import { ROLE_LABELS, isPortalRole, isRole } from "@/lib/roles";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { ACTION_LABELS, actionChoices, actionLabel } from "@/lib/audit-labels";
import {
  JOURNAL_ORDER,
  JOURNAL_PAGE_SIZE,
  JOURNAL_PATH,
  SYSTEM_ACTOR,
  entryMetadata,
  entryReference,
  isFiltered,
  journalHref,
  journalPage,
  journalWhere,
  parseJournalFilters,
  referenceTargets,
  type ReferenceMatches,
} from "@/lib/audit-journal-filters";

export const metadata = { title: "Journal d'audit" };

/**
 * The audit journal — the traceability promise made visible.
 *
 * Read-only by construction: nothing in the interface can alter an entry.
 * Newest first, 50 per page with « Actions plus anciennes » (keyset cursor),
 * filtered by a plain GET form — the address is the search, so an
 * investigation can be shared and survives a reload. « Référence » finds the
 * record server-side (sample, série, client, invoice) and filters on its id:
 * only indexed columns are searched, never the metadata text.
 */

type Params = Record<string, string | string[] | undefined>;

/** Finds what a typed reference designates — each lookup hits a unique or indexed column. */
async function resolveReference(reference: string): Promise<ReferenceMatches> {
  const [samples, series, clients, invoices] = await Promise.all([
    prisma.sample.findMany({
      where: { OR: [{ code: reference }, { controlCode: reference }] },
      select: { id: true, report: { select: { id: true } } },
      take: 2,
    }),
    prisma.serie.findMany({ where: { serialNumber: reference }, select: { id: true }, take: 1 }),
    prisma.client.findMany({
      // Both values of `archived` spelled out: the [archived, name] index serves an exact name.
      where: {
        OR: [{ id: reference }, { archived: false, name: reference }, { archived: true, name: reference }],
      },
      select: { id: true },
      take: 20,
    }),
    prisma.invoice.findMany({ where: { number: reference }, select: { id: true }, take: 1 }),
  ]);
  return {
    samples: samples.map((sample) => ({ id: sample.id, reportId: sample.report?.id ?? null })),
    series,
    clients,
    invoices,
  };
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count > 1 ? many : one}`;
}

/** « 1 échantillon (et son rapport), 1 client » — what the reference matched. */
function matchesSummary(matches: ReferenceMatches): string {
  const parts: string[] = [];
  if (matches.samples.length) {
    const withReport = matches.samples.some((sample) => sample.reportId);
    parts.push(`${plural(matches.samples.length, "échantillon", "échantillons")}${withReport ? " (et son rapport)" : ""}`);
  }
  if (matches.series.length) parts.push(plural(matches.series.length, "série", "séries"));
  if (matches.clients.length) parts.push(plural(matches.clients.length, "client", "clients"));
  if (matches.invoices.length) parts.push(plural(matches.invoices.length, "facture", "factures"));
  return parts.join(", ");
}

export default async function JournalPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole("ADMIN");
  const params = await searchParams;

  // Banned accounts stay in the list: their past actions are still theirs.
  const users = await prisma.user.findMany({
    select: { id: true, name: true, username: true, role: true, banned: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const filters = parseJournalFilters(params, {
    actions: Object.keys(ACTION_LABELS),
    actorIds: users.map((user) => user.id),
  });

  const matches = filters.reference ? await resolveReference(filters.reference) : null;
  const targets = matches ? referenceTargets(matches) : null;
  const unresolved = targets !== null && targets.length === 0;

  const rows = unresolved
    ? []
    : await prisma.auditLog.findMany({
        where: journalWhere(filters, targets),
        orderBy: JOURNAL_ORDER,
        take: JOURNAL_PAGE_SIZE + 1,
        include: { actor: { select: { name: true, role: true } } },
      });
  const { items: entries, nextCursor } = journalPage(rows);

  const filtered = isFiltered(filters);
  const staff = users.filter((user) => !isPortalRole(user.role));
  const portal = users.filter((user) => isPortalRole(user.role));
  const userOption = (user: (typeof users)[number]) => (
    <option key={user.id} value={user.id}>
      {user.name}
      {user.username ? ` (${user.username})` : ""}
      {user.banned ? " — désactivé" : ""}
    </option>
  );

  return (
    <div>
      <PageHeader
        badge="Système"
        title="Journal d'audit"
        subtitle="Qui a fait quoi, et quand. 50 actions par page, les plus récentes d'abord."
      />

      <Card className="p-5">
        <form method="GET" action={JOURNAL_PATH} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <label htmlFor="action" className="block text-sm font-medium text-slate-700">Action</label>
            <select id="action" name="action" defaultValue={filters.action ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Toutes</option>
              {actionChoices().map((choice) => (
                <option key={choice.value} value={choice.value}>{choice.label}</option>
              ))}
            </select>
          </div>
          <div className="lg:col-span-2">
            <label htmlFor="acteur" className="block text-sm font-medium text-slate-700">Utilisateur</label>
            <select id="acteur" name="acteur" defaultValue={filters.actor ?? ""} className="input-field mt-1.5 px-3">
              <option value="">Tous</option>
              <option value={SYSTEM_ACTOR}>Système (aucun utilisateur connecté)</option>
              {staff.length > 0 && <optgroup label="Personnel du laboratoire">{staff.map(userOption)}</optgroup>}
              {portal.length > 0 && <optgroup label="Comptes du portail client">{portal.map(userOption)}</optgroup>}
            </select>
          </div>
          <div>
            <label htmlFor="du" className="block text-sm font-medium text-slate-700">Du</label>
            <input id="du" name="du" type="date" defaultValue={filters.fromDay ?? ""} className="input-field mt-1.5 px-3" />
          </div>
          <div>
            <label htmlFor="au" className="block text-sm font-medium text-slate-700">Au</label>
            <input id="au" name="au" type="date" defaultValue={filters.toDay ?? ""} className="input-field mt-1.5 px-3" />
          </div>
          <div className="sm:col-span-2 lg:col-span-3">
            <label htmlFor="ref" className="block text-sm font-medium text-slate-700">Référence</label>
            <input
              id="ref"
              name="ref"
              type="search"
              defaultValue={filters.reference ?? ""}
              placeholder="N° de contrôle, code, N° de série, client, N° de facture…"
              aria-describedby="ref-hint"
              className="input-field mt-1.5 px-3"
            />
            <p id="ref-hint" className="mt-1 text-xs text-slate-500">
              Le numéro exact, ou le nom exact du client.
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 sm:col-span-2 lg:col-span-3 lg:pt-7">
            <button
              type="submit"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              Filtrer
            </button>
            {filtered && (
              <Link
                href={JOURNAL_PATH}
                className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Effacer
              </Link>
            )}
          </div>
        </form>
      </Card>

      {matches && !unresolved && (
        <p className="mt-4 text-sm text-slate-600">
          Référence <span className="font-mono font-medium text-slate-800">{filters.reference}</span> :{" "}
          {matchesSummary(matches)}.
        </p>
      )}

      <Card className="mt-4 overflow-hidden">
        {unresolved ? (
          <p role="status" className="p-8 text-center text-sm text-slate-600">
            Aucun échantillon, série, client ou facture ne porte la référence{" "}
            <span className="font-mono font-medium text-slate-800">{filters.reference}</span>. Vérifiez le
            numéro exact (N° de contrôle, code de l&apos;échantillon, N° de série « 2780/26 », N° de facture)
            ou le nom exact du client.
          </p>
        ) : entries.length === 0 ? (
          <p role="status" className="p-8 text-center text-sm text-slate-500">
            {filters.cursor
              ? "Aucune action plus ancienne."
              : filtered
                ? "Aucune action ne correspond à ces critères."
                : "Aucune action enregistrée pour le moment."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const metadata = entryMetadata(entry.metadata);
              const reference = entryReference(metadata);
              return (
                <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800">
                      {actionLabel(entry.action)}
                      {metadata.portal === true && " (portail client)"}
                      {reference && (
                        <span className="ml-2 break-all font-mono text-xs text-slate-500">{reference}</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.actor?.name ?? "Système"}
                      {entry.actor?.role && isRole(entry.actor.role) && <> · {ROLE_LABELS[entry.actor.role]}</>}
                    </p>
                  </div>
                  <time
                    dateTime={entry.createdAt.toISOString()}
                    className="shrink-0 text-xs tabular-nums text-slate-500"
                  >
                    {formatDateTime(entry.createdAt)}
                  </time>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {(nextCursor || filters.cursor) && (
        <nav aria-label="Pages du journal" className="mt-4 flex flex-wrap items-center justify-end gap-2 text-sm">
          {filters.cursor && (
            <Link
              href={journalHref(filters)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Revenir aux plus récentes
            </Link>
          )}
          {nextCursor && (
            <Link
              href={journalHref(filters, nextCursor)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Actions plus anciennes
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
