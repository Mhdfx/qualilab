"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Unlock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { TechnicianOption } from "./ReceptionForm";

export type BlockedSample = {
  id: string;
  controlCode: string | null;
  clientName: string;
  produit: string | null;
  conformityNote: string | null;
  receivedAt: string | null;
};

/**
 * Samples held at reception under the non-conformity policy
 * (LabSettings.blockNonConformAtReception). Everyone in the reception space
 * sees them; only an ADMIN carries the key — releasing IS assigning the
 * technician the sample never got.
 */
export function BlockedSamples({
  samples,
  technicians,
  canRelease,
}: {
  samples: BlockedSample[];
  technicians: TechnicianOption[];
  canRelease: boolean;
}) {
  if (samples.length === 0) return null;

  return (
    <section aria-label="Échantillons bloqués" className="mt-8">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          Bloqués — non-conformité
        </h2>
        <span className="text-sm text-slate-500">
          {samples.length} échantillon{samples.length > 1 ? "s" : ""}
        </span>
      </div>
      <ul className="space-y-3">
        {samples.map((sample) => (
          <li key={sample.id}>
            <BlockedRow
              sample={sample}
              technicians={technicians}
              canRelease={canRelease}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BlockedRow({
  sample,
  technicians,
  canRelease,
}: {
  sample: BlockedSample;
  technicians: TechnicianOption[];
  canRelease: boolean;
}) {
  const router = useRouter();
  const [technicianId, setTechnicianId] = useState("");
  const [releasing, setReleasing] = useState(false);
  const [error, setError] = useState("");

  async function release() {
    if (releasing) return;
    if (!technicianId) {
      setError("Choisissez le technicien qui reprend l'analyse.");
      return;
    }
    setReleasing(true);
    setError("");
    try {
      const response = await fetch(`/api/samples/${sample.id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Libération impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setReleasing(false);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-slate-900">
            {sample.controlCode ?? "—"}
          </p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">
            {sample.clientName}
            {sample.produit ? ` · ${sample.produit}` : ""}
          </p>
          {sample.conformityNote && (
            <p className="mt-1 text-sm text-amber-800">
              Motif : {sample.conformityNote}
            </p>
          )}
          {sample.receivedAt && (
            <p className="mt-0.5 text-xs text-slate-500">
              Reçu le {sample.receivedAt}
            </p>
          )}
        </div>

        {canRelease ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor={`release-${sample.id}`}>
              Technicien pour {sample.controlCode ?? "l'échantillon"}
            </label>
            <select
              id={`release-${sample.id}`}
              value={technicianId}
              onChange={(event) => {
                setTechnicianId(event.target.value);
                setError("");
              }}
              className="min-h-[42px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            >
              <option value="">Choisir un technicien</option>
              {technicians.map((technician) => (
                <option key={technician.id} value={technician.id}>
                  {technician.name} — {technician.load} en cours
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={release}
              disabled={releasing}
              className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Unlock className="h-4 w-4" aria-hidden="true" />
              {releasing ? "Libération…" : "Libérer pour analyse"}
            </button>
          </div>
        ) : (
          <p className="text-sm italic text-slate-500">
            En attente de libération par un administrateur.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Card>
  );
}
