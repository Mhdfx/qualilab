"use client";

import { useEffect, useMemo, useState } from "react";
import { SampleTable, type SampleRow } from "@/components/SampleTable";
import { SampleDetailPanel } from "@/components/SampleDetailPanel";
import { SAMPLE_TYPE_LABELS } from "@/lib/labels";
import type { SampleType } from "@/generated/prisma/client";
import { Search, Users, FlaskConical, Droplets } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";

export function AdminDashboard() {
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<SampleType | "ALL">("ALL");
  const [selected, setSelected] = useState<SampleRow | null>(null);

  useEffect(() => {
    fetch("/api/samples")
      .then((r) => r.json())
      .then((data) => setSamples(data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return samples.filter((s) => {
      const matchesType = typeFilter === "ALL" || s.type === typeFilter;
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        s.code.toLowerCase().includes(q) ||
        s.client.name.toLowerCase().includes(q) ||
        s.lieu.toLowerCase().includes(q) ||
        s.user?.name.toLowerCase().includes(q);
      return matchesType && matchesSearch;
    });
  }, [samples, search, typeFilter]);

  const preleveurCount = new Set(samples.map((s) => s.user?.name)).size;

  const stats = [
    { label: "Prélèvements", value: samples.length, icon: FlaskConical, accent: "brand" as const },
    { label: "Préleveurs actifs", value: preleveurCount, icon: Users, accent: "emerald" as const },
    {
      label: "Analyses eau",
      value: samples.filter((s) => s.type === "EAU").length,
      icon: Droplets,
      accent: "blue" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        badge="Administration"
        title="Tableau de bord"
        subtitle="Vue globale de tous les prélèvements et analyses en cours"
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map(({ label, value, icon, accent }) => (
          <StatCard key={label} label={label} value={value} icon={icon} accent={accent} />
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Tous les prélèvements</h2>
          {!loading && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field w-full py-2.5 pl-10 pr-4 sm:w-64"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as SampleType | "ALL")}
            className="input-field w-full px-4 py-2.5 sm:w-auto"
          >
            <option value="ALL">Tous les types</option>
            {(Object.keys(SAMPLE_TYPE_LABELS) as SampleType[]).map((type) => (
              <option key={type} value={type}>
                {SAMPLE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : (
        <SampleTable
          samples={filtered}
          showPreleveur
          onSelect={setSelected}
          selectedId={selected?.id}
        />
      )}

      {selected && (
        <SampleDetailPanel sample={selected} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
