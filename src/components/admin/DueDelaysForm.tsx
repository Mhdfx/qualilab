"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Check } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { DUE_DAYS_MAX, DUE_DELAY_FIELDS, type DueDelays } from "@/lib/due-date";

type Draft = { dueDaysMicro: string; dueDaysChimie: string; dueDaysAutre: string; dueCalendarDays: boolean };

const toDraft = (delays: DueDelays): Draft => ({
  dueDaysMicro: delays.dueDaysMicro?.toString() ?? "",
  dueDaysChimie: delays.dueDaysChimie?.toString() ?? "",
  dueDaysAutre: delays.dueDaysAutre?.toString() ?? "",
  dueCalendarDays: delays.dueCalendarDays === true,
});

/**
 * « Délais de rendu par type d'analyse » (RETOUR-LABO-28-10.md K5, Q8 :
 * « avec vos délais, la date à rendre le se remplit seule et reste
 * modifiable »). The days, counted from the arrival, propose « Délai de
 * rendu promis » on the programme sheet; an empty delay proposes nothing.
 * The days shown first (5 and 7 working days) are an assumption until the
 * laboratory gives its own (R-18).
 */
export function DueDelaysForm({ initial }: { initial: DueDelays }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(toDraft(initial));
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
      const response = await fetch("/api/admin/due-delays", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<DueDelays> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setDraft(toDraft({ dueDaysMicro: data.dueDaysMicro ?? null, dueDaysChimie: data.dueDaysChimie ?? null, dueDaysAutre: data.dueDaysAutre ?? null, dueCalendarDays: data.dueCalendarDays ?? null }));
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
          <CalendarClock className="h-4 w-4 text-brand" aria-hidden="true" />
          Délais de rendu par type d&apos;analyse
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Comptés depuis l&apos;arrivée au laboratoire, ils proposent le « Délai de rendu promis » du programme d&apos;analyse, toujours
          modifiable. Vide : rien n&apos;est proposé. Les jours ouvrés vont du lundi au vendredi ; les jours fériés ne sont pas
          décomptés.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DUE_DELAY_FIELDS.map((field) => (
            <div key={field.key}>
              <label htmlFor={`due-${field.key}`} className="block text-sm font-medium text-slate-700">{field.label}</label>
              <div className="mt-1.5 flex items-center gap-2">
                <input
                  id={`due-${field.key}`}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={DUE_DAYS_MAX}
                  step={1}
                  value={draft[field.key]}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                  className="input-field w-24 px-3"
                />
                <span className="text-sm text-slate-600">jours</span>
              </div>
            </div>
          ))}
        </div>
        <fieldset className="mt-4">
          <legend className="text-sm font-medium text-slate-700">Jours comptés</legend>
          <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="radio" name="due-kind" checked={!draft.dueCalendarDays} onChange={() => setDraft({ ...draft, dueCalendarDays: false })} className="h-4 w-4 accent-brand" />
              Ouvrés
            </label>
            <label className="flex items-center gap-2">
              <input type="radio" name="due-kind" checked={draft.dueCalendarDays} onChange={() => setDraft({ ...draft, dueCalendarDays: true })} className="h-4 w-4 accent-brand" />
              Calendaires
            </label>
          </div>
        </fieldset>
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {saved && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Délais enregistrés — les prochains programmes les proposent.
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer les délais"}
        </button>
      </Card>
    </form>
  );
}
