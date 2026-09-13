"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { LabSettings } from "@/lib/lab-settings";
import { LINE_KIND_LABELS } from "@/lib/labels";

/**
 * The workflow decisions the client has not made yet (NEEDEDINFO §4) and the
 * acceptance thresholds of the bon de réception (WORKFLOW.md §6). Both
 * behaviours of each switch are built — the day the laboratory answers,
 * implementing it is a click on this screen.
 */

type SwitchKey = "blockNonConformAtReception" | "alertAfterTechnicalValidation";
type NumberKey =
  | "minFoodMicroG"
  | "minFoodChemG"
  | "minWaterMicroL"
  | "minWaterSalmonellaL"
  | "minWaterChemL"
  | "histamineUnits"
  | "histamineUnitG"
  | "coldChainMaxC";

const SWITCHES: { key: SwitchKey; title: string; on: string; off: string }[] = [
  {
    key: "blockNonConformAtReception",
    title: "Échantillon non conforme à la réception",
    on: "Bloqué : il est enregistré et numéroté, mais reste en attente jusqu'à ce qu'un administrateur le libère vers un technicien.",
    off: "Analysé quand même : il suit le circuit normal, la non-conformité reste tracée sur le rapport.",
  },
  {
    key: "alertAfterTechnicalValidation",
    title: "Moment d'envoi des alertes de contamination",
    on: "Dès la validation technique : le client est prévenu sans attendre l'approbation finale.",
    off: "Après l'approbation de l'administrateur (avec le rapport) — le comportement par défaut.",
  },
];

const THRESHOLDS: { key: NumberKey; label: string; unit: string; hint: string }[] = [
  { key: "minFoodMicroG", label: "Aliment — microbiologie", unit: "g", hint: "Règle 1 du bon de réception" },
  { key: "minFoodChemG", label: "Aliment — physico-chimie", unit: "g", hint: "Règle 2" },
  { key: "minWaterMicroL", label: "Eau — microbiologie", unit: "L", hint: "Règle 3" },
  { key: "minWaterSalmonellaL", label: "Eau — recherche de Salmonella", unit: "L", hint: "Règle 3 bis" },
  { key: "minWaterChemL", label: "Eau — physico-chimie", unit: "L", hint: "Règle 4" },
  { key: "histamineUnits", label: "Histamine — nombre d'unités", unit: "unités", hint: "Règle 5" },
  { key: "histamineUnitG", label: "Histamine — poids par unité", unit: "g", hint: "Règle 5" },
  { key: "coldChainMaxC", label: "Chaîne du froid — T° maximale à l'arrivée", unit: "°C", hint: "Règle 7 (avertissement)" },
];

const KINDS = Object.keys(LINE_KIND_LABELS) as (keyof typeof LINE_KIND_LABELS)[];

export function LabSettingsForm({ initial }: { initial: LabSettings }) {
  const router = useRouter();
  const [switches, setSwitches] = useState<Record<SwitchKey, boolean>>({
    blockNonConformAtReception: initial.blockNonConformAtReception,
    alertAfterTechnicalValidation: initial.alertAfterTechnicalValidation,
  });
  // Numbers are edited as text so a half-typed « 1, » is not rejected mid-way.
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(() =>
    Object.fromEntries(THRESHOLDS.map((t) => [t.key, String(initial[t.key]).replace(".", ",")])) as Record<NumberKey, string>
  );
  const [requiredKinds, setRequiredKinds] = useState<string[]>(
    initial.temperatureRequiredKinds.split(",").map((k) => k.trim()).filter(Boolean)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/lab-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...switches, ...numbers, temperatureRequiredKinds: requiredKinds }),
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
    <form onSubmit={save} noValidate className="space-y-5">
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <SlidersHorizontal className="h-4 w-4 text-brand" aria-hidden="true" />
          Politique du circuit d&apos;analyse
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Deux comportements sont construits pour chaque point — le réglage
          choisit celui que le laboratoire applique. Chaque changement est
          tracé dans le journal.
        </p>

        <div className="mt-4 space-y-4">
          {SWITCHES.map((item) => (
            <fieldset key={item.key} className="rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-800">{item.title}</legend>
              {(
                [
                  { checked: false, label: item.off },
                  { checked: true, label: item.on },
                ] as const
              ).map((option) => (
                <label
                  key={String(option.checked)}
                  className={`mt-2 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                    switches[item.key] === option.checked
                      ? "border-brand bg-brand/5 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={item.key}
                    checked={switches[item.key] === option.checked}
                    onChange={() => setSwitches((current) => ({ ...current, [item.key]: option.checked }))}
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <ClipboardCheck className="h-4 w-4 text-brand" aria-hidden="true" />
          Règles d&apos;acceptation à la réception
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Les sept règles du bon de réception, calculées sur chaque ligne au
          moment de la réception. Une quantité sous le minimum ou une
          température manquante rend la ligne non conforme ; le réglage
          ci-dessus décide si elle est analysée ou bloquée.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {THRESHOLDS.map((item) => (
            <div key={item.key}>
              <label htmlFor={item.key} className="block text-sm font-medium text-slate-700">
                {item.label}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id={item.key}
                  type="text"
                  inputMode="decimal"
                  value={numbers[item.key]}
                  onChange={(event) => setNumbers((current) => ({ ...current, [item.key]: event.target.value }))}
                  className="input-field w-32 px-3"
                />
                <span className="text-sm text-slate-500">{item.unit}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{item.hint}</p>
            </div>
          ))}
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700">
            Température à l&apos;arrivée obligatoire pour (règle 6)
          </legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {KINDS.map((kind) => {
              const checked = requiredKinds.includes(kind);
              return (
                <label
                  key={kind}
                  className={`inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition ${
                    checked ? "border-brand bg-brand/5 text-slate-900" : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      setRequiredKinds((current) =>
                        checked ? current.filter((k) => k !== kind) : [...current, kind]
                      )
                    }
                    className="h-4 w-4 accent-brand"
                  />
                  {LINE_KIND_LABELS[kind]}
                </label>
              );
            })}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Réglages enregistrés — ils s&apos;appliquent immédiatement.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer les réglages"}
        </button>
      </Card>
    </form>
  );
}
