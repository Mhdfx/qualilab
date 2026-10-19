"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Scale, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { LabSettings } from "@/lib/lab-settings";
import { LINE_KIND_LABELS } from "@/lib/labels";
import {
  RECEPTION_RULES,
  checklistRowLabel,
  type ReceptionRuleKey,
  type ReceptionThresholds,
} from "@/lib/reception-rules";

/**
 * The workflow decisions the client has not made yet (NEEDEDINFO §4) and the
 * acceptance thresholds of the bon de réception (WORKFLOW.md §6). Both
 * behaviours of each switch are built — the day the laboratory answers,
 * implementing it is a click on this screen.
 *
 * The thresholds are named by the paper's own numbering and wording,
 * (1) … (8) (`RECEPTION_RULES`, version H of 12/10), figures as typed.
 *
 * The limits of the contrôles complémentaires (hors bon) follow in a block
 * of their own: C1, the delay sampling → arrival per family and whether an
 * exceeded delay refuses « conforme »; C2, the transport temperature ranges
 * (chilled, chilled water for microbiology, frozen) — never a refusal.
 */

type SwitchKey = "alertAfterTechnicalValidation" | "consultationRequired";
type NumberKey =
  | "minFoodMicroG"
  | "minFoodChemG"
  | "minWaterMicroL"
  | "minWaterSalmonellaL"
  | "minWaterChemL"
  | "histamineUnits"
  | "histamineUnitG"
  | "molluscMinIndividuals"
  | "molluscMinG"
  | "molluscSmallMinG";

// The non-conform-at-reception switch is gone (29/09): the réceptionniste
// decides line by line, « Analyser malgré tout » or « Détruire ».
const SWITCHES: { key: SwitchKey; title: string; on: string; off: string }[] = [
  {
    key: "alertAfterTechnicalValidation",
    title: "Moment d'envoi des alertes de contamination",
    on: "Dès la validation technique : le client est prévenu sans attendre la validation administrative — le choix du laboratoire (29/09).",
    // The report no longer leaves at the approval (16/10, Q92); the alerts still do.
    off: "À la validation administrative, que le rapport soit envoyé alors ou plus tard.",
  },
  {
    key: "consultationRequired",
    title: "Accord du client obligatoire pour analyser un non-conforme",
    off: "Non : la réception note l'accord du client quand elle l'a demandé (nom, canal, date).",
    on: "Oui : « Analyser malgré tout » un échantillon non conforme exige le nom de la personne consultée et le canal.",
  },
];

/** Each threshold and the rule of the paper it sets. */
const THRESHOLDS: { key: NumberKey; label: string; unit: string; rule: ReceptionRuleKey }[] = [
  { key: "minFoodMicroG", label: "Aliment — microbiologie", unit: "g", rule: "ALIMENT_MICRO" },
  { key: "minFoodChemG", label: "Aliment — physico-chimie", unit: "g", rule: "ALIMENT_CHIMIE" },
  { key: "minWaterMicroL", label: "Eau — microbiologie", unit: "L", rule: "EAU_MICRO" },
  { key: "minWaterSalmonellaL", label: "Eau — recherche de Salmonella", unit: "L", rule: "EAU_MICRO" },
  { key: "minWaterChemL", label: "Eau — physico-chimie", unit: "L", rule: "EAU_CHIMIE" },
  { key: "histamineUnits", label: "Histamine — nombre d'unités", unit: "unités", rule: "HISTAMINE" },
  { key: "histamineUnitG", label: "Histamine — poids par unité", unit: "g", rule: "HISTAMINE" },
  { key: "molluscMinIndividuals", label: "Mollusques bivalves — individus", unit: "individus", rule: "MOLLUSQUES" },
  { key: "molluscMinG", label: "Mollusques bivalves — poids minimal", unit: "g", rule: "MOLLUSQUES" },
  { key: "molluscSmallMinG", label: "Mollusques bivalves — animaux de petite taille", unit: "g", rule: "MOLLUSQUES" },
];

