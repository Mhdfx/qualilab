"use client";

import { useEffect, useState } from "react";
import { FlaskConical, Plus, RefreshCw } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/labels";
import { SAMPLE_STATUS_LABELS, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { billedBeforeResult } from "@/lib/billing-status";
import type { SampleStatus, SampleType } from "@/generated/prisma/client";
import { viaSiteLabel, type SampleProvenance } from "@/components/commercial/client-actions-logic";

export type BillableLine = {
  sampleId: string;
  description: string;
  quantity: number;
  unitPrice: number;
  unpriced: boolean;
};

/**
 * A billing client is billed for the samples of its principal's sites
 * (CLIENTS-FUSION.md §4): those carry their provenance, shown as « via le
 * site S de P ».
 */
type BillableSample = SampleProvenance & {
  id: string;
  code: string;
  controlCode: string | null;
  type: SampleType;
  produit: string | null;
  /** Billable from the confirmed programme on (PROGRAMME.md §6): not always validated. */
  status: SampleStatus;
  programmedAt: string | null;
  validatedAt: string | null;
  /** Its report is reopened for amendment (AMENDEMENT.md): results were approved before. */
  amendmentPending?: boolean;
  parameters: { name: string }[];
};

/**
 * The analyses a client has not been invoiced for — validated, or only
 * programmed (PROGRAMME.md §6): the invoice no longer waits for the report,
 * and a line billed before its result is flagged so the accountant knows.
 *
 * Choosing samples fills the invoice lines at catalogue prices; the accountant
 * then edits the wording and the amounts freely before issuing, which is the
 * control over naming the client asked for.
 */
export function BillableSamples({
  clientId,
  draftId,
  listed = [],
  onAdd,
}: {
  clientId: string;
  /** The draft being edited: its own samples are offered again (one removed can be put back). */
  draftId?: string;
  /** Samples already on the invoice's lines: not offered twice. */
  listed?: readonly string[];
  onAdd: (lines: BillableLine[]) => void;
}) {
  // Keyed by client: choosing another one remounts the panel, so its state
  // resets by construction rather than by clearing it in an effect.
  if (!clientId) return null;
  return <BillableSamplesFor key={clientId} clientId={clientId} draftId={draftId} listed={listed} onAdd={onAdd} />;
}

function BillableSamplesFor({
  clientId,
  draftId,
  listed,
  onAdd,
}: {
  clientId: string;
  draftId?: string;
  listed: readonly string[];
  onAdd: (lines: BillableLine[]) => void;
}) {
  const [samples, setSamples] = useState<BillableSample[]>([]);
  const [lines, setLines] = useState<BillableLine[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const query = draftId ? `?brouillon=${encodeURIComponent(draftId)}` : "";
    fetch(`/api/clients/${clientId}/billable${query}`)
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
  }, [clientId, draftId]);

  if (loading) {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
        Recherche des analyses à facturer…
      </p>
    );
  }

  const offered = samples.filter((sample) => !listed.includes(sample.id));

  if (offered.length === 0) {
    return (
      <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
        Aucune analyse en attente de facturation pour ce client.
      </p>
    );
  }

  const selectedLines = lines.filter(
    (line) => chosen.has(line.sampleId) && !listed.includes(line.sampleId)
  );
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
          Analyses à facturer
        </h3>
        <button
          type="button"
          onClick={() =>
            setChosen(
              chosen.size === offered.length
                ? new Set()
                : new Set(offered.map((sample) => sample.id))
            )
          }
          className="rounded text-xs font-medium text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {chosen.size === offered.length ? "Tout désélectionner" : "Tout sélectionner"}
        </button>
      </div>

      <ul className="mt-3 space-y-1.5">
        {offered.map((sample) => {
          const sampleLines = lines.filter((line) => line.sampleId === sample.id);
          const amount = sampleLines.reduce(
            (sum, line) => sum + line.quantity * line.unitPrice,
            0
          );
          const missingPrice = sampleLines.some((line) => line.unpriced);
          // Programmed or on the bench: billed before its results are validated.
          const beforeResult = billedBeforeResult(sample.status) && !sample.amendmentPending;
          const via = viaSiteLabel(sample, clientId);

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
                    {via && (
                      <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800 ring-1 ring-violet-200">
                        {via}
                      </span>
                    )}
                    {beforeResult && (
                      <span
                        title={`Ligne « ${SAMPLE_STATUS_LABELS[sample.status]} » : facturée sur le programme confirmé, résultats non validés.`}
                        className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800"
                      >
                        avant résultat
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {sample.produit ? `${sample.produit} · ` : ""}
                    {sampleLines.length} analyse
                    {sampleLines.length > 1 ? "s" : ""}
                    {sample.validatedAt
                      ? ` · validé le ${formatDate(sample.validatedAt)}`
                      : sample.programmedAt
                        ? ` · programmé le ${formatDate(sample.programmedAt)}`
                        : ""}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-700">
                  {formatCurrency(amount)}
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
          : `Ajouter ${selectedLines.length} ligne${selectedLines.length > 1 ? "s" : ""} · ${formatCurrency(selectedTotal)}`}
      </button>
    </div>
  );
}
