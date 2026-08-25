"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";

export type TechnicianOption = {
  id: string;
  name: string;
  load: number;
};

type ReceptionFormProps = {
  sampleId: string;
  sampleCode: string;
  technicians: TechnicianOption[];
  initialProduit: string;
  initialNumeroLot: string;
};

type Assigned = {
  controlCode: string;
  serialNumber: string;
  conformity: boolean;
};

export function ReceptionForm({
  sampleId,
  sampleCode,
  technicians,
  initialProduit,
  initialNumeroLot,
}: ReceptionFormProps) {
  const router = useRouter();
  const [produit, setProduit] = useState(initialProduit);
  const [numeroLot, setNumeroLot] = useState(initialNumeroLot);
  const [conformity, setConformity] = useState<boolean | null>(null);
  const [conformityNote, setConformityNote] = useState("");
  const [technicianId, setTechnicianId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [assigned, setAssigned] = useState<Assigned | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;

    if (conformity === null) {
      setError("Veuillez indiquer la conformité de l'échantillon.");
      return;
    }
    if (!conformity && !conformityNote.trim()) {
      setError("Le motif est obligatoire pour une non-conformité.");
      return;
    }
    if (!technicianId) {
      setError("Veuillez attribuer l'échantillon à un technicien.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const response = await fetch(`/api/samples/${sampleId}/reception`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conformity,
          conformityNote: conformityNote.trim(),
          technicianId,
          produit: produit.trim(),
          numeroLot: numeroLot.trim(),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Impossible de réceptionner l'échantillon.");
        return;
      }

      // Deliberately no router.refresh() here: re-rendering the server page
      // would replace this form — and the numbers the réceptionniste still
      // needs to read — with the "already received" state. The queue is
      // refreshed when they navigate back.
      setAssigned({
        controlCode: data.controlCode,
        serialNumber: data.serialNumber,
        conformity,
      });
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSubmitting(false);
    }
  }

  if (assigned) {
    return <ReceptionSuccess sampleCode={sampleCode} assigned={assigned} />;
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Contrôle à réception
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="produit" className="block text-sm font-medium text-slate-700">
              Produit
            </label>
            <input
              id="produit"
              type="text"
              value={produit}
              onChange={(event) => setProduit(event.target.value)}
              placeholder="Ex. : Salade printanière"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
          <div>
            <label htmlFor="numeroLot" className="block text-sm font-medium text-slate-700">
              N° de lot
            </label>
            <input
              id="numeroLot"
              type="text"
              value={numeroLot}
              onChange={(event) => setNumeroLot(event.target.value)}
              placeholder="Facultatif"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
        <p className="mt-1.5 text-xs text-slate-500">
          Repris sur le rapport et sur les alertes de contamination.
        </p>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700">
            Conformité de l&apos;échantillon
          </legend>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <ConformityChoice
              selected={conformity === true}
              onSelect={() => {
                setConformity(true);
                setError("");
              }}
              tone="ok"
              icon={CheckCircle2}
              label="Conforme"
              hint="L'échantillon respecte les conditions de prélèvement"
            />
            <ConformityChoice
              selected={conformity === false}
              onSelect={() => {
                setConformity(false);
                setError("");
              }}
              tone="warn"
              icon={AlertTriangle}
              label="Non conforme"
              hint="Un motif sera demandé"
            />
          </div>
        </fieldset>

        {conformity === false && (
          <div className="mt-4">
            <label
              htmlFor="conformityNote"
              className="block text-sm font-medium text-slate-700"
            >
              Motif de non-conformité <span className="text-rose-600">*</span>
            </label>
            <textarea
              id="conformityNote"
              value={conformityNote}
              onChange={(event) => setConformityNote(event.target.value)}
              rows={3}
              required
              placeholder="Ex. : rupture de la chaîne du froid, contenant non étanche, délai dépassé…"
              className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        )}

        <div className="mt-4">
          <label
            htmlFor="technicianId"
            className="block text-sm font-medium text-slate-700"
          >
            Attribuer à un technicien <span className="text-rose-600">*</span>
          </label>
          <select
            id="technicianId"
            value={technicianId}
            onChange={(event) => {
              setTechnicianId(event.target.value);
              setError("");
            }}
            required
            className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            <option value="">Sélectionner un technicien</option>
            {technicians.map((technician) => (
              <option key={technician.id} value={technician.id}>
                {technician.name} — {technician.load} en cours
              </option>
            ))}
          </select>
          {technicians.length === 0 && (
            <p className="mt-1.5 text-sm text-amber-700">
              Aucun technicien disponible. Créez un compte technicien avant de
              réceptionner.
            </p>
          )}
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          <ShieldCheck
            className="mt-0.5 h-4 w-4 shrink-0 text-brand"
            aria-hidden="true"
          />
          <p>
            La validation générera le <b>code contrôle</b> et le{" "}
            <b>numéro de série</b> officiels. Ces numéros ne sont jamais visibles
            par le préleveur.
          </p>
        </div>

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row-reverse">
          <PrimaryButton
            type="submit"
            disabled={submitting || technicians.length === 0}
            className="sm:flex-1"
          >
            {submitting ? "Réception en cours…" : "Valider la réception"}
          </PrimaryButton>
          <SecondaryButton
            type="button"
            onClick={() => router.push("/reception")}
            disabled={submitting}
          >
            Annuler
          </SecondaryButton>
        </div>
      </Card>
    </form>
  );
}

