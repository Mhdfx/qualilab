"use client";

import { Landmark } from "lucide-react";
import {
  ONSSA_CONTROL_MESSAGES,
  ONSSA_ORIGIN_SUGGESTIONS,
  ONSSA_TEXT_MAX,
  type OnssaDraft,
} from "@/lib/onssa-control";

/**
 * Lot 3E, N1 — « Contrôle officiel » / autocontrôle on a série, beside the
 * cadre (RETOUR-LABO-28-10.md §3.2, O-6): the box, then — for an official
 * control — the DR ONSSA / organisme préleveur agréé (required) and the
 * establishment; the origin of the products for both. Controlled: the visit,
 * the deposit and the correction panel hold the draft. Read by the ONSSA
 * monthly report only, printed nowhere — said under the box.
 */
export function OnssaControlFields({
  idPrefix,
  value,
  onChange,
  invalid = false,
  disabled = false,
  compact = false,
}: {
  idPrefix: string;
  value: OnssaDraft;
  onChange: (next: OnssaDraft) => void;
  /** The body is missing on an official control: the field is ringed and says so. */
  invalid?: boolean;
  disabled?: boolean;
  /** One column (a side panel) instead of two. */
  compact?: boolean;
}) {
  const set = (patch: Partial<OnssaDraft>) => onChange({ ...value, ...patch });
  const bodyMissing = invalid && value.controleOfficiel && !value.organismePreleveur.trim();
  const grid = compact ? "grid gap-3" : "grid gap-4 sm:grid-cols-2";
  const listId = `${idPrefix}-origines`;

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="section-title mb-2">
        <Landmark className="h-4 w-4" aria-hidden="true" />
        Rapport ONSSA
      </legend>
      <label
        className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm text-slate-700 ${
          value.controleOfficiel ? "border-brand bg-brand-light/40" : "border-slate-200"
        }`}
      >
        <input
          id={`${idPrefix}-officiel`}
          type="checkbox"
          checked={value.controleOfficiel}
          onChange={(e) => set({ controleOfficiel: e.target.checked })}
          aria-describedby={`${idPrefix}-officiel-aide`}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus-visible:ring-2 focus-visible:ring-brand"
        />
        <span>
          <span className="font-semibold">Contrôle officiel</span>
          <span id={`${idPrefix}-officiel-aide`} className="mt-0.5 block text-xs text-slate-500">
            Décoché : autocontrôle. Sert seulement au rapport mensuel ONSSA ; n&apos;est imprimé sur aucun document.
          </span>
        </span>
      </label>

      <div className={grid}>
        {value.controleOfficiel && (
          <>
            <div>
              <label htmlFor={`${idPrefix}-organisme`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                DR ONSSA / organisme préleveur agréé
                <span className="ml-0.5 text-rose-600" aria-hidden="true">*</span>
                <span className="sr-only">(obligatoire)</span>
              </label>
              <input
                id={`${idPrefix}-organisme`}
                type="text"
                value={value.organismePreleveur}
                maxLength={ONSSA_TEXT_MAX}
                onChange={(e) => set({ organismePreleveur: e.target.value })}
                placeholder="Ex. : DR ONSSA Casablanca-Settat"
                aria-invalid={bodyMissing || undefined}
                aria-describedby={bodyMissing ? `${idPrefix}-organisme-erreur` : undefined}
                className={`input-field px-4 ${bodyMissing ? "border-rose-300 ring-2 ring-rose-200" : ""}`}
              />
              {bodyMissing && (
                <p id={`${idPrefix}-organisme-erreur`} className="mt-1 text-xs text-rose-600">
                  {ONSSA_CONTROL_MESSAGES.bodyMissing}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${idPrefix}-etablissement`} className="mb-1.5 block text-sm font-semibold text-slate-700">
                Nom de l&apos;établissement (facultatif)
              </label>
              <input
                id={`${idPrefix}-etablissement`}
                type="text"
                value={value.etablissement}
                maxLength={ONSSA_TEXT_MAX}
                onChange={(e) => set({ etablissement: e.target.value })}
                aria-describedby={`${idPrefix}-etablissement-aide`}
                className="input-field px-4"
              />
              <p id={`${idPrefix}-etablissement-aide`} className="mt-1 text-xs text-slate-500">
                Vide : le rapport nomme le client et son site.
              </p>
            </div>
          </>
        )}
        <div>
          <label htmlFor={`${idPrefix}-origine`} className="mb-1.5 block text-sm font-semibold text-slate-700">
            Origine des produits (facultatif)
          </label>
          <input
            id={`${idPrefix}-origine`}
            type="text"
            list={listId}
            value={value.origine}
            maxLength={ONSSA_TEXT_MAX}
            onChange={(e) => set({ origine: e.target.value })}
            placeholder="Ex. : Local"
            className="input-field px-4"
          />
          <datalist id={listId}>
            {ONSSA_ORIGIN_SUGGESTIONS.map((origin) => (
              <option key={origin} value={origin} />
            ))}
          </datalist>
        </div>
      </div>
    </fieldset>
  );
}
