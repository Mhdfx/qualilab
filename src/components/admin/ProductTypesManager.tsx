"use client";

import { useDeferredValue, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Plus, Search, Tags, X } from "lucide-react";
import type { Family } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { similarLabels } from "@/lib/similar";
import { FAMILY_SHORT_LABELS as FAMILY_LABELS } from "@/lib/labels";
import {
  CATALOGUE,
  NO_FAMILY_FILTER,
  UNCLASSIFIED,
  filterFamilyList,
  groupFamiliesByNature,
  withFamilyListQuery,
  type FamilyListFilter,
  type FamilyListRow,
} from "@/lib/family-list";

export type ClientRow = { id: string; name: string };
export type NatureRow = { id: string; label: string; family: Family; active: boolean };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/**
 * The families de produits (RETOUR-LABO-16-10.md F4) — the workbook's rows
 * and the old software's catalogue once imported, plus what is added by
 * hand; the catalogue's or one client's own. Grouped by type d'analyse,
 * filtered on screen; the criteria live on each family's page. The same
 * list serves the administrator and the responsable des paramètres:
 * `basePath` is the space it is shown in.
 */
export function ProductTypesManager({
  types,
  germNames,
  natures,
  clients,
  basePath,
  initialFilter = NO_FAMILY_FILTER,
}: {
  types: FamilyListRow[];
  /** The germ names a family's `germs` point into. */
  germNames: string[];
  /** Every type d'analyse, in display order; the archived ones only name their families. */
  natures: NatureRow[];
  clients: ClientRow[];
  /** « /programmation/familles » or « /admin/types-produits ». */
  basePath: string;
  initialFilter?: FamilyListFilter;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<FamilyListFilter>(initialFilter);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Typing stays fluid on a long list: the filtering follows a beat behind.
  const deferred = useDeferredValue(filter);

  /** Change the filter, and keep it in the address so that coming back from a family finds the list as it was. */
  function apply(patch: Partial<FamilyListFilter>) {
    const next = { ...filter, ...patch };
    setFilter(next);
    window.history.replaceState(null, "", withFamilyListQuery(basePath, next));
  }

  const visible = useMemo(() => filterFamilyList(types, deferred, germNames), [types, deferred, germNames]);
  const groups = useMemo(() => groupFamiliesByNature(visible, natures), [visible, natures]);
  const counts = useMemo(
    () => ({
      active: filterFamilyList(types, { ...deferred, inactive: false }, germNames).length,
      inactive: filterFamilyList(types, { ...deferred, inactive: true }, germNames).length,
      withoutCriteria: filterFamilyList(types, { ...deferred, withoutCriteria: true }, germNames).length,
    }),
    [types, deferred, germNames]
  );

  // The select's options: what exists in the current state (active or archived families).
  const inState = useMemo(() => types.filter((t) => t.active !== filter.inactive), [types, filter.inactive]);
  const natureCount = (natureId: string | null) => inState.filter((t) => t.natureId === natureId).length;
  const natureOptions = natures.filter((n) => n.active || types.some((t) => t.natureId === n.id));
  const clientOptions = useMemo(() => {
    const owners = new Map<string, string>();
    for (const t of types) if (t.clientId) owners.set(t.clientId, t.clientName ?? "Client archivé");
    return [...owners].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [types]);

  const filtered =
    filter.natureId !== "" || filter.clientId !== "" || filter.inactive || filter.withoutCriteria || filter.query.trim() !== "";

  async function toggleActive(row: FamilyListRow) {
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

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <form role="search" aria-label="Rechercher une famille" onSubmit={(e) => e.preventDefault()} className="min-w-[240px] flex-1">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                type="search"
                value={filter.query}
                onChange={(e) => apply({ query: e.target.value })}
                placeholder="Rechercher une famille ou un germe…"
                aria-label="Rechercher une famille par son nom ou par un de ses germes"
                className="input-field pl-9 pr-4"
              />
            </label>
          </form>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setError("");
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvelle famille
          </button>
        </div>

        <div role="group" aria-label="Filtrer les familles" className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div>
            <label htmlFor="family-filter-nature" className="mb-1 block text-xs font-medium text-slate-600">Type d&apos;analyse</label>
            <select
              id="family-filter-nature"
              value={filter.natureId}
              onChange={(e) => apply({ natureId: e.target.value })}
              className="input-field py-2.5 pl-3 pr-8 sm:w-72"
            >
              <option value="">Tous les types d&apos;analyse</option>
              {natureOptions.map((n) => (
                <option key={n.id} value={n.id}>
                  {`${n.label}${n.active ? "" : " (archivé)"} · ${natureCount(n.id)}`}
                </option>
              ))}
              <option value={UNCLASSIFIED}>{`À préciser · ${natureCount(null)}`}</option>
            </select>
          </div>
          <div>
            <label htmlFor="family-filter-client" className="mb-1 block text-xs font-medium text-slate-600">Client</label>
            <select
              id="family-filter-client"
              value={filter.clientId}
              onChange={(e) => apply({ clientId: e.target.value })}
              className="input-field py-2.5 pl-3 pr-8 sm:w-60"
            >
              <option value="">Tous</option>
              <option value={CATALOGUE}>Catalogue commun</option>
              {clientOptions.length > 0 && (
                <optgroup label="Familles propres à un client">
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="État des familles">
            {(
              [
                [false, "Actives", counts.active],
                [true, "Inactives", counts.inactive],
              ] as [boolean, string, number][]
            ).map(([inactive, label, count]) => (
              <button
                key={label}
                type="button"
                onClick={() => apply({ inactive })}
                aria-pressed={filter.inactive === inactive}
                className={`min-h-[40px] rounded-lg border px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                  filter.inactive === inactive ? "border-brand bg-brand-light/60 text-brand" : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {label} <span className="ml-1 text-xs text-slate-500">{count}</span>
              </button>
            ))}
            <button
              type="button"
              onClick={() => apply({ withoutCriteria: !filter.withoutCriteria })}
              aria-pressed={filter.withoutCriteria}
              className={`min-h-[40px] rounded-lg border px-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                filter.withoutCriteria ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 text-slate-600 hover:border-slate-300"
              }`}
            >
              Sans critère <span className="ml-1 text-xs text-slate-500">{counts.withoutCriteria}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
          <p role="status">
            {plural(visible.length, "famille", "familles")}
            {filter.inactive ? (visible.length > 1 ? " inactives" : " inactive") : ""}
            {filtered ? " correspondant aux filtres" : ""}
          </p>
          {filtered && (
            <button
              type="button"
              onClick={() => apply(NO_FAMILY_FILTER)}
              className="rounded font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Effacer les filtres
            </button>
          )}
        </div>
      </Card>

      {creating && (
        <Card className="overflow-hidden">
          <CreateForm
            clients={clients}
            natures={natures.filter((n) => n.active)}
            initialNatureId={filter.natureId !== UNCLASSIFIED ? filter.natureId : ""}
            initialClientId={filter.clientId !== CATALOGUE ? filter.clientId : ""}
            existingNames={types.map((t) => t.name)}
            onCancel={() => setCreating(false)}
            onSaved={(id) => {
              setCreating(false);
              router.push(withFamilyListQuery(`${basePath}/${id}`, filter));
            }}
            onError={setError}
          />
        </Card>
      )}

      {groups.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-sm text-slate-500">
            {types.length === 0
              ? "Aucune famille : importez le classeur des critères ou le catalogue de l'ancien logiciel (Import de données), ou créez-en une."
              : "Aucune famille ne correspond aux filtres."}
          </p>
        </Card>
      ) : (
        groups.map((group) => (
          <Card key={group.natureId ?? UNCLASSIFIED} className="overflow-hidden">
            <section aria-labelledby={`family-group-${group.natureId ?? UNCLASSIFIED}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
                <h2 id={`family-group-${group.natureId ?? UNCLASSIFIED}`} className="text-sm font-semibold text-slate-700">
                  {group.label} <span className="ml-1 font-normal text-slate-500">{group.rows.length}</span>
                </h2>
                {group.natureId === null && (
                  <p className="text-xs text-slate-500">Le type d&apos;analyse se choisit dans la fiche de la famille.</p>
                )}
              </div>
              <ul className="divide-y divide-slate-100">
                {group.rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <Link
                      href={withFamilyListQuery(`${basePath}/${row.id}`, filter)}
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
                          {row.natureId === null && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              {FAMILY_LABELS[row.family]}
                            </span>
                          )}
                          {!row.active && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">inactive</span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-sm text-slate-500">
                          {row.criteriaCount === 0 ? (
                            <span className="font-medium text-amber-700">Aucun critère</span>
                          ) : (
                            plural(row.criteriaCount, "critère", "critères")
                          )}
                          {row.sampleCount > 0 && ` · ${plural(row.sampleCount, "échantillon", "échantillons")}`}
                        </span>
                      </span>
                      <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => toggleActive(row)}
                      disabled={busyId === row.id}
                      aria-label={`${row.active ? "Désactiver" : "Réactiver"} la famille ${row.name}`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
                    >
                      {row.active ? <X className="h-3.5 w-3.5" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {row.active ? "Désactiver" : "Réactiver"}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          </Card>
        ))
      )}
    </div>
  );
}

function CreateForm({
  clients,
  natures,
  initialNatureId,
  initialClientId,
  existingNames,
  onCancel,
  onSaved,
  onError,
}: {
  clients: ClientRow[];
  /** The active types d'analyse. */
  natures: NatureRow[];
  initialNatureId: string;
  initialClientId: string;
  existingNames: string[];
  onCancel: () => void;
  onSaved: (id: string) => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [natureId, setNatureId] = useState(natures.some((n) => n.id === initialNatureId) ? initialNatureId : "");
  const [family, setFamily] = useState<Family>("MICRO");
  const [clientId, setClientId] = useState(clients.some((c) => c.id === initialClientId) ? initialClientId : "");
  const [saving, setSaving] = useState(false);
  // The corrector: close names are shown while typing, and creating one
  // anyway takes an explicit tick (the server checks it too).
  const near = similarLabels(name, existingNames, 5);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  // The domain follows the type d'analyse; it is chosen only while that is « à préciser ».
  const nature = natures.find((n) => n.id === natureId) ?? null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/product-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, natureId: natureId || null, family, clientId: clientId || null, confirmSimilar }),
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1.5fr_1fr_1.2fr]">
        <div>
          <label htmlFor="pt-name" className="block text-xs font-medium text-slate-600">Nom de la famille *</label>
          <input
            id="pt-name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setConfirmSimilar(false);
            }}
            placeholder="Ex. : Salades avec source protéique"
            className="input-field mt-1 px-3"
            autoFocus
          />
          {near.length > 0 && (
            <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-900">
              <p className="font-semibold">Familles existantes très proches :</p>
              <ul className="mt-0.5 list-inside list-disc">
                {near.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
              <label className="mt-1 flex items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={confirmSimilar}
                  onChange={(e) => setConfirmSimilar(e.target.checked)}
                  className="h-3.5 w-3.5 accent-brand"
                />
                Ce n&apos;est pas une faute de frappe : créer quand même
              </label>
            </div>
          )}
        </div>
        <div>
          <label htmlFor="pt-nature" className="block text-xs font-medium text-slate-600">Type d&apos;analyse</label>
          <select
            id="pt-nature"
            value={natureId}
            onChange={(e) => {
              // Back to « à préciser », the domain stays the one the type d'analyse gave.
              if (nature) setFamily(nature.family);
              setNatureId(e.target.value);
            }}
            className="input-field mt-1 px-3"
          >
            <option value="">— à préciser —</option>
            {natures.map((n) => (
              <option key={n.id} value={n.id}>{n.label}</option>
            ))}
          </select>
        </div>
        <div>
          {nature ? (
            <>
              <span className="block text-xs font-medium text-slate-600">Domaine</span>
              <p className="mt-1 flex min-h-[42px] flex-wrap items-center gap-x-1.5 px-1 text-sm text-slate-700">
                {FAMILY_LABELS[nature.family]}
                <span className="text-xs text-slate-500">(selon le type d&apos;analyse)</span>
              </p>
            </>
          ) : (
            <>
              <label htmlFor="pt-family" className="block text-xs font-medium text-slate-600">Domaine</label>
              <select id="pt-family" value={family} onChange={(e) => setFamily(e.target.value as Family)} className="input-field mt-1 px-3">
                {(Object.keys(FAMILY_LABELS) as Family[]).map((f) => (
                  <option key={f} value={f}>{FAMILY_LABELS[f]}</option>
                ))}
              </select>
            </>
          )}
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
        <button type="submit" disabled={saving || (near.length > 0 && !confirmSimilar)} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60">
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
