"use client";

import { Copy, ListChecks, Trash2 } from "lucide-react";
import type { LineKind } from "@/generated/prisma/enums";
import { HANDS_STATE_LABELS, LINE_KIND_LABELS, QUANTITY_UNIT_LABELS } from "@/lib/labels";
import { Card } from "@/components/ui/Card";
import { normalizeLabel } from "@/lib/serie-input";
import { MAX_UNITS } from "@/lib/series";
import {
  type LineDraft,
  type NatureOption,
  type ParameterOption,
  type ProductTypeOption,
  type ProfileOption,
} from "./visit-types";

type LineEditorProps = {
  index: number;
  line: LineDraft;
  natures: NatureOption[];
  parameters: ParameterOption[];
  parametersLoading: boolean;
  canRemove: boolean;
  onChange: (patch: Partial<LineDraft>) => void;
  onNatureChange: (natureId: string) => void;
  /** The type comes first; the form derives the nature from it (WORKFLOW.md §13). */
  onKindChange?: (kind: LineKind) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Datalist suggestions from this client's memory. */
  placeSuggestions: string[];
  productSuggestions: string[];
  /** The panels of this nature (client-specific first); empty = tick one by one. */
  profiles?: ProfileOption[];
  /** The catalogue's product types (the client's own first) — a food line picks one and inherits its germs and its n. */
  productTypes?: ProductTypeOption[];
};

const UNIT_CHOICES = [1, 3, 5, 9];
const KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];

/** The spelling the memory already knows for what was typed, when it differs. */
function knownTwin(value: string, suggestions: string[]) {
  const key = normalizeLabel(value);
  if (!key) return null;
  const twin = suggestions.find((s) => normalizeLabel(s) === key);
  return twin && twin !== value.trim() ? twin : null;
}

function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * One line of the protocol. The nature decides the fields — a chicken dish,
 * a cutting board and a chef's hands do not ask the same questions, and the
 * préleveur never sees a field the line does not need.
 */
