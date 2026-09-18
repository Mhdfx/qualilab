"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageSquareQuote } from "lucide-react";
import type { Interpretation } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { VerdictBadge } from "@/components/samples/VerdictBadge";

export type ScaleRow = { interpretation: Interpretation; label: string; sentence: string };

const ORDER: Interpretation[] = ["SATISFAISANT", "ACCEPTABLE", "NON_SATISFAISANT", "INCOMPLET"];

/**
 * The words of the report's conclusion, one sentence per verdict
 * (CRITERES.md §2, rule 5) — the laboratory's own wording, editable here.
 */
export function ConclusionScaleForm({ initial }: { initial: ScaleRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ScaleRow[]>(() =>
    ORDER.map((interpretation) => initial.find((r) => r.interpretation === interpretation) ?? { interpretation, label: "", sentence: "" })
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  function update(interpretation: Interpretation, patch: Partial<ScaleRow>) {
    setRows((current) => current.map((r) => (r.interpretation === interpretation ? { ...r, ...patch } : r)));
    setSaved(false);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/conclusion-scale", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: rows }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <MessageSquareQuote className="h-4 w-4 text-brand" aria-hidden="true" />
          Échelle de conclusion des rapports
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Le verdict d&apos;un échantillon est le plus sévère de ses germes ; la phrase correspondante est imprimée sous « Conclusion ». Les rapports déjà émis ne changent pas.
        </p>
        <div className="mt-4 space-y-4">
          {rows.map((row) => (
            <fieldset key={row.interpretation} className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1">
                <VerdictBadge verdict={row.interpretation} />
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[220px_1fr]">
                <div>
                  <label htmlFor={`label-${row.interpretation}`} className="block text-xs font-medium text-slate-600">Libellé</label>
                  <input id={`label-${row.interpretation}`} type="text" value={row.label} onChange={(e) => update(row.interpretation, { label: e.target.value })} className="input-field mt-1 px-3" />
                </div>
                <div>
                  <label htmlFor={`sentence-${row.interpretation}`} className="block text-xs font-medium text-slate-600">Phrase de conclusion</label>
                  <textarea id={`sentence-${row.interpretation}`} value={row.sentence} onChange={(e) => update(row.interpretation, { sentence: e.target.value })} rows={2} className="input-field mt-1 resize-y px-3" />
                </div>
              </div>
            </fieldset>
          ))}
        </div>
        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        {saved && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Échelle enregistrée.</p>
        )}
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={saving} className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-60">
            <Check className="h-4 w-4" aria-hidden="true" />
            {saving ? "Enregistrement…" : "Enregistrer l'échelle"}
          </button>
        </div>
      </Card>
    </form>
  );
}
