"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Check, Plus } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type NormVersionRow = {
  id: string;
  version: string;
  label: string;
  effectiveFrom: string;
  supersededOn: string;
  current: boolean;
  criteriaCount: number;
};
export type NormRow = { id: string; code: string; versions: NormVersionRow[] };

/**
 * The norms behind the criteria (CRITERES.md §2, rule 4): one code, dated
 * versions, one in force. Edited version by version.
 */
export function NormsManager({ norms }: { norms: NormRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setError("");
          }}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouvelle norme ou version
        </button>
      </div>

      {creating && (
        <Card className="overflow-hidden">
          <CreateForm
            onCancel={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              router.refresh();
            }}
            onError={setError}
          />
        </Card>
      )}

      {norms.length === 0 ? (
        <Card className="p-8 text-center text-sm text-slate-500">
          Aucune norme : elles arrivent avec l&apos;import du classeur des critères, ou se créent ici.
        </Card>
      ) : (
        norms.map((norm) => (
          <Card key={norm.id} className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
              <BookOpen className="h-4 w-4 text-brand" aria-hidden="true" />
              <h2 className="font-semibold text-slate-900">{norm.code}</h2>
              <span className="text-xs text-slate-500">
                {norm.versions.length} version{norm.versions.length > 1 ? "s" : ""}
              </span>
            </div>
            <ul className="divide-y divide-slate-100">
              {norm.versions.map((version) => (
                // Keyed on the saved values: when one row's save flips another
                // row's « en vigueur », that row remounts with the server's truth.
                <VersionRowEditor
                  key={`${version.id}|${version.current}|${version.label}|${version.effectiveFrom}|${version.supersededOn}`}
                  version={version}
                  onError={setError}
                />
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}

function VersionRowEditor({ version, onError }: { version: NormVersionRow; onError: (m: string) => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(version.label);
  const [effectiveFrom, setEffectiveFrom] = useState(version.effectiveFrom);
  const [supersededOn, setSupersededOn] = useState(version.supersededOn);
  const [current, setCurrent] = useState(version.current);
  const [saving, setSaving] = useState(false);
  const dirty =
    label !== version.label || effectiveFrom !== version.effectiveFrom || supersededOn !== version.supersededOn || current !== version.current;

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch(`/api/norms/versions/${version.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, effectiveFrom, supersededOn, current }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      router.refresh();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <li className="grid grid-cols-1 gap-3 px-5 py-3 sm:grid-cols-[90px_2fr_1fr_1fr_auto_auto] sm:items-end">
      <div>
        <p className="text-xs font-medium text-slate-600">Version</p>
        <p className="mt-1 font-mono text-sm font-semibold text-slate-800">{version.version || "—"}</p>
        <p className="text-[11px] text-slate-400">{version.criteriaCount} critère{version.criteriaCount > 1 ? "s" : ""}</p>
      </div>
      <div>
        <label htmlFor={`label-${version.id}`} className="block text-xs font-medium text-slate-600">Libellé imprimé</label>
        <input id={`label-${version.id}`} type="text" value={label} onChange={(e) => setLabel(e.target.value)} className="input-field mt-1 px-3" />
      </div>
      <div>
        <label htmlFor={`from-${version.id}`} className="block text-xs font-medium text-slate-600">En vigueur depuis</label>
        <input id={`from-${version.id}`} type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="input-field mt-1 px-3" />
      </div>
      <div>
        <label htmlFor={`to-${version.id}`} className="block text-xs font-medium text-slate-600">Remplacée le</label>
        <input id={`to-${version.id}`} type="date" value={supersededOn} onChange={(e) => setSupersededOn(e.target.value)} className="input-field mt-1 px-3" />
      </div>
      <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" checked={current} onChange={(e) => setCurrent(e.target.checked)} className="h-4 w-4 accent-brand" />
        En vigueur
      </label>
      <button
        type="button"
        onClick={save}
        disabled={!dirty || saving}
        className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-40"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {saving ? "…" : "Enregistrer"}
      </button>
    </li>
  );
}

function CreateForm({ onCancel, onSaved, onError }: { onCancel: () => void; onSaved: () => void; onError: (m: string) => void }) {
  const [code, setCode] = useState("");
  const [version, setVersion] = useState("");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/norms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, version, label }),
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
    <form onSubmit={save} noValidate className="border-l-4 border-brand bg-brand-light/20 px-4 py-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px_2fr]">
        <div>
          <label htmlFor="norm-code" className="block text-xs font-medium text-slate-600">Code de la norme *</label>
          <input id="norm-code" type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Ex. : NM ISO 6579-1" className="input-field mt-1 px-3" autoFocus />
        </div>
        <div>
          <label htmlFor="norm-version" className="block text-xs font-medium text-slate-600">Version (année)</label>
          <input id="norm-version" type="text" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="2017" className="input-field mt-1 px-3" />
        </div>
        <div>
          <label htmlFor="norm-label" className="block text-xs font-medium text-slate-600">Libellé imprimé</label>
          <input id="norm-label" type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Par défaut : code:version" className="input-field mt-1 px-3" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Une nouvelle version d&apos;une norme existante : même code, autre année. La première version d&apos;une norme est en vigueur d&apos;office.</p>
      <div className="mt-3 flex gap-2">
        <button type="submit" disabled={saving} className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60">
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Création…" : "Créer"}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex min-h-[38px] items-center rounded-lg border border-slate-300 px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Annuler
        </button>
      </div>
    </form>
  );
}
