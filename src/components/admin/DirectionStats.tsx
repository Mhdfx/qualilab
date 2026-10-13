import Link from "next/link";
import {
  FlaskConical,
  Clock,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
  Inbox,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { billingFigures } from "@/components/invoices/invoice-queries";
import { formatCurrency, SAMPLE_STATUS_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { OPEN_STATUSES, rechercheHref } from "@/lib/sample-search";
import { countInStatuses, invoiceTileHref } from "@/lib/management-views";
import { serverIsoDay, viewHref } from "@/lib/dashboard-view";
import { BENCH_STATUSES, TAKEN_WHERE, UNCLAIMED_WHERE } from "@/lib/bench-access";
import { BENCH_VIEWS } from "@/lib/circuit-views";
import { benchLoadByTechnician, technicianLoadText } from "@/lib/technician-load";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import type { SampleStatus, SampleType } from "@/generated/prisma/client";

/** The admin's invoice list — the direction view lives in the admin space. */
const INVOICES = "/admin/factures";

/** The bench, where the admin oversees « À prendre » and every taken sample (`#analyses`). */
const BENCH = "/technicien";
const BENCH_ANCHOR = "analyses";

/**
 * The direction view: where the laboratory stands, in the numbers a director
 * actually asks for — what is in the pipeline, how long it takes, what was
 * billed and what was collected.
 *
 * Every figure that counts rows opens exactly those rows (« comme un tri »):
 * the samples in /recherche (`rechercheHref`), the bench's « À prendre » in
 * its own view (same filter, `UNCLAIMED_WHERE`), the invoices in the admin's
 * list (`invoiceTileHref`). « Délai moyen », « Alertes de contamination » and
 * the per-technician figures of « Paillasse — qui tient quoi » have no such
 * list and stay plain figures.
 *
 * Prise en charge libre (PROGRAMME.md §10): nobody assigns a technician, so
 * the admin watches what waits to be taken and who holds what — the load
 * read with the bench's own rule (`benchLoadByTechnician`, legacy
 * per-parameter technicians included).
 *
 * A server component: the aggregates run in the database, and the page carries
 * only the results.
 */
export async function DirectionStats() {
  // One clock for the page: the month's start and the « en retard » test.
  const now = new Date();
  const monthStart = new Date(now);
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byStatus, byType, delays, billing, alertsThisMonth, blocked, toTake, benchLines] =
    await Promise.all([
      prisma.sample.groupBy({ by: ["status"], _count: { _all: true } }),
      // « Ce mois-ci » by sampling date — the date /recherche filters on
      // with `date=prelevement`, so each row opens exactly what it counts.
      prisma.sample.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: { sampledAt: { gte: monthStart } },
      }),
      // Turnaround: reception → final approval, over the approved samples.
      prisma.sample.findMany({
        where: { approvedAt: { not: null }, receivedAt: { not: null } },
        select: { receivedAt: true, approvedAt: true },
        orderBy: { approvedAt: "desc" },
        take: 100,
      }),
      // FACTURATION.md §4: issued, non-cancelled invoices minus credit notes;
      // collected = the sum of the settlements (one source with the
      // comptable's list and the client fiche).
      billingFigures(),
      prisma.emailLog.count({
        where: {
          type: "ALERTE_CONTAMINATION",
          createdAt: { gte: monthStart },
        },
      }),
      prisma.sample.count({
        where: { analysisBlocked: true, status: "RECU" },
      }),
      // « À prendre »: the bench's own filter, so the figure and the list it
      // opens cannot disagree.
      prisma.sample.count({ where: UNCLAIMED_WHERE }),
      // « Paillasse — qui tient quoi »: the taken lines on the bench, with
      // what the load reads (current work only — tens of rows).
      prisma.sample.findMany({
        where: { status: { in: [...BENCH_STATUSES] }, AND: [TAKEN_WHERE] },
        select: {
          technicianId: true,
          status: true,
          dueAt: true,
          parameters: { select: { technicianId: true } },
        },
      }),
    ]);

  const loads = benchLoadByTechnician(benchLines, now);
  const holderIds = Object.keys(loads);
  // Every holder by name — a disabled account or a former technician too:
  // their samples are still on the bench, and the admin must see whose.
  const holderAccounts =
    holderIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: holderIds } },
          select: { id: true, name: true, role: true, banned: true },
        })
      : [];
  const accountById = new Map(holderAccounts.map((account) => [account.id, account]));
  const holders = Object.entries(loads)
    .map(([id, load]) => ({ id, load, account: accountById.get(id) ?? null }))
    .sort(
      (a, b) =>
        b.load.samples - a.load.samples ||
        (a.account?.name ?? "").localeCompare(b.account?.name ?? "", "fr")
    );

  const statusCount = new Map<SampleStatus, number>(
    byStatus.map((row) => [row.status, row._count._all])
  );
  // « En cours » of /recherche: the same five steps, one list.
  const inPipeline = countInStatuses(statusCount, OPEN_STATUSES);

  const turnaroundHours =
    delays.length > 0
      ? delays.reduce(
          (sum, row) =>
            sum +
            (row.approvedAt!.getTime() - row.receivedAt!.getTime()) / 3_600_000,
          0
        ) / delays.length
      : null;

  const turnaround =
    turnaroundHours === null
      ? "—"
      : turnaroundHours < 48
        ? `${Math.round(turnaroundHours)} h`
        : `${(turnaroundHours / 24).toFixed(1)} j`;

  const STATUS_ORDER: SampleStatus[] = [
    "PRELEVE",
    "RECU",
    "PROGRAMME",
    "EN_ANALYSE",
    "RESULTATS_SAISIS",
    "VALIDE",
    "RAPPORT_ENVOYE",
  ];
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => statusCount.get(s) ?? 0));
  // « Ce mois-ci » opens /recherche from the very instant it counted from.
  const monthFrom = serverIsoDay(monthStart);

  // A row of the two cards below that opens a list: the whole row is the
  // link, its figure in the accessible name.
  const rowLink =
    "group -mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";

  return (
    <section aria-label="Vue direction" className="mb-8">
      {blocked > 0 && (
        <Link
          href="/reception#bloques"
          className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 transition hover:bg-amber-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <b>
              {blocked} échantillon{blocked > 1 ? "s" : ""} bloqué
              {blocked > 1 ? "s" : ""} en réception
            </b>{" "}
            (non-conformité) — votre libération est attendue pour lancer
            l&apos;analyse.
          </span>
        </Link>
      )}
      {/* Five tiles: the laboratory's work on one row (three), the money on
          the next (two, wide enough for the amounts); two by two on a
          tablet, the turnaround alone between them. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="*:h-full lg:col-span-2">
          <StatCard
            label="En cours de traitement"
            value={inPipeline}
            icon={FlaskConical}
            accent="blue"
            href={rechercheHref({ state: "en_cours" })}
          />
        </div>
        <div className="*:h-full lg:col-span-2">
          <StatCard
            label={BENCH_VIEWS.a_prendre}
            value={toTake}
            icon={Inbox}
            accent="amber"
            href={viewHref(BENCH, "a_prendre", BENCH_ANCHOR)}
            hint="programme confirmé, en attente d'un technicien"
          />
        </div>
        <div className="*:h-full sm:col-span-2 lg:col-span-2">
          <StatCard
            label="Délai moyen (réception → validation)"
            value={turnaround}
            icon={Clock}
            accent="violet"
            hint={
              delays.length > 1
                ? `sur les ${delays.length} dernières validations`
                : delays.length === 1
                  ? "sur la dernière validation"
                  : undefined
            }
          />
        </div>
        <div className="*:h-full lg:col-span-3">
          <StatCard
            label="Facturé"
            value={formatCurrency(billing.billed)}
            icon={TrendingUp}
            accent="brand"
            href={invoiceTileHref(INVOICES, { state: "EMISES" })}
          />
        </div>
        <div className="*:h-full lg:col-span-3">
          <StatCard
            label="Encaissé"
            value={formatCurrency(billing.collected)}
            icon={Wallet}
            accent="emerald"
            href={invoiceTileHref(INVOICES, { state: "AVEC_REGLEMENT" })}
          />
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Échantillons par statut
          </h2>
          <ul className="mt-2 space-y-0.5">
            {STATUS_ORDER.map((status) => {
              const count = statusCount.get(status) ?? 0;
              const label = SAMPLE_STATUS_LABELS[status];
              return (
                <li key={status}>
                  <Link
                    href={rechercheHref({ status })}
                    aria-label={`${label} : ${count}`}
                    className={rowLink}
                  >
                    <span className="w-36 shrink-0 text-slate-600 transition-colors group-hover:text-brand">
                      {label}
                    </span>
                    <span
                      aria-hidden="true"
                      className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                    >
                      <span
                        className="block h-full rounded-full bg-brand/80"
                        style={{ width: `${(count / maxStatus) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 shrink-0 text-right font-semibold tabular-nums text-slate-800">
                      {count}
                    </span>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ce mois-ci
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">Par date de prélèvement</p>
          <ul className="mt-2 space-y-0.5">
            {(Object.keys(SAMPLE_TYPE_LABELS) as SampleType[]).map((type) => {
              const count =
                byType.find((row) => row.type === type)?._count._all ?? 0;
              const label = SAMPLE_TYPE_LABELS[type];
              return (
                <li key={type}>
                  <Link
                    href={rechercheHref({ type, dateField: "prelevement", from: monthFrom })}
                    aria-label={`${label}, ce mois-ci : ${count}`}
                    className={`${rowLink} justify-between`}
                  >
                    <span className="text-slate-600 transition-colors group-hover:text-brand">{label}</span>
                    <span className="flex items-center gap-1.5 font-semibold tabular-nums text-slate-800">
                      {count}
                      <ChevronRight
                        className="h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-brand"
                        aria-hidden="true"
                      />
                    </span>
                  </Link>
                </li>
              );
            })}
            {/* No screen lists the e-mails sent: a plain figure, not a link. */}
            <li className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm">
              <span className="flex items-center gap-1.5 text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
                Alertes de contamination
              </span>
              <span className="flex items-center gap-1.5 font-semibold tabular-nums text-slate-800">
                {alertsThisMonth}
                {/* Lines the figure up with the linked rows' chevrons. */}
                <span className="w-4 shrink-0" aria-hidden="true" />
              </span>
            </li>
          </ul>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Paillasse — qui tient quoi
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Échantillons programmés ou en analyse, par technicien qui les a pris en charge
            </p>
          </div>
          <Link
            href={viewHref(BENCH, null, BENCH_ANCHOR)}
            className="inline-flex items-center gap-1 rounded text-sm font-semibold text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Voir la paillasse
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
        {holders.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun échantillon pris en charge.</p>
        ) : (
          <ul className="mt-2 grid grid-cols-1 gap-x-8 gap-y-0.5 md:grid-cols-2">
            {holders.map(({ id, load, account }) => {
              // Off the bench while still holding samples: the admin's to
              // give back (« Libérer », nothing typed yet) or to finish.
              const away = !account
                ? null
                : account.banned
                  ? "compte désactivé"
                  : account.role !== "TECHNICIEN"
                    ? "n'est plus technicien"
                    : null;
              return (
                <li key={id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-sm">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="font-medium break-words text-slate-700">
                      {account?.name ?? "Compte inconnu"}
                    </span>
                    {away && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                        {away}
                      </span>
                    )}
                    <span className="sr-only"> — </span>
                  </span>
                  <span
                    className={`shrink-0 text-right tabular-nums ${
                      load.late > 0 ? "font-medium text-amber-700" : "text-slate-600"
                    }`}
                  >
                    {technicianLoadText(load)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