/** The limits of the contrôles complémentaires — `nullable`: empty = no limit; `decimal`: a temperature. */
type ControlKey = "maxDelayMicroH" | "maxDelayChemH" | "coldChainMinC" | "coldChainMaxC" | "waterMicroMaxC" | "frozenMaxC";
const CONTROLS: { key: ControlKey; label: string; unit: string; hint: string; nullable?: boolean; decimal?: boolean }[] = [
  {
    key: "maxDelayMicroH",
    label: "Délai maximal prélèvement → arrivée, microbiologie (h)",
    unit: "h",
    hint: "C1 — compté de la fin du prélèvement à l'arrivée au laboratoire.",
  },
  {
    key: "maxDelayChemH",
    label: "Délai maximal prélèvement → arrivée, physico-chimie (h, vide = sans objet)",
    unit: "h",
    hint: "C1 — vide : pas de délai fixé pour la physico-chimie.",
    nullable: true,
  },
  {
    key: "coldChainMinC",
    label: "Réfrigéré — T° minimale à l'arrivée",
    unit: "°C",
    hint: "C2 — aliments, surfaces, mains, eau en microbiologie.",
    decimal: true,
  },
  {
    key: "coldChainMaxC",
    label: "Réfrigéré — T° maximale à l'arrivée",
    unit: "°C",
    hint: "C2 — hors de la plage : « à vérifier », jamais un refus.",
    decimal: true,
  },
  {
    key: "waterMicroMaxC",
    label: "Eau (microbiologie) — T° maximale à l'arrivée",
    unit: "°C",
    hint: "C2 — remplace la maximale réfrigérée pour l'eau en microbiologie.",
    decimal: true,
  },
  {
    key: "frozenMaxC",
    label: "Congelé — T° maximale à l'arrivée",
    unit: "°C",
    hint: "C2 — au-dessus : « à vérifier ».",
    decimal: true,
  },
];

const RULE_OF = new Map(RECEPTION_RULES.map((rule) => [rule.key, rule]));

/** « 1,5 » → 1.5; a half-typed or empty value keeps the saved one. */
function typedNumber(value: string, saved: number) {
  const parsed = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(parsed) ? parsed : saved;
}

const KINDS = Object.keys(LINE_KIND_LABELS) as (keyof typeof LINE_KIND_LABELS)[];

