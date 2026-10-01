"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Hash } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The yearly sequences — N° de série and N° de contrôle — continued from the
 * old software: on switch-over day the admin types the last numbers it
 * issued. A counter never goes below a number already attributed.
 */

export type CounterRow = { kind: "SERIE" | "CONTROLE"; year: number; last: number; highestUsed: number };

const LABELS: Record<CounterRow["kind"], string> = {
  SERIE: "N° de série (visites et dépôts)",
  CONTROLE: "N° de contrôle (échantillons)",
};

export function CountersForm({ initial }: { initial: CounterRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(initial.map((c) => [c.kind, String(c.last)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const yy = String((initial[0]?.year ?? new Date().getFullYear()) % 100).padStart(2, "0");

  async function save(kind: CounterRow["kind"]) {
    if (busy) return;
    setBusy(kind);
    setError("");
    setSaved(null);
    try {
      const response = await fetch("/api/admin/counters", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, last: Number(values[kind]) }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(kind);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Hash className="h-4 w-4 text-brand" aria-hidden="true" />
        Compteurs de numérotation {initial[0]?.year}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Le dernier numéro attribué de l&apos;année ; le prochain sera le suivant. Le jour de la bascule, saisissez ici
        les derniers numéros émis par l&apos;ancien logiciel pour que la numérotation continue sans trou ni doublon.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {initial.map((c) => (
          <div key={c.kind} className="rounded-xl border border-slate-200 p-4">
            <label htmlFor={`counter-${c.kind}`} className="block text-sm font-medium text-slate-700">{LABELS[c.kind]}</label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                id={`counter-${c.kind}`}
                type="number"
                inputMode="numeric"
                min={c.highestUsed}
                value={values[c.kind] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [c.kind]: e.target.value }));
                  setSaved(null);
                }}
                className="input-field w-36 px-3"
              />
              <span className="text-sm text-slate-500">/{yy}</span>
              <button
                type="button"
                onClick={() => save(c.kind)}
                disabled={busy !== null || values[c.kind] === String(c.last)}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {busy === c.kind ? "…" : "Enregistrer"}
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Prochain : {Number(values[c.kind] || 0) + 1}/{yy} · plus haut numéro déjà attribué : {c.highestUsed ? `${c.highestUsed}/${yy}` : "aucun"}
              {saved === c.kind && <span className="ml-2 text-emerald-700">Enregistré.</span>}
            </p>
          </div>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Card>
  );
}
