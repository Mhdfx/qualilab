"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Building2, Clock, FlaskConical } from "lucide-react";
import type { SampleType } from "@/generated/prisma/client";
import { SAMPLE_TYPE_LABELS, formatDateTime } from "@/lib/labels";
import { PrelevementSuccess } from "@/components/PrelevementSuccess";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { StepIndicator } from "@/components/ui/StepIndicator";
import { Card } from "@/components/ui/Card";
import { TypeBadge } from "@/components/ui/TypeBadge";

type Client = { id: string; name: string };
type Parameter = { id: string; name: string; category: SampleType };

const TYPES: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

export default function NouveauPrelevementPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clients, setClients] = useState<Client[]>([]);
  const [parameters, setParameters] = useState<Parameter[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState("");

  const [clientId, setClientId] = useState("");
  const [lieu, setLieu] = useState("");
  const [type, setType] = useState<SampleType>("ALIMENTAIRE");
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [parameterIds, setParameterIds] = useState<string[]>([]);
  const [nowLabel, setNowLabel] = useState("");

  useEffect(() => {
    setNowLabel(formatDateTime(new Date()));
  }, []);

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then(setClients);
  }, []);

  useEffect(() => {
    fetch(`/api/parameters?category=${type}`)
      .then((r) => r.json())
      .then((data: Parameter[]) => {
        setParameters(data);
        setParameterIds([]);
      });
  }, [type]);

  const selectedClient = clients.find((c) => c.id === clientId);
  const selectedParams = parameters.filter((p) => parameterIds.includes(p.id));

  function toggleParameter(id: string) {
    setParameterIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  }

  function validateStep1() {
    if (!clientId || !lieu.trim() || parameterIds.length === 0) {
      setError("Veuillez sélectionner un client, un lieu et au moins un paramètre.");
      return false;
    }
    setError("");
    return true;
  }

  async function handleConfirm() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          lieu,
          type,
          notes,
          parameterIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Erreur lors de la création.");
        return;
      }
      setCreatedCode(data.code);
      setConfirmedAt(data.sampledAt);
      setStep(3);
    } catch {
      setError("Erreur lors de la création.");
    } finally {
      setLoading(false);
    }
  }

  if (step === 3 && selectedClient && confirmedAt) {
    return (
      <div className="mx-auto max-w-3xl">
        <PrelevementSuccess
          code={createdCode}
          clientName={selectedClient.name}
          lieu={lieu}
          type={type}
          sampledAt={confirmedAt}
          onDone={() => router.push("/preleveur")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        badge="Nouveau prélèvement"
        title={step === 1 ? "Saisie terrain" : "Vérification"}
        subtitle={
          step === 1
            ? "Renseignez les informations du prélèvement sur site"
            : "Vérifiez les données avant enregistrement définitif"
        }
      />

      {step < 3 && <StepIndicator current={step as 1 | 2} />}

      {step === 1 && (
        <Card className="p-6 sm:p-8">
          <div className="space-y-6">
            <div>
              <label className="section-title mb-2">
                <Building2 className="h-4 w-4" />
                Client
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="input-field px-4"
              >
                <option value="">Sélectionner un client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="section-title mb-2">
                <MapPin className="h-4 w-4" />
                Lieu de prélèvement
              </label>
              <input
                type="text"
                value={lieu}
                onChange={(e) => setLieu(e.target.value)}
                placeholder="Ex : Cuisine principale, chambre froide..."
                className="input-field px-4"
              />
            </div>

            <div>
              <label className="section-title mb-2">
                <FlaskConical className="h-4 w-4" />
                Type d&apos;analyse
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as SampleType)}
                className="input-field px-4"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {SAMPLE_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="section-title mb-2">
                <Clock className="h-4 w-4" />
                Date &amp; heure du prélèvement
              </label>
              <div className="rounded-xl border border-brand/15 bg-gradient-to-r from-brand-light/50 to-slate-50 px-4 py-3.5">
                <p className="text-base font-semibold text-slate-800 sm:text-sm">
                  {nowLabel || "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Horodatage automatique — enregistré à la confirmation
                </p>
              </div>
            </div>

            <div>
              <label className="mb-3 block text-sm font-semibold text-slate-700">
                Paramètres demandés
              </label>
              <div className="grid gap-2 sm:grid-cols-2">
                {parameters.map((param) => {
                  const checked = parameterIds.includes(param.id);
                  return (
                    <label
                      key={param.id}
                      className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border px-4 py-3.5 text-sm transition-all ${
                        checked
                          ? "border-brand/40 bg-brand-light/60 shadow-sm ring-1 ring-brand/10"
                          : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleParameter(param.id)}
                        className="accent-brand h-4 w-4"
                      />
                      {param.name}
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Notes (optionnel)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Observations terrain..."
                className="input-field resize-none px-4"
              />
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <PrimaryButton
              type="button"
              onClick={() => validateStep1() && setStep(2)}
              className="w-full min-h-[48px] py-3.5 text-sm font-bold tracking-wide"
            >
              Continuer — Vérifier
            </PrimaryButton>
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="p-6 sm:p-8">
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-slate-900">Récapitulatif</h2>
            <div className="space-y-4 rounded-xl bg-slate-50 p-5 text-sm ring-1 ring-slate-100">
              <div className="flex justify-between gap-4 border-b border-slate-200/60 pb-3">
                <span className="text-slate-500">Client</span>
                <span className="font-medium text-slate-800">{selectedClient?.name}</span>
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-200/60 pb-3">
                <span className="text-slate-500">Lieu</span>
                <span className="text-right font-medium text-slate-800">{lieu}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-slate-200/60 pb-3">
                <span className="text-slate-500">Type</span>
                <TypeBadge type={type} />
              </div>
              <div className="flex justify-between gap-4 border-b border-slate-200/60 pb-3">
                <span className="text-slate-500">Date &amp; heure</span>
                <span className="text-right font-medium text-slate-800">
                  {nowLabel || "—"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                L&apos;heure exacte sera figée au moment de la confirmation.
              </p>
              <div>
                <span className="text-slate-500">Paramètres</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {selectedParams.map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-white px-3 py-1 text-xs font-medium text-brand shadow-sm ring-1 ring-brand/10"
                    >
                      {p.name}
                    </span>
                  ))}
                </div>
              </div>
              {notes && (
                <div>
                  <span className="text-slate-500">Notes</span>
                  <p className="mt-1 text-slate-700">{notes}</p>
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 ring-1 ring-red-100">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3 sm:flex-row">
              <SecondaryButton
                type="button"
                onClick={() => setStep(1)}
                className="min-h-[48px] flex-1 py-3.5"
              >
                Modifier
              </SecondaryButton>
              <PrimaryButton
                type="button"
                onClick={handleConfirm}
                disabled={loading}
                className="min-h-[48px] flex-1 py-3.5 text-sm font-bold tracking-wide"
              >
                {loading ? "Enregistrement..." : "Confirmer le prélèvement"}
              </PrimaryButton>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
