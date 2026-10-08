import { requireRole } from "@/lib/auth";
import Link from "next/link";
import { Gauge, Thermometer, Award, AlertTriangle, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { calibrationDue } from "@/lib/quality";
import { formatDate, formatDateTime, formatDecimal } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { viewHref } from "@/lib/dashboard-view";
import { EIL_OPEN_STATUSES, type EilView } from "@/lib/management-views";

export const metadata = { title: "Système Qualité" };

/** How many excursions the card lists, newest first (the tile counts them all). */
const RECENT_EXCURSIONS = 20;

export default async function QualitePage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("VALIDATEUR", "ADMIN");
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const excursionWhere = { outOfRange: true, readAt: { gte: weekAgo } };

  // Each figure opens exactly what it counts (« comme un tri »): the
  // register, the two cards below, the EIL register filtered to the open
  // campaigns. Counted by the database, never capped by what a card lists.
  const [equipments, recentOutOfRange, excursionCount, eilOpenCount] = await Promise.all([
    prisma.equipment.findMany({ where: { archived: false } }),
    prisma.temperatureReading.findMany({
      where: excursionWhere,
      orderBy: { readAt: "desc" },
      take: RECENT_EXCURSIONS,
      include: { equipment: { select: { name: true, tempMin: true, tempMax: true } } },
    }),
    prisma.temperatureReading.count({ where: excursionWhere }),
    prisma.eilCampaign.count({ where: { status: { in: [...EIL_OPEN_STATUSES] } } }),
  ]);

  const withDue = equipments.map((equipment) => ({
    ...equipment,
    calibration: calibrationDue(
      equipment.lastCalibratedAt,
      equipment.calibrationFrequencyMonths
    ),
  }));
  const needsAction = withDue.filter((equipment) =>
    ["RETARD", "BIENTOT", "JAMAIS"].includes(equipment.calibration.state)
  );

  return (
    <div>
      <PageHeader
        badge="Système Qualité"
        title="Qualité"
        subtitle="Métrologie, relevés de température et essais interlaboratoires — ce qu'un audit regarde en premier."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Équipements suivis"
            value={equipments.length}
            icon={Gauge}
            accent="brand"
            href="/qualite/metrologie"
          />
          <StatCard
            label="Étalonnages à traiter"
            value={needsAction.length}
            icon={CalendarClock}
            accent="amber"
            href="#etalonnages"
          />
          <StatCard
            label="Excursions (7 jours)"
            value={excursionCount}
            icon={Thermometer}
            accent="violet"
            href="#excursions"
          />
          <StatCard
            label="Campagnes EIL ouvertes"
            value={eilOpenCount}
            icon={Award}
            accent="blue"
            href={viewHref("/qualite/eil", "ouvertes" satisfies EilView)}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section id="etalonnages" aria-labelledby="etalonnages-title" className="scroll-mt-24">
          <Card className="h-full p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="etalonnages-title" className="section-title">
                <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                Étalonnages à traiter
              </h2>
              <Link
                href="/qualite/metrologie"
                className="rounded text-sm font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Registre métrologie
              </Link>
            </div>
            {needsAction.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Tous les équipements sont dans leur période d&apos;étalonnage.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {needsAction.map((equipment) => (
                  <li key={equipment.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {equipment.name}
                        {equipment.code && (
                          <span className="text-slate-400"> · {equipment.code}</span>
                        )}
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-xs font-semibold ${
                        equipment.calibration.state === "RETARD"
                          ? "text-rose-600"
                          : equipment.calibration.state === "JAMAIS"
                            ? "text-rose-600"
                            : "text-amber-700"
                      }`}
                    >
                      {equipment.calibration.state === "JAMAIS"
                        ? "Jamais étalonné"
                        : equipment.calibration.state === "RETARD"
                          ? `En retard — dû le ${formatDate(equipment.calibration.dueDate!)}`
                          : `Bientôt — dû le ${formatDate(equipment.calibration.dueDate!)}`}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section id="excursions" aria-labelledby="excursions-title" className="scroll-mt-24">
          <Card className="h-full p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="excursions-title" className="section-title">
                <Thermometer className="h-4 w-4" aria-hidden="true" />
                Excursions de température (7 jours)
              </h2>
              <Link
                href="/qualite/temperatures"
                className="rounded text-sm font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Relevés
              </Link>
            </div>
            {recentOutOfRange.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Aucune sortie de plage sur les 7 derniers jours.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {recentOutOfRange.map((reading) => (
                  <li key={reading.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {reading.equipment.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDateTime(reading.readAt)} · plage [
                        {reading.equipment.tempMin === null ? "—" : formatDecimal(Number(reading.equipment.tempMin))} ;{" "}
                        {reading.equipment.tempMax === null ? "—" : formatDecimal(Number(reading.equipment.tempMax))}] °C
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-rose-600">
                      {formatDecimal(Number(reading.value))} °C
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {excursionCount > recentOutOfRange.length && (
              <p className="mt-3 text-xs text-slate-500">
                Les {recentOutOfRange.length} plus récentes sur {excursionCount} sont affichées.
              </p>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}
