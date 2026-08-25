"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Plus, RefreshCw } from "lucide-react";
import { formatDate } from "@/lib/labels";
import { SAMPLE_TYPE_LABELS } from "@/lib/labels";
import type { SampleType } from "@/generated/prisma/client";

export type BillableLine = {
  sampleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unpriced: boolean;
};

type BillableSample = {
  id: string;
  code: string;
  controlCode: string | null;
  type: SampleType;
  produit: string | null;
  validatedAt: string | null;
  parameters: { name: string }[];
};

/**
 * The validated analyses a client has not been invoiced for.
 *
 * Choosing samples fills the invoice lines at catalogue prices; the accountant
 * then edits the wording and the amounts freely before issuing, which is the
 * control over naming the client asked for.
 */
export function BillableSamples({
  clientId,
  onAdd,
}: {
  clientId: string;
  onAdd: (lines: BillableLine[]) => void;
}) {
  // Keyed by client: choosing another one remounts the panel, so its state
  // resets by construction rather than by clearing it in an effect.
  if (!clientId) return null;
  return <BillableSamplesFor key={clientId} clientId={clientId} onAdd={onAdd} />;
}

function BillableSamplesFor({
  clientId,
  onAdd,
}: {
  clientId: string;
  onAdd: (lines: BillableLine[]) => void;
}) {
  const [samples, setSamples] = useState<BillableSample[]>([]);
  const [lines, setLines] = useState<BillableLine[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/clients/${clientId}/billable`)
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        setSamples(data.samples ?? []);
        setLines(data.lines ?? []);
      })
      .catch(() => {
        if (!cancelled) setSamples([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Recherche des analyses à facturer…
      </p>
    );
  }

  if (samples.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        Aucune analyse validée en attente de facturation pour ce client.
      </p>
    );
  }

  const selectedLines = lines.filter((line) => chosen.has(line.sampleId));
  const selectedTotal = selectedLines.reduce(
    (sum, line) => sum + line.quantity * line.unitPrice,
    0
  );

  function toggle(id: string) {
    setChosen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-xl border border-brand/20 bg-brand-light/30 p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <FlaskConical className="h-4 w-4 text-brand" aria-hidden="true" />
          Analyses validées à facturer
        </h3>
        <button
          type="button"
          onClick={() =>
            setChosen(
              chosen.size === samples.length
                ? new Set()
                : new Set(samples.map((sample) => sample.id))
            )
          }
          className="rounded text-xs font-medium text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {chosen.size === samples.length ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {samples.map((sample) => {
          const sampleLines = lines.filter((line) => line.sampleId === sample.id);
          const amount = sampleLines.reduce(
            (sum, line) => sum + line.quantity * line.unitPrice,
            0
          );
          const missingPrice = sampleLines.some((line) => line.unpriced);

          return (
            <li key={sample.id}>
              <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-white p-2.5 ring-1 ring-slate-200 transition hover:ring-brand/40">
                <input
                  type="checkbox"
                  checked={chosen.has(sample.id)}
                  onChange={() => toggle(sample.id)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono font-semibold text-slate-900">
                      {sample.controlCode ?? sample.code}
                    </span>
                    <span className="text-xs text-slate-500">
                      {SAMPLE_TYPE_LABELS[sample.type]}
                    </span>
                    {missingPrice && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        prix à saisir
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {sample.produit ? `${sample.produit} · ` : ""}
                    {sampleLines.length} analyse
                    {sampleLines.length > 1 ? "s" : ""}
                    {sample.validatedAt && ` · validé le ${formatDate(sample.validatedAt)}`}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                  {amount.toFixed(2)} DH
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={() => {
          onAdd(selectedLines);
          setChosen(new Set());
        }}
        disabled={selectedLines.length === 0}
        className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        {selectedLines.length === 0
          ? "Sélectionnez des échantillons"
          : `Ajouter ${selectedLines.length} ligne${selectedLines.length > 1 ? "s" : ""} · ${selectedTotal.toFixed(2)} DH`}
      </button>
    </div>
  );
}
