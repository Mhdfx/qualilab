"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, Check, Pencil, Plus, Scale, X } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The regulations the technical validator picks from, per sample
 * (RETOUR-LABO-30-09.md, slice I). Editing or archiving one never changes a
 * report already issued: the report keeps the text frozen at approval.
 */

export type RegulationRow = {
  id: string;
  title: string;
  text: string;
  active: boolean;
  sortOrder: number;
  samples: number;
  legacyId: number | null;
};

const BUTTON =
  "inline-flex min-h-[40px] items-center gap-2 rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50";

export function RegulationsManager({ rows }: { rows: RegulationRow[] }) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");
  const shown = rows.filter((r) => filter === "all" || r.active);

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(["active", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={`rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
                  filter === f ? "bg-brand text-white ring-brand" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}
              >
                {f === "active" ? `En vigueur ${rows.filter((r) => r.active).length}` : `Toutes ${rows.length}`}
              </button>
            ))}
          </div>
          {!creating && (
            <button type="button" onClick={() => setCreating(true)} className={`${BUTTON} bg-brand text-white hover:bg-brand-dark`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nouvelle réglementation
            </button>
          )}
        </div>
        {creating && <RegulationForm onDone={() => setCreating(false)} />}
      </Card>

      <Card className="p-5">
        {shown.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">Aucune réglementation.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((row) =>
              editing === row.id ? (
                <li key={row.id} className="py-3">
                  <RegulationForm row={row} onDone={() => setEditing(null)} />
                </li>
              ) : (
                <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                      <Scale className="h-4 w-4 text-brand" aria-hidden="true" />
                      {row.title}
                      {!row.active && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">Archivée</span>
                      )}
                      {row.legacyId !== null && (
                        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700">Ancien logiciel</span>
                      )}
                    </p>
                    {row.text !== row.title && <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{row.text}</p>}
                    <p className="mt-1 text-xs text-slate-400">
                      {row.samples} échantillon{row.samples > 1 ? "s" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(row.id)} className={`${BUTTON} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Modifier
                    </button>
                    <ToggleActive row={row} />
                  </div>
                </li>
              )
            )}
          </ul>
        )}
      </Card>
    </div>
  );
}

function ToggleActive({ row }: { row: RegulationRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function toggle() {
    setBusy(true);
    try {
      const response = await fetch(`/api/regulations/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <button type="button" onClick={toggle} disabled={busy} className={`${BUTTON} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
      {row.active ? <Archive className="h-4 w-4" aria-hidden="true" /> : <ArchiveRestore className="h-4 w-4" aria-hidden="true" />}
      {row.active ? "Archiver" : "Rétablir"}
    </button>
  );
}

function RegulationForm({ row, onDone }: { row?: RegulationRow; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(row?.title ?? "");
  const [text, setText] = useState(row && row.text !== row.title ? row.text : "");
  const [similar, setSimilar] = useState<string[]>([]);
  const [confirmSimilar, setConfirmSimilar] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(row ? `/api/regulations/${row.id}` : "/api/regulations", {
        method: row ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, text, confirmSimilar }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        setSimilar(Array.isArray(data.similar) ? data.similar : []);
        return;
      }
      router.refresh();
      onDone();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} noValidate className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <div>
        <label htmlFor={`reg-title-${row?.id ?? "new"}`} className="block text-sm font-medium text-slate-700">
          Nom court (liste de choix) <span className="text-rose-600">*</span>
        </label>
        <input
          id={`reg-title-${row?.id ?? "new"}`}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setSimilar([]);
            setConfirmSimilar(false);
          }}
          maxLength={191}
          placeholder="Ex. : Règlement (CE) n° 2073/2005"
          className="input-field mt-1.5 px-3"
        />
      </div>
      <div>
        <label htmlFor={`reg-text-${row?.id ?? "new"}`} className="block text-sm font-medium text-slate-700">
          Texte imprimé sur le rapport
        </label>
        <textarea
          id={`reg-text-${row?.id ?? "new"}`}
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Laissé vide, le nom court est imprimé."
          className="input-field mt-1.5 resize-y px-3 py-2"
        />
      </div>
      {similar.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <p className="font-semibold">Réglementations très proches :</p>
          <ul className="mt-1 list-disc pl-5">
            {similar.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2">
            <input type="checkbox" checked={confirmSimilar} onChange={(e) => setConfirmSimilar(e.target.checked)} className="h-4 w-4 accent-brand" />
            Ce n&apos;est pas une faute de frappe : créer quand même
          </label>
        </div>
      )}
      {error && similar.length === 0 && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !title.trim() || (similar.length > 0 && !confirmSimilar)}
          className={`${BUTTON} bg-brand text-white hover:bg-brand-dark`}
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button type="button" onClick={onDone} className={`${BUTTON} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50`}>
          <X className="h-4 w-4" aria-hidden="true" />
          Annuler
        </button>
      </div>
    </form>
  );
}
