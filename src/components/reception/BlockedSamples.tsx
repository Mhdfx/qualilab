"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, FlaskConical, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NON_CONFORMITY_REASON_LABELS } from "@/lib/labels";
import {
  CONSULTATION_TIME_LABEL,
  EMPTY_CONSULTATION,
  consultationDraftError,
  consultationPayload,
  type ConsultationDraft,
  type ReceptionDecision,
} from "@/lib/client-consultation";
import { RELEASE_DECISIONS, RELEASE_REASON_MAX } from "@/lib/release-rules";
import { futureFieldError } from "@/lib/device-time";
import { fromLocalInput } from "@/components/preleveur/visit-types";
import { ConsultationFields, DecisionChips } from "./reception-widgets";

export type BlockedSample = {
  id: string;
  controlCode: string | null;
  clientName: string;
  produit: string | null;
  conformityReason: keyof typeof NON_CONFORMITY_REASON_LABELS | null;
  conformityNote: string | null;
  receivedAt: string | null;
  /** « depuis 2 j » while the sample waits for the client's opinion (A9); null for another hold. */
  awaitingClient: string | null;
  /** Non conforme at reception: analysing it may need the client's agreement. */
  nonConform: boolean;
  /** This viewer may release it (`releaseRefusal`): the admin always, the reception a sample waiting for the client. */
  canRelease: boolean;
};

/**
 * Samples held at reception. « En attente du client » (A9): received non
 * conforme, waiting for the client's opinion — the reception or the admin
 * releases it, analysed (the client's agreement noted) or destroyed. Any
 * other hold (a destroyed sample reactivated, the retired policy) stays the
 * admin's. Releasing never assigns a technician: an analysed sample goes to
 * the programme queue like any received sample, then to « À prendre » once
 * programmed, where a technician takes it (PROGRAMME.md §10).
 */
export function BlockedSamples({
  samples,
  consultationRequired,
}: {
  samples: BlockedSample[];
  consultationRequired: boolean;
}) {
  if (samples.length === 0) return null;

  return (
    // `#bloques`: the vue direction's « N échantillons bloqués » banner lands here.
    <section id="bloques" aria-label="Échantillons bloqués" className="mt-8 scroll-mt-24">
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
            <BlockedRow sample={sample} consultationRequired={consultationRequired} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function BlockedRow({ sample, consultationRequired }: { sample: BlockedSample; consultationRequired: boolean }) {
  const router = useRouter();
  const [decision, setDecision] = useState<ReceptionDecision | null>(null);
  const [consultation, setConsultation] = useState<ConsultationDraft>(EMPTY_CONSULTATION);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const required = consultationRequired && sample.nonConform;
  const label = sample.controlCode ?? "l'échantillon";

  async function release() {
    if (busy || !decision) return;
    if (decision === "ANALYSER") {
      const problem =
        consultationDraftError(consultation, required) ?? futureFieldError(CONSULTATION_TIME_LABEL, consultation.at);
      if (problem) {
        setError(problem);
        document.getElementById(`release-${sample.id}-name`)?.focus();
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/samples/${sample.id}/release`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          consultation: decision === "ANALYSER" ? consultationPayload(consultation, fromLocalInput) : undefined,
          reason: reason.trim() || undefined,
        }),
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
      setBusy(false);
    }
  }

  return (
    <Card className="border-amber-200 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-sm font-bold text-slate-900">{sample.controlCode ?? "—"}</p>
          <p className="mt-0.5 text-sm font-medium text-slate-800">
            {sample.clientName}
            {sample.produit ? ` · ${sample.produit}` : ""}
          </p>
          {sample.conformityReason && (
            <p className="mt-1 text-sm font-medium text-amber-900">{NON_CONFORMITY_REASON_LABELS[sample.conformityReason]}</p>
          )}
          {sample.conformityNote && <p className="mt-1 text-sm text-amber-800">Motif : {sample.conformityNote}</p>}
          {sample.receivedAt && <p className="mt-0.5 text-xs text-slate-500">Reçu le {sample.receivedAt}</p>}
        </div>
        {sample.awaitingClient ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            En attente du client {sample.awaitingClient}
          </span>
        ) : (
          <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            Libération par un administrateur
          </span>
        )}
      </div>

      {sample.canRelease ? (
        <div className="mt-3 border-t border-amber-200/70 pt-3">
          <DecisionChips
            legend={`Décision pour ${label}`}
            value={decision}
            decisions={RELEASE_DECISIONS}
            onChange={(chosen) => {
              setDecision(chosen);
              setError("");
            }}
          />

          {decision === "ANALYSER" && (
            <>
              <ConsultationFields
                idPrefix={`release-${sample.id}`}
                value={consultation}
                onChange={(value) => {
                  setConsultation(value);
                  setError("");
                }}
                required={required}
                invalid={Boolean(error) && consultationDraftError(consultation, required) !== null}
              />
              <p className="mt-2 text-xs text-slate-600">
                L&apos;échantillon rejoint la file de programmation, puis la liste « À prendre » des techniciens.
              </p>
            </>
          )}

          {decision === "DETRUIRE" && (
            <div className="mt-3">
              <label htmlFor={`release-${sample.id}-reason`} className="block text-sm font-medium text-slate-700">
                Motif <span className="font-normal text-slate-500">(facultatif)</span>
              </label>
              <textarea
                id={`release-${sample.id}-reason`}
                rows={2}
                maxLength={RELEASE_REASON_MAX}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ex. : le client demande la destruction"
                className="input-field mt-1.5 resize-y px-3 py-2"
              />
              <p className="mt-2 flex items-start gap-2 text-xs text-rose-800">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Annulé avec le motif « Détruit à réception » : aucune analyse, rien n&apos;est facturé, le client est informé par
                e-mail.
              </p>
            </div>
          )}

          {decision && (
            <button
              type="button"
              onClick={release}
              disabled={busy}
              className={`mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
                decision === "DETRUIRE"
                  ? "bg-rose-700 hover:bg-rose-800 focus-visible:ring-rose-600"
                  : "bg-brand hover:bg-brand-dark focus-visible:ring-brand"
              }`}
            >
              {decision === "DETRUIRE" ? (
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              ) : (
                <FlaskConical className="h-4 w-4" aria-hidden="true" />
              )}
              {busy ? "Enregistrement…" : decision === "DETRUIRE" ? "Détruire l'échantillon" : "Analyser l'échantillon"}
            </button>
          )}
        </div>
      ) : (
        <p className="mt-3 text-sm italic text-slate-500">En attente de libération par un administrateur.</p>
      )}

      {error && (
        <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Card>
  );
}
