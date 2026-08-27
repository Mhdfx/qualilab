"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, SlidersHorizontal } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { LabSettings } from "@/lib/lab-settings";

/**
 * The two workflow decisions the client has not made yet (NEEDEDINFO §4).
 * Both behaviours are already built — each switch picks one, so the day the
 * laboratory answers, implementing it is a click on this screen.
 */

const SWITCHES: {
  key: keyof LabSettings;
  title: string;
  on: string;
  off: string;
}[] = [
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

export function LabSettingsForm({ initial }: { initial: LabSettings }) {
  const router = useRouter();
  const [values, setValues] = useState<LabSettings>(initial);
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
        body: JSON.stringify(values),
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
            <fieldset
              key={item.key}
              className="rounded-xl border border-slate-200 p-4"
            >
              <legend className="px-1 text-sm font-semibold text-slate-800">
                {item.title}
              </legend>
              {(
                [
                  { checked: false, label: item.off },
                  { checked: true, label: item.on },
                ] as const
              ).map((option) => (
                <label
                  key={String(option.checked)}
                  className={`mt-2 flex min-h-[44px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                    values[item.key] === option.checked
                      ? "border-brand bg-brand/5 text-slate-900"
                      : "border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="radio"
                    name={item.key}
                    checked={values[item.key] === option.checked}
                    onChange={() =>
                      setValues((current) => ({
                        ...current,
                        [item.key]: option.checked,
                      }))
                    }
                    className="mt-0.5 h-4 w-4 accent-brand"
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </fieldset>
          ))}
        </div>

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
