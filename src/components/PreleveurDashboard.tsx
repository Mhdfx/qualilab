"use client";

import { useEffect, useState } from "react";
import { Plus, FlaskConical, Calendar, ClipboardList } from "lucide-react";
import { PrimaryLink } from "@/components/PrimaryButton";
import { SampleTable, type SampleRow } from "@/components/SampleTable";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";

type PreleveurDashboardProps = {
  userName: string;
};

export function PreleveurDashboard({ userName }: PreleveurDashboardProps) {
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/samples")
      .then((r) => r.json())
      .then((data) => setSamples(data))
      .finally(() => setLoading(false));
  }, []);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const todayCount = samples.filter(
    (s) => new Date(s.sampledAt) >= today
  ).length;
  const weekCount = samples.filter(
    (s) => new Date(s.sampledAt) >= weekAgo
  ).length;

  const firstName = userName.split(" ")[0];

  const stats = [
    { label: "Aujourd'hui", value: todayCount, icon: Calendar, accent: "blue" as const },
    { label: "Cette semaine", value: weekCount, icon: ClipboardList, accent: "emerald" as const },
    { label: "Total", value: samples.length, icon: FlaskConical, accent: "violet" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        badge="Module Préleveur"
        title={`Bonjour, ${firstName}`}
        subtitle="Créez et suivez vos prélèvements terrain en temps réel"
        action={
          <PrimaryLink href="/preleveur/nouveau" className="shadow-lg shadow-black/20">
            <Plus className="h-4 w-4" />
            Nouveau prélèvement
          </PrimaryLink>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map(({ label, value, icon, accent }) => (
          <StatCard key={label} label={label} value={value} icon={icon} accent={accent} />
        ))}
      </div>

      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">Mes prélèvements</h2>
        {!loading && (
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
            {samples.length} enregistrement{samples.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <SampleTable samples={samples} />
      )}
    </div>
  );
}
