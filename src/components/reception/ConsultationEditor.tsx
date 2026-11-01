"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Handshake, Pencil } from "lucide-react";
import type { ConsultationChannel } from "@/generated/prisma/enums";
import {
  EMPTY_CONSULTATION,
  consultationDraftError,
  consultationPayload,
  consultationText,
  storedConsultation,
  type ConsultationDraft,
} from "@/lib/client-consultation";
import { fromLocalInput, toLocalInput } from "@/components/preleveur/visit-types";
import { dateTimePending } from "@/components/LabDateTimeInput";
import { ConsultationFields, consultationAtId } from "./reception-widgets";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";

export type ConsultationEditorSample = {
  id: string;
  clientConsultedName: string | null;
  clientConsultationChannel: ConsultationChannel | null;
  clientConsultedAt: string | null;
  clientConsultationNote: string | null;
};

/**
 * « Accord du client » after the reception (RETOUR-LABO-28-10.md I6 — Q75):
 * on a sample received non conforme and not yet technically validated, the
 * reception or the administrator adds the client's agreement or corrects it
 * (`PUT /api/samples/[id]/consultation`, journalled before → after). The
 * page decides when to show it (`consultationEditable`); the API decides
 * again.
 */
export function ConsultationEditor({ sample }: { sample: ConsultationEditorSample }) {
  const router = useRouter();
  const stored = storedConsultation(sample);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<ConsultationDraft>(EMPTY_CONSULTATION);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const idPrefix = `consult-${sample.id}`;

  function start() {
    setDraft(
      stored
        ? {
            name: sample.clientConsultedName ?? "",
            channel: sample.clientConsultationChannel ?? "",
            at: sample.clientConsultedAt ? toLocalInput(new Date(sample.clientConsultedAt)) : "",
            note: sample.clientConsultationNote ?? "",
          }
        : EMPTY_CONSULTATION
    );
    setError("");
    setSaved(false);
    setOpen(true);
  }

  async function save() {
    if (saving) return;
    const pending = dateTimePending(consultationAtId(idPrefix));
    if (pending) {
      setError(pending);
      return;
    }
    const invalid = consultationDraftError(draft, true);
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/samples/${sample.id}/consultation`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(consultationPayload(draft, fromLocalInput)),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setOpen(false);
      setSaved(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-sm">
        <span className="inline-flex items-center gap-1.5 text-slate-700">
          <Handshake className="h-4 w-4 text-slate-400" aria-hidden="true" />
          {stored ? <>Analysé avec l&apos;{consultationText(stored)}.</> : <span className="text-slate-500">Aucun accord du client enregistré.</span>}
        </span>
        <button
          type="button"
          onClick={start}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-brand transition hover:bg-brand/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          {stored ? "Corriger l'accord du client" : "Ajouter l'accord du client"}
        </button>
        {saved && (
          <span role="status" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Enregistré — visible du validateur.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="mt-2 px-1">
      <ConsultationFields idPrefix={idPrefix} value={draft} onChange={setDraft} required invalid={Boolean(error)} />
      <p className="mt-2 text-xs text-slate-500">
        Un accord enregistré ne s&apos;efface pas : il se corrige, et le journal garde l&apos;ancienne version.
      </p>
      {error && (
        <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <PrimaryButton type="button" onClick={save} disabled={saving}>
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer l'accord"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={() => setOpen(false)} disabled={saving}>
          Annuler
        </SecondaryButton>
      </div>
    </div>
  );
}