export function LineEditor({
  index,
  line,
  natures,
  parameters,
  parametersLoading,
  canRemove,
  onChange,
  onNatureChange,
  onKindChange,
  onDuplicate,
  onRemove,
  placeSuggestions,
  productSuggestions,
  profiles = [],
  productTypes = [],
}: LineEditorProps) {
  const nature = natures.find((n) => n.id === line.natureId);
  const kind: LineKind = line.lineKind;
  const listId = `places-${line.key}`;
  const productListId = `products-${line.key}`;

  const micro = natures.filter((n) => n.family === "MICRO");
  const chimie = natures.filter((n) => n.family === "CHIMIE");
  const other = natures.filter((n) => n.family === "AUTRE");

  const placeTwin = knownTwin(line.lieu, placeSuggestions);
  const productTwin = knownTwin(line.produit, productSuggestions);

  function applyProfile(profile: ProfileOption) {
    onChange({
      parameterIds: profile.parameterIds.filter((id) => parameters.some((p) => p.id === id)),
      unitCount: profile.unitCount,
    });
  }

  const selectedType = productTypes.find((t) => t.id === line.productTypeId);
  const clientTypes = productTypes.filter((t) => t.clientId);
  const catalogueTypes = productTypes.filter((t) => !t.clientId);

  /**
   * Picking a type ADDS its germs to what is already ticked and raises n to
   * what its criteria need — never removes an analysis the préleveur asked
   * for. « Aucun » only detaches the type.
   */
  function applyProductType(id: string) {
    const type = productTypes.find((t) => t.id === id);
    if (!type) return onChange({ productTypeId: "" });
    const ids = type.parameterIds.filter((pid) => parameters.some((p) => p.id === pid));
    onChange({
      productTypeId: id,
      ...(ids.length > 0
        ? {
            parameterIds: [...new Set([...line.parameterIds, ...ids])],
            unitCount: Math.min(MAX_UNITS, Math.max(line.unitCount, type.unitCount)),
          }
        : {}),
    });
  }

  function isApplied(profile: ProfileOption) {
    const ids = profile.parameterIds.filter((id) => parameters.some((p) => p.id === id));
    return ids.length > 0 && ids.length === line.parameterIds.length && ids.every((id) => line.parameterIds.includes(id));
  }

  function toggleParameter(id: string) {
    onChange({
      parameterIds: line.parameterIds.includes(id)
        ? line.parameterIds.filter((p) => p !== id)
        : [...line.parameterIds, id],
    });
  }

  return (
    <Card className="p-4 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Ligne {index + 1}</p>
          <h3 className="text-base font-semibold text-slate-900">
            {nature ? nature.label : "Nature à choisir"}
          </h3>
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onDuplicate}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            aria-label={`Dupliquer la ligne ${index + 1}`}
            title="Dupliquer la ligne"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            disabled={!canRemove}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
            aria-label={`Supprimer la ligne ${index + 1}`}
            title="Supprimer la ligne"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700">Type de prélèvement</p>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => (onKindChange ? onKindChange(k) : onChange({ lineKind: k }))}
                aria-pressed={kind === k}
                className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition ${
                  kind === k
                    ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {LINE_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Nature d'analyse" required hint="Déduite du type ; modifiable.">
          <select
            value={line.natureId}
            onChange={(e) => onNatureChange(e.target.value)}
            className="input-field px-4"
          >
            <option value="">Choisir…</option>
            <optgroup label="Microbiologie">
              {micro.map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </optgroup>
            <optgroup label="Physico-chimie">
              {chimie.map((n) => (
                <option key={n.id} value={n.id}>{n.label}</option>
              ))}
            </optgroup>
            {other.length > 0 && (
              <optgroup label="Autres">
                {other.map((n) => (
                  <option key={n.id} value={n.id}>{n.label}</option>
                ))}
              </optgroup>
            )}
          </select>
        </Field>

        {kind === "SURFACE" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Surface prélevée" required>
              <input
                type="text"
                value={line.surfaceLabel}
                onChange={(e) => onChange({ surfaceLabel: e.target.value })}
                placeholder="Ex. : Planche verte, plan de travail"
                className="input-field px-4"
              />
            </Field>
            <Field label="Aire prélevée (cm²)">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                value={line.surfaceAreaCm2}
                onChange={(e) => onChange({ surfaceAreaCm2: e.target.value })}
                className="input-field px-4"
              />
            </Field>
          </div>
        )}

        {kind === "MAINS" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Personne prélevée" required>
              <input
                type="text"
                value={line.personName}
                onChange={(e) => onChange({ personName: e.target.value })}
                placeholder="Nom et prénom"
                className="input-field px-4"
              />
            </Field>
            <Field label="Fonction">
              <input
                type="text"
                value={line.personRole}
                onChange={(e) => onChange({ personRole: e.target.value })}
                placeholder="Ex. : Chef cuisine"
                className="input-field px-4"
              />
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-semibold text-slate-700">État des mains</p>
              <div className="flex flex-wrap gap-2">
                {(["LAVEES", "NON_LAVEES"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ handsState: line.handsState === s ? "" : s })}
                    aria-pressed={line.handsState === s}
                    className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition ${
                      line.handsState === s
                        ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {HANDS_STATE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {(kind === "ALIMENT" || kind === "EAU" || kind === "AIR" || kind === "AUTRE") && (
          <Field
            label={kind === "ALIMENT" ? "Désignation du produit" : kind === "EAU" ? "Désignation de l'eau" : "Désignation"}
            required={kind === "ALIMENT"}
          >
            <input
              type="text"
              list={productListId}
              value={line.produit}
              onChange={(e) => onChange({ produit: e.target.value })}
              placeholder={kind === "ALIMENT" ? "Ex. : Salade composée" : kind === "EAU" ? "Ex. : Eau du réseau — robinet cuisine" : "Ex. : Zone de conditionnement"}
              className="input-field px-4"
            />
            <datalist id={productListId}>
              {productSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {productTwin && (
              <p className="mt-1 text-xs text-amber-700">
                Déjà connu sous « {productTwin} » — cette orthographe sera utilisée.
              </p>
            )}
          </Field>
        )}

        {kind === "ALIMENT" && productTypes.length > 0 && (
          <Field
            label="Type de produit"
            hint={
              selectedType
                ? selectedType.criteriaCount > 0
                  ? `Le rapport interprétera ce produit selon ses ${selectedType.criteriaCount} critère${selectedType.criteriaCount > 1 ? "s" : ""} ; ses germes ont été ajoutés aux analyses ci-dessous.`
                  : "Aucun critère enregistré pour ce type : lecture en valeur simple."
                : "Le type de produit apporte les critères d'interprétation du rapport (facultatif)."
            }
          >
            <select
              value={line.productTypeId}
              onChange={(e) => applyProductType(e.target.value)}
              className="input-field px-4"
            >
              <option value="">— aucun —</option>
              {clientTypes.length > 0 && (
                <optgroup label="Types du client">
                  {clientTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Catalogue">
                {catalogueTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </optgroup>
            </select>
          </Field>
        )}

        {kind === "ALIMENT" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="N° du lot">
              <input
                type="text"
                value={line.numeroLot}
                onChange={(e) => onChange({ numeroLot: e.target.value })}
                placeholder="Facultatif"
                className="input-field px-4"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="DLC — production">
                <input
                  type="date"
                  value={line.productionDate}
                  onChange={(e) => onChange({ productionDate: e.target.value })}
                  className="input-field px-3"
                />
              </Field>
              <Field label="DLC — expiration">
                <input
                  type="date"
                  value={line.expiryDate}
                  onChange={(e) => onChange({ expiryDate: e.target.value })}
                  className="input-field px-3"
                />
              </Field>
            </div>
          </div>
        )}

        {(kind === "ALIMENT" || kind === "EAU" || kind === "AUTRE") && (
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <Field label="Quantité">
              <input
                type="text"
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) => onChange({ quantity: e.target.value })}
                placeholder="Ex. : 1"
                className="input-field px-4"
              />
            </Field>
            <Field label="Unité">
              <select
                value={line.quantityUnit}
                onChange={(e) => onChange({ quantityUnit: e.target.value as LineDraft["quantityUnit"] })}
                className="input-field px-3"
              >
                {(["UNITE", "G", "ML", "L"] as const).map((u) => (
                  <option key={u} value={u}>{QUANTITY_UNIT_LABELS[u]}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label="Lieu / section" required>
          <input
            type="text"
            list={listId}
            value={line.lieu}
            onChange={(e) => onChange({ lieu: e.target.value })}
            placeholder="Ex. : Poste salades, chambre froide 1"
            className="input-field px-4"
          />
          <datalist id={listId}>
            {placeSuggestions.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          {placeTwin && (
            <p className="mt-1 text-xs text-amber-700">
              Déjà connu sous « {placeTwin} » — cette orthographe sera utilisée.
            </p>
          )}
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={kind === "MAINS" || kind === "SURFACE" ? "T° relevée (°C)" : "T° produit (°C)"}>
            <input
              type="text"
              inputMode="decimal"
              value={line.productTemperature}
              onChange={(e) => onChange({ productTemperature: e.target.value })}
              placeholder="Ex. : 4"
              className="input-field px-4"
            />
          </Field>
          <Field label="T° ambiante (°C)">
            <input
              type="text"
              inputMode="decimal"
              value={line.ambientTemperature}
              onChange={(e) => onChange({ ambientTemperature: e.target.value })}
              placeholder="Ex. : 18"
              className="input-field px-4"
            />
          </Field>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-slate-700">Nombre d&apos;unités (n)</p>
          <div className="flex flex-wrap gap-2">
            {UNIT_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onChange({ unitCount: n })}
                aria-pressed={line.unitCount === n}
                className={`min-h-[40px] min-w-[52px] rounded-xl border px-3 text-sm font-semibold transition ${
                  line.unitCount === n
                    ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                    : "border-slate-200 text-slate-600 hover:border-slate-300"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label htmlFor={`n-${line.key}`} className="text-xs text-slate-500">
              ou saisir (1 à {MAX_UNITS}) :
            </label>
            <input
              id={`n-${line.key}`}
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_UNITS}
              value={line.unitCount}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= MAX_UNITS) onChange({ unitCount: n });
              }}
              className="input-field w-24 px-3"
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">5 pour la plupart des aliments, 9 pour l&apos;histamine.</p>
        </div>

        {profiles.length > 0 && parameters.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" />
              Profil d&apos;analyses
            </p>
            <div className="flex flex-wrap gap-2">
              {profiles.map((profile) => {
                const applied = isApplied(profile);
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => applyProfile(profile)}
                    aria-pressed={applied}
                    className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition ${
                      applied
                        ? "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20"
                        : "border-slate-200 text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {profile.name}
                    {profile.clientId ? " · contrat" : ""}
                    {profile.unitCount > 1 ? ` · n = ${profile.unitCount}` : ""}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">
            Analyses demandées <span className="text-rose-600">*</span>
          </p>
          {parametersLoading ? (
            <p className="text-sm text-slate-500">Chargement…</p>
          ) : parameters.length === 0 ? (
            <p className="text-sm text-slate-500">Choisissez d&apos;abord la nature.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {parameters.map((param) => {
                const checked = line.parameterIds.includes(param.id);
                return (
                  <label
                    key={param.id}
                    className={`flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all ${
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
          )}
        </div>

        <Field label="Remarques / composition">
          <input
            type="text"
            value={line.remarks}
            onChange={(e) => onChange({ remarks: e.target.value })}
            placeholder="Facultatif"
            className="input-field px-4"
          />
        </Field>
      </div>
    </Card>
  );
}