export function LabSettingsForm({
  initial,
  regulations,
}: {
  initial: LabSettings;
  regulations: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [switches, setSwitches] = useState<Record<SwitchKey, boolean>>({
    alertAfterTechnicalValidation: initial.alertAfterTechnicalValidation,
    consultationRequired: initial.consultationRequired,
  });
  const [regulationMicroId, setRegulationMicroId] = useState(initial.regulationMicroId ?? "");
  const [regulationChimieId, setRegulationChimieId] = useState(initial.regulationChimieId ?? "");
  // Numbers are edited as text so a half-typed « 1, » is not rejected mid-way.
  const [numbers, setNumbers] = useState<Record<NumberKey, string>>(() =>
    Object.fromEntries(THRESHOLDS.map((t) => [t.key, String(initial[t.key]).replace(".", ",")])) as Record<NumberKey, string>
  );
  const [controls, setControls] = useState<Record<ControlKey, string>>(
    () =>
      Object.fromEntries(
        CONTROLS.map((c) => [c.key, initial[c.key] === null ? "" : String(initial[c.key]).replace(".", ",")])
      ) as Record<ControlKey, string>
  );
  const [delayBlocking, setDelayBlocking] = useState(initial.delayBlocking);
  const [requiredKinds, setRequiredKinds] = useState<string[]>(
    initial.temperatureRequiredKinds.split(",").map((k) => k.trim()).filter(Boolean)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  // The paper's wording with the figures as typed, so the hints read like the bon.
  const live: ReceptionThresholds = {
    ...initial,
    ...(Object.fromEntries(THRESHOLDS.map((t) => [t.key, typedNumber(numbers[t.key], initial[t.key])])) as Record<
      NumberKey,
      number
    >),
    temperatureRequiredKinds: requiredKinds.join(","),
  };
  const ruleLine = (key: ReceptionRuleKey) => {
    const rule = RULE_OF.get(key)!;
    return checklistRowLabel({ n: rule.n, text: rule.text(live) });
  };

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
        body: JSON.stringify({
          ...switches,
          ...numbers,
          ...controls,
          delayBlocking,
          temperatureRequiredKinds: requiredKinds,
          regulationMicroId,
          regulationChimieId,
        }),
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
          Deux comportements sont construits — le réglage choisit celui que le
          laboratoire applique. Chaque changement est tracé dans le journal.
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
          <Scale className="h-4 w-4 text-brand" aria-hidden="true" />
          Réglementation proposée par famille
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Proposée au validateur technique quand ni le produit du client ni son type n&apos;en ont déjà une ;
          il la confirme ou la change pour chaque échantillon. La liste se gère dans « Réglementations ».
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(
            [
              { id: "regulationMicroId", label: "Microbiologie", value: regulationMicroId, set: setRegulationMicroId },
              { id: "regulationChimieId", label: "Physico-chimie", value: regulationChimieId, set: setRegulationChimieId },
            ] as const
          ).map((item) => (
            <div key={item.id}>
              <label htmlFor={item.id} className="block text-sm font-medium text-slate-700">{item.label}</label>
              <select id={item.id} value={item.value} onChange={(e) => item.set(e.target.value)} className="input-field mt-1.5 px-3">
                <option value="">— aucune —</option>
                {regulations.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <ClipboardCheck className="h-4 w-4 text-brand" aria-hidden="true" />
          Règles d&apos;acceptation à la réception
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Les huit règles du bon de réception (PG05/EN04), en liste de contrôle sur chaque
          échantillon au moment de la réception, imprimées aussi sous le bon et le protocole. La
          règle (1) est la réponse du réceptionniste ; une quantité sous le minimum ou une
          température manquante rend l&apos;échantillon non conforme ; la réception décide alors,
          échantillon par échantillon, de l&apos;analyser malgré tout ou de le détruire. La règle (8)
          s&apos;applique aux aliments dont la désignation, le type ou la nature nomme des mollusques
          bivalves.
        </p>
        <ol className="mt-3 space-y-1 rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600 ring-1 ring-slate-100">
          {RECEPTION_RULES.map((rule) => (
            <li key={rule.key}>{checklistRowLabel({ n: rule.n, text: rule.text(live) })}</li>
          ))}
        </ol>

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
              <p className="mt-1 text-xs text-slate-500">{ruleLine(item.rule)}</p>
            </div>
          ))}
        </div>

        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700">
            {ruleLine("TEMPERATURE")} — obligatoire pour :
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
          <p className="mt-2 text-xs text-slate-500">
            Sauf un aliment stable : un aliment réceptionné en conservation « Ambiant » (conserve, sec, UHT…)
            n&apos;a pas de température obligatoire.
          </p>
        </fieldset>

        <fieldset className="mt-5 rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-sm font-semibold text-slate-800">Contrôles complémentaires (hors bon)</legend>
          <p className="text-xs text-slate-500">
            Ajoutés par le laboratoire aux huit règles du bon, ils s&apos;affichent sous la checklist de chaque
            échantillon, codés C1 … C7.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {CONTROLS.map((item) => (
              <div key={item.key}>
                <label htmlFor={item.key} className="block text-sm font-medium text-slate-700">
                  {item.label}
                </label>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    id={item.key}
                    type="text"
                    inputMode={item.decimal ? "decimal" : "numeric"}
                    value={controls[item.key]}
                    onChange={(event) => setControls((current) => ({ ...current, [item.key]: event.target.value }))}
                    placeholder={item.nullable ? "Sans objet" : undefined}
                    className="input-field w-32 px-3"
                  />
                  <span className="text-sm text-slate-500">{item.unit}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">{item.hint}</p>
              </div>
            ))}
          </div>
          <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition hover:bg-slate-50">
            <input
              type="checkbox"
              checked={delayBlocking}
              onChange={(event) => setDelayBlocking(event.target.checked)}
              className="h-4 w-4 accent-brand"
            />
            Délai dépassé = non conforme (sinon à vérifier)
          </label>
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
