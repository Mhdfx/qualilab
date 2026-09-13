"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ListChecks, Pencil, Plus, X } from "lucide-react";
import type { Family, SampleType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";

export type ProfileRow = {
  id: string;
  name: string;
  natureId: string;
  clientId: string | null;
  clientName: string | null;
  unitCount: number;
  active: boolean;
  sortOrder: number;
  parameterIds: string[];
};

export type NatureRow = { id: string; label: string; family: Family; legacyType: SampleType };
export type ParameterRow = { id: string; name: string; category: SampleType };
export type ClientRow = { id: string; name: string };

const UNIT_CHOICES = [1, 3, 5, 9];

/**
 * Analysis profiles — the panels the préleveur ticks in one tap: « Micro
 * aliments standard », « Surfaces », « Histamine n = 9 ». A profile may be
 * contractual to one client; that client's panels are proposed first.
 */
export function ProfilesManager({
  natures,
  parameters,
  clients,
  profiles,
}: {
  natures: NatureRow[];
  parameters: ParameterRow[];
  clients: ClientRow[];
  profiles: ProfileRow[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState("");
  const nameOf = new Map(parameters.map((p) => [p.id, p.name]));

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="space-y-6">
        {natures.map((nature) => {
          const rows = profiles.filter((p) => p.natureId === nature.id);
          const available = parameters.filter((p) => p.category === nature.legacyType);
          return (
            <section key={nature.id}>
              <div className="mb-2 flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-slate-900">{nature.label}</h2>
                <button
                  type="button"
                  onClick={() => {
                    setCreating(nature.id);
                    setEditing(null);
                    setError("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Ajouter un profil
                </button>
              </div>
              <Card className="overflow-hidden">
                {creating === nature.id && (
                  <ProfileForm
                    natureId={nature.id}
                    available={available}
                    clients={clients}
                    onCancel={() => setCreating(null)}
                    onSaved={() => {
                      setCreating(null);
                      router.refresh();
                    }}
                    onError={setError}
                  />
                )}
                {rows.length === 0 && creating !== nature.id ? (
                  <p className="p-5 text-center text-sm text-slate-500">
                    Aucun profil : les analyses de cette nature se cochent une à une.
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {rows.map((row) =>
                      editing === row.id ? (
                        <li key={row.id}>
                          <ProfileForm
                            natureId={nature.id}
                            available={available}
                            clients={clients}
                            profile={row}
                            onCancel={() => setEditing(null)}
                            onSaved={() => {
                              setEditing(null);
                              router.refresh();
                            }}
                            onError={setError}
                          />
                        </li>
                      ) : (
                        <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                              <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" />
                              {row.name}
                              {row.clientName && (
                                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 ring-1 ring-violet-200">
                                  {row.clientName}
                                </span>
                              )}
                              {row.unitCount > 1 && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                  n = {row.unitCount}
                                </span>
                              )}
                              {!row.active && (
                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                                  inactif
                                </span>
                              )}
                            </p>
                            <p className="mt-0.5 text-sm text-slate-500">
                              {row.parameterIds.map((id) => nameOf.get(id) ?? id).join(", ")}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditing(row.id);
                              setCreating(null);
                              setError("");
                            }}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                            Modifier
                          </button>
                        </li>
                      )
                    )}
                  </ul>
                )}
              </Card>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ProfileForm({
  natureId,
  available,
  clients,
  profile,
  onCancel,
  onSaved,
  onError,
}: {
  natureId: string;
  available: ParameterRow[];
  clients: ClientRow[];
  profile?: ProfileRow;
  onCancel: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState(profile?.name ?? "");
  const [clientId, setClientId] = useState(profile?.clientId ?? "");
  const [unitCount, setUnitCount] = useState(profile?.unitCount ?? 1);
  const [parameterIds, setParameterIds] = useState<string[]>(profile?.parameterIds ?? []);
  const [active, setActive] = useState(profile?.active ?? true);
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setParameterIds((current) => (current.includes(id) ? current.filter((p) => p !== id) : [...current, id]));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(profile ? `/api/profiles/${profile.id}` : "/api/profiles", {
        method: profile ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, natureId, clientId, unitCount, parameterIds, active }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onSaved();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="border-b border-brand/20 bg-brand-light/30 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-slate-600">Nom du profil *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. : Micro aliments standard"
            className="input-field mt-1 px-3"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Client (profil contractuel)</label>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="input-field mt-1 px-3">
            <option value="">— Tous les clients —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-600">Nombre d&apos;unités proposé (n)</p>
        <div className="mt-1 flex flex-wrap gap-2">
          {UNIT_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setUnitCount(n)}
              aria-pressed={unitCount === n}
              className={`min-h-[36px] min-w-[48px] rounded-lg border px-3 text-sm font-semibold transition ${
                unitCount === n ? "border-brand bg-white text-brand ring-1 ring-brand/20" : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="text-xs font-medium text-slate-600">Analyses du profil *</p>
        {available.length === 0 ? (
          <p className="mt-1 text-sm text-amber-700">Aucun paramètre pour ce domaine — créez-les d&apos;abord dans « Paramètres d&apos;analyse ».</p>
        ) : (
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((p) => (
              <label
                key={p.id}
                className={`flex min-h-[38px] cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm ${
                  parameterIds.includes(p.id) ? "border-brand/40 ring-1 ring-brand/10" : "border-slate-200"
                }`}
              >
                <input type="checkbox" checked={parameterIds.includes(p.id)} onChange={() => toggle(p.id)} className="h-4 w-4 accent-brand" />
                {p.name}
              </label>
            ))}
          </div>
        )}
      </div>

      {profile && (
        <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4 accent-brand" />
          Profil actif (proposé dans les formulaires)
        </label>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </button>
      </div>
    </form>
  );
}
