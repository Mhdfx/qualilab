"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Plus, Search, Tags, X } from "lucide-react";
import type { Family } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";

export type ProductTypeRow = {
  id: string;
  name: string;
  family: Family;
  clientId: string | null;
  clientName: string | null;
  active: boolean;
  criteriaCount: number;
  sampleCount: number;
};

export type ClientRow = { id: string; name: string };

const FAMILY_LABELS: Record<Family, string> = { MICRO: "Microbiologie", CHIMIE: "Physico-chimie", AUTRE: "Autre" };
type Filter = "all" | "catalogue" | "client" | "inactive";

/**
 * The product types — the workbook's 131 rows once imported, plus what the
 * admin adds by hand. A type is the catalogue's or one client's own; the
 * criteria live on the detail page.
 */
export function ProductTypesManager({ types, clients }: { types: ProductTypeRow[]; clients: ClientRow[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return types.filter((t) => {
      if (filter === "catalogue" && t.clientId) return false;
      if (filter === "client" && !t.clientId) return false;
      if (filter === "inactive" && t.active) return false;
      if (filter !== "inactive" && !t.active) return false;
      return !q || t.name.toLowerCase().includes(q) || (t.clientName ?? "").toLowerCase().includes(q);
    });
  }, [types, query, filter]);

  async function toggleActive(row: ProductTypeRow) {
    if (busyId) return;
    setBusyId(row.id);
    setError("");
    try {
      const response = await fetch(`/api/product-types/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusyId(null);
    }
  }

  const counts = {
    all: types.filter((t) => t.active).length,
    catalogue: types.filter((t) => t.active && !t.clientId).length,
    client: types.filter((t) => t.active && t.clientId).length,
    inactive: types.filter((t) => !t.active).length,
  };

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher un type de produit ou un client…"
            aria-label="Rechercher un type de produit"
            className="input-field pl-9 pr-4"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrer">
          {(
            [
              ["all", "Tous"],
              ["catalogue", "Catalogue"],
              ["client", "Par client"],
              ["inactive", "Inactifs"],
            ] as [Filter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`min-h-[36px] rounded-lg border px-3 text-sm font-medium transition ${
                filter === key ? "border-brand bg-brand-light/60 text-brand" : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              {label} <span className="ml-1 text-xs text-slate-400">{counts[key]}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setError("");
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau type
        </button>
      </div>

      <Card className="overflow-hidden">
        {creating && (
          <CreateForm
            clients={clients}
            onCancel={() => setCreating(false)}
            onSaved={(id) => {
              setCreating(false);
              router.push(`/admin/types-produits/${id}`);
            }}
            onError={setError}
          />
        )}
        {visible.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">
            {types.length === 0
              ? "Aucun type de produit : importez le classeur des critères (Import de données) ou créez-en un."
              : "Aucun type ne correspond à la recherche."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {visible.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <Link
                  href={`/admin/types-produits/${row.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Tags className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2 font-medium text-slate-800 group-hover:text-brand">
                      {row.name}
                      {row.clientName && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                          {row.clientName}
                        </span>
                      )}
                      {row.family !== "MICRO" && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                          {FAMILY_LABELS[row.family]}
                        </span>
                      )}
                      {!row.active && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">inactif</span>
                      )}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {row.criteriaCount === 0
                        ? "Aucun critère"
                        : `${row.criteriaCount} critère${row.criteriaCount > 1 ? "s" : ""}`}
                      {row.sampleCount > 0 && ` · ${row.sampleCount} échantillon${row.sampleCount > 1 ? "s" : ""}`}
                    </span>
                  </span>
                  <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={() => toggleActive(row)}
                  disabled={busyId === row.id}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                >
                  {row.active ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {row.active ? "Désactiver" : "Réactiver"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function CreateForm({
  clients,
  onCancel,
  onSaved,
  onError,
}: {
  clients: ClientRow[];
  onCancel: () => void;
  onSaved: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [family, setFamily] = useState<Family>("MICRO");
  const [clientId, setClientId] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/product-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, family, clientId: clientId || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onSaved(data.id);
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="border-l-4 border-brand bg-brand-light/20 px-4 py-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <div>
          <label htmlFor="pt-name" className="block text-xs font-medium text-slate-600">Nom du type de produit *</label>
          <input id="pt-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. : Salades avec source protéique" className="input-field mt-1 px-3" autoFocus />
        </div>
        <div>
          <label htmlFor="pt-family" className="block text-xs font-medium text-slate-600">Famille</label>
          <select id="pt-family" value={family} onChange={(e) => setFamily(e.target.value as Family)} className="input-field mt-1 px-3">
            {(Object.keys(FAMILY_LABELS) as Family[]).map((f) => (
              <option key={f} value={f}>{FAMILY_LABELS[f]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="pt-client" className="block text-xs font-medium text-slate-600">Propre à un client</label>
          <select id="pt-client" value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-field mt-1 px-3">
            <option value="">— catalogue commun —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={saving} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60">
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Création…" : "Créer et saisir les critères"}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Annuler
        </button>
      </div>
    </form>
  );
}
