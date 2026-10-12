"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Hash, Info } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  DOCUMENT_NUMBER_PREFIX,
  formatCounterNumber,
  isDocumentCounter,
  type CounterKind,
  type CounterRow,
} from "@/lib/counters";

/**
 * The yearly sequences continued from the old software — N° de série,
 * N° de contrôle, factures and avoirs: on switch-over day the admin types
 * the last numbers it issued. A counter never goes below a number already
 * attributed (the route answers 409).
 */

const LABELS: Record<CounterKind, string> = {
  SERIE: "N° de série (visites et dépôts)",
  CONTROLE: "N° de contrôle (échantillons)",
  FACTURE: "Factures (FAC-AAAA-NNNN)",
  AVOIR: "Avoirs (AV-AAAA-NNNN)",
};

export function CountersForm({ initial }: { initial: CounterRow[] }) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(Object.fromEntries(initial.map((c) => [c.kind, String(c.last)])));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const year = initial[0]?.year ?? new Date().getFullYear();
  const yy = String(year % 100).padStart(2, "0");

  async function save(kind: CounterKind) {
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

  function counter(c: CounterRow) {
    const prefix = isDocumentCounter(c.kind) ? `${DOCUMENT_NUMBER_PREFIX[c.kind]}-${c.year}-` : null;
    const typed = Number(values[c.kind] || 0);
    const next = Number.isInteger(typed) && typed >= 0 ? formatCounterNumber(c.kind, typed + 1, c.year) : "—";
    return (
      <div key={c.kind} className="rounded-xl border border-slate-200 p-4">
        <label htmlFor={`counter-${c.kind}`} className="block text-sm font-medium text-slate-700">
          {LABELS[c.kind]}
        </label>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          {prefix && (
            <span className="font-mono text-sm text-slate-500" aria-hidden="true">
              {prefix}
            </span>
          )}
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
            aria-describedby={`counter-${c.kind}-hint`}
            className="input-field w-32 px-3"
          />
          {!prefix && (
            <span className="text-sm text-slate-500" aria-hidden="true">
              /{yy}
            </span>
          )}
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
        <p id={`counter-${c.kind}-hint`} className="mt-1 text-xs text-slate-500">
          Prochain : <span className="font-mono">{next}</span> · plus haut numéro déjà attribué :{" "}
          {c.highestUsed ? <span className="font-mono">{formatCounterNumber(c.kind, c.highestUsed, c.year)}</span> : "aucun"}
          {saved === c.kind && <span className="ml-2 text-emerald-700">Enregistré.</span>}
        </p>
      </div>
    );
  }

  const lab = initial.filter((c) => !isDocumentCounter(c.kind));
  const documents = initial.filter((c) => isDocumentCounter(c.kind));

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <Hash className="h-4 w-4 text-brand" aria-hidden="true" />
        Compteurs de numérotation {year}
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Le dernier numéro attribué de l&apos;année ; le prochain sera le suivant. Le jour de la bascule, saisissez ici
        les derniers numéros émis par l&apos;ancien logiciel pour que la numérotation continue sans trou ni doublon.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{lab.map(counter)}</div>

      {documents.length > 0 && (
        <>
          <h3 className="mt-6 text-sm font-semibold text-slate-700">Factures et avoirs</h3>
          <p className="mt-1 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              À régler le jour de la bascule, avant la première vraie facture : un saut fait ensuite laisserait un trou
              dans la suite des numéros de factures déjà émises.
            </span>
          </p>
          <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">{documents.map(counter)}</div>
        </>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
    </Card>
  );
}
