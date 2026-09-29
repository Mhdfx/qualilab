"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Scale } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * The « Réglementation en vigueur » a product type prints on its reports
 * (RETOUR-LABO-29-09.md, slice C). Empty = the family's default of
 * /admin/reglages. Frozen into each report at approval, so editing it never
 * alters a report already issued.
 */
export function RegulationEditor({
  typeId,
  initial,
  familyDefault,
}: {
  typeId: string;
  initial: string | null;
  familyDefault: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(initial ?? "");
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
      const response = await fetch(`/api/product-types/${typeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regulation: text }),
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
    <Card className="mb-5 p-5">
      <form onSubmit={save} noValidate>
        <label htmlFor="pt-regulation" className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Scale className="h-4 w-4 text-brand" aria-hidden="true" />
          Réglementation en vigueur (rapport)
        </label>
        <p className="mt-1 text-sm text-slate-500">
          Imprimée en tête du tableau des critères de chaque rapport de ce type.
          {familyDefault
            ? " Laissée vide, celle de la famille s'applique :"
            : " Laissée vide, celle de la famille s'applique (Réglages — aucune n'est saisie pour l'instant)."}
        </p>
        {familyDefault && !text.trim() && (
          <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">{familyDefault}</p>
        )}
        <textarea
          id="pt-regulation"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          rows={2}
          maxLength={2000}
          className="input-field mt-3 resize-y px-3 py-2"
        />
        {error && (
          <p role="alert" className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            type="submit"
            disabled={saving || text.trim() === (initial ?? "")}
            className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved && <span role="status" className="text-sm text-emerald-700">Enregistré.</span>}
        </div>
      </form>
    </Card>
  );
}