function ConformityChoice({
  selected,
  onSelect,
  tone,
  icon: Icon,
  label,
  hint,
}: {
  selected: boolean;
  onSelect: () => void;
  tone: "ok" | "warn";
  icon: typeof CheckCircle2;
  label: string;
  hint: string;
}) {
  const active =
    tone === "ok"
      ? "border-emerald-400 bg-emerald-50 ring-1 ring-emerald-200"
      : "border-amber-400 bg-amber-50 ring-1 ring-amber-200";
  const iconTone = tone === "ok" ? "text-emerald-600" : "text-amber-600";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex min-h-[44px] items-start gap-3 rounded-xl border p-3 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
        selected ? active : "border-slate-200 bg-white hover:border-slate-300"
      }`}
    >
      <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${iconTone}`} aria-hidden="true" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-800">{label}</span>
        <span className="block text-xs text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

/**
 * After reception the réceptionniste needs the two numbers immediately, to
 * label the physical sample — so they are shown large and copiable rather than
 * buried in a toast.
 */
function ReceptionSuccess({
  sampleCode,
  assigned,
}: {
  sampleCode: string;
  assigned: Assigned;
}) {
  const router = useRouter();

  function handleBack() {
    // Refresh first so the queue no longer lists this sample.
    router.refresh();
    router.push("/reception");
  }

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
          <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-semibold text-slate-900">Échantillon réceptionné</h2>
          <p className="text-sm text-slate-500">
            {sampleCode} · attribué au technicien
          </p>
        </div>
      </div>

      {!assigned.conformity && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Enregistré comme <b>non conforme</b> — le motif est joint au dossier.
        </p>
      )}

      <p className="mt-5 text-sm font-medium text-slate-700">
        Numérotation officielle à reporter sur l&apos;échantillon
      </p>
      <div className="mt-2 space-y-2.5">
        <NumberPlate label="Code contrôle" value={assigned.controlCode} />
        <NumberPlate label="N° de série (analyse)" value={assigned.serialNumber} />
      </div>

      <div className="mt-5">
        <PrimaryButton type="button" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à la file de réception
        </PrimaryButton>
      </div>
    </Card>
  );
}

function NumberPlate({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="whitespace-nowrap font-mono text-lg font-bold tracking-tight text-slate-900">
          {value}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
          aria-label={`Copier ${label}`}
          className="rounded-lg p-2 text-slate-500 transition hover:bg-white hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          {copied ? (
            <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          ) : (
            <Copy className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
}
