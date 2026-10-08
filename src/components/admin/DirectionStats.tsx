import Link from "next/link";
import {
  FlaskConical,
  Clock,
  Wallet,
  TrendingUp,
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { billingFigures } from "@/components/invoices/invoice-queries";
import { formatCurrency, SAMPLE_STATUS_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { OPEN_STATUSES, rechercheHref } from "@/lib/sample-search";
import { countInStatuses, invoiceTileHref } from "@/lib/management-views";
import { serverIsoDay } from "@/lib/dashboard-view";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import type { SampleStatus, SampleType } from "@/generated/prisma/client";

/** The admin's invoice list — the direction view lives in the admin space. */
const INVOICES = "/admin/factures";

/**
 * The direction view: where the laboratory stands, in the numbers a director
 * actually asks for — what is in the pipeline, how long it takes, what was
 * billed and what was collected.
 *
 * Every figure that counts rows opens exactly those rows (« comme un tri »):
 * the samples in /recherche (`rechercheHref`), the invoices in the admin's
 * list (`invoiceTileHref`). « Délai moyen » and « Alertes de contamination »
 * have no such list and stay plain figures.
 *
 * A server component: the aggregates run in the database, and the page carries
 * only the results.
 */
export async function DirectionStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byStatus, byType, delays, billing, alertsThisMonth, blocked] =
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
    ]);

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="En cours de traitement"
          value={inPipeline}
          icon={FlaskConical}
          accent="blue"
          href={rechercheHref({ state: "en_cours" })}
        />
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
        <StatCard
          label="Facturé"
          value={formatCurrency(billing.billed)}
          icon={TrendingUp}
          accent="brand"
          href={invoiceTileHref(INVOICES, { state: "EMISES" })}
        />
        <StatCard
          label="Encaissé"
          value={formatCurrency(billing.collected)}
          icon={Wallet}
          accent="emerald"
          href={invoiceTileHref(INVOICES, { state: "AVEC_REGLEMENT" })}
        />
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
    </section>
  );
}
