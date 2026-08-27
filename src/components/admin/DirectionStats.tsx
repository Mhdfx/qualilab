import Link from "next/link";
import {
  FlaskConical,
  Clock,
  Wallet,
  TrendingUp,
  AlertTriangle,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { formatCurrency, SAMPLE_STATUS_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import type { SampleStatus, SampleType } from "@/generated/prisma/client";

/**
 * The direction view: where the laboratory stands, in the numbers a director
 * actually asks for — what is in the pipeline, how long it takes, what was
 * billed and what was collected.
 *
 * A server component: the aggregates run in the database, and the page carries
 * only the results.
 */
export async function DirectionStats() {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [byStatus, byType, delays, billed, collected, alertsThisMonth, blocked] =
    await Promise.all([
      prisma.sample.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.sample.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: { createdAt: { gte: monthStart } },
      }),
      // Turnaround: reception → final approval, over the approved samples.
      prisma.sample.findMany({
        where: { approvedAt: { not: null }, receivedAt: { not: null } },
        select: { receivedAt: true, approvedAt: true },
        orderBy: { approvedAt: "desc" },
        take: 100,
      }),
      prisma.invoice.aggregate({ _sum: { total: true } }),
      prisma.invoice.aggregate({
        where: { status: "PAYEE" },
        _sum: { total: true },
      }),
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
  const inPipeline =
    (statusCount.get("PRELEVE") ?? 0) +
    (statusCount.get("RECU") ?? 0) +
    (statusCount.get("EN_ANALYSE") ?? 0) +
    (statusCount.get("RESULTATS_SAISIS") ?? 0);

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
    "EN_ANALYSE",
    "RESULTATS_SAISIS",
    "VALIDE",
    "RAPPORT_ENVOYE",
  ];
  const maxStatus = Math.max(1, ...STATUS_ORDER.map((s) => statusCount.get(s) ?? 0));

  return (
    <section aria-label="Vue direction" className="mb-8">
      {blocked > 0 && (
        <Link
          href="/reception"
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
        <StatCard label="En cours de traitement" value={inPipeline} icon={FlaskConical} accent="blue" />
        <StatCard label="Délai moyen (réception → validation)" value={turnaround} icon={Clock} accent="violet" />
        <StatCard label="Facturé" value={formatCurrency(toMoney(billed._sum.total))} icon={TrendingUp} accent="brand" />
        <StatCard label="Encaissé" value={formatCurrency(toMoney(collected._sum.total))} icon={Wallet} accent="emerald" />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px]">
        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Échantillons par statut
          </h2>
          <ul className="mt-3 space-y-2">
            {STATUS_ORDER.map((status) => {
              const count = statusCount.get(status) ?? 0;
              return (
                <li key={status} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-sm text-slate-600">
                    {SAMPLE_STATUS_LABELS[status]}
                  </span>
                  <div
                    className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100"
                    role="img"
                    aria-label={`${SAMPLE_STATUS_LABELS[status]} : ${count}`}
                  >
                    <div
                      className="h-full rounded-full bg-brand/80"
                      style={{ width: `${(count / maxStatus) * 100}%` }}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-sm font-semibold tabular-nums text-slate-800">
                    {count}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Ce mois-ci
          </h2>
          <ul className="mt-3 space-y-2.5">
            {(Object.keys(SAMPLE_TYPE_LABELS) as SampleType[]).map((type) => {
              const count =
                byType.find((row) => row.type === type)?._count._all ?? 0;
              return (
                <li key={type} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">{SAMPLE_TYPE_LABELS[type]}</span>
                  <span className="font-semibold tabular-nums text-slate-800">{count}</span>
                </li>
              );
            })}
            <li className="flex items-center justify-between border-t border-slate-100 pt-2.5 text-sm">
              <span className="flex items-center gap-1.5 text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5 text-rose-500" aria-hidden="true" />
                Alertes de contamination
              </span>
              <span className="font-semibold tabular-nums text-slate-800">
                {alertsThisMonth}
              </span>
            </li>
          </ul>
        </Card>
      </div>
    </section>
  );
}
