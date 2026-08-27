import Link from "next/link";
import { Gauge, Thermometer, Award, AlertTriangle, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { calibrationDue } from "@/lib/quality";
import { formatDate, formatDateTime } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Système Qualité" };

export default async function QualitePage() {
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const [equipments, recentOutOfRange, eilOpen] = await Promise.all([
    prisma.equipment.findMany({ where: { archived: false } }),
    prisma.temperatureReading.findMany({
      where: { outOfRange: true, readAt: { gte: weekAgo } },
      orderBy: { readAt: "desc" },
      take: 20,
      include: { equipment: { select: { name: true, tempMin: true, tempMax: true } } },
    }),
    prisma.eilCampaign.findMany({
      where: { status: { in: ["PREVUE", "EN_COURS", "RESULTATS_RECUS"] } },
      orderBy: { startDate: "asc" },
      take: 10,
    }),
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
          <StatCard label="Équipements suivis" value={equipments.length} icon={Gauge} accent="brand" />
          <StatCard label="Étalonnages à traiter" value={needsAction.length} icon={CalendarClock} accent="amber" />
          <StatCard label="Excursions (7 jours)" value={recentOutOfRange.length} icon={Thermometer} accent="violet" />
          <StatCard label="Campagnes EIL ouvertes" value={eilOpen.length} icon={Award} accent="blue" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">
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

        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">
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
                      {reading.equipment.tempMin ?? "—"} ; {reading.equipment.tempMax ?? "—"}] °C
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-rose-600">
                    {reading.value} °C
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
