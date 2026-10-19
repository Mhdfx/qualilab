"use client";

import { useState } from "react";
import { Copy, FlaskConical, ListChecks, Search, Trash2 } from "lucide-react";
import type { LineKind, QuantityUnit } from "@/generated/prisma/enums";
import {
  AIR_METHOD_CHOICES,
  AIR_METHOD_LABELS,
  ANALYSIS_FAMILY_LABELS,
  HANDS_STATE_LABELS,
  LINE_KIND_LABELS,
  QUANTITY_UNIT_LABELS,
  SURFACE_AREA_CHOICES,
  SURFACE_STATE_CHOICES,
  SURFACE_STATE_LABELS,
} from "@/lib/labels";
import { LINE_FAMILIES } from "@/lib/nature-family";
import { parameterCaption } from "@/lib/parameter-caption";
import { Card } from "@/components/ui/Card";
import { normalizeLabel } from "@/lib/serie-input";
import { matchesQuery, similarLabels } from "@/lib/similar";
import { MAX_UNITS } from "@/lib/series";
import {
  applyProfilePatch,
  familiesPatch,
  familyStatus,
  isProfileApplied,
  kindPatch,
  lineFamilies,
  lineNatureIds,
  parameterFamily,
  profileParameterIds,
  surfaceAreaChoice,
  visibleParameters,
  type LineDraft,
  type LineFamily,
  type NatureOption,
  type ParameterOption,
  type ProductTypeOption,
  type ProfileOption,
} from "./visit-types";

type LineEditorProps = {
  index: number;
  line: LineDraft;
  /** The catalogue's active natures (`GET /api/natures`): they decide which
   *  of the two boxes a type can tick, and the derived `natureId`. */
  natures: NatureOption[];
  /** The analyses of the line's category (`lineCategory`), with their family. */
  parameters: ParameterOption[];
  parametersLoading: boolean;
  canRemove: boolean;
  /** Every edit, as a patch. Type and box changes arrive already consistent
   *  (derived `natureId`, boxes, analyses — see `kindPatch` / `familiesPatch`). */
  onChange: (patch: Partial<LineDraft>) => void;
  /** Optional: receives a type change INSTEAD of `onChange`, with the patch
   *  to apply — for a form that must load the new category's analyses. */
  onKindChange?: (kind: LineKind, patch: Partial<LineDraft>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Datalist suggestions from this client's memory. */
  placeSuggestions: string[];
  productSuggestions: string[];
  /** The client's memory alone (saved spellings) — what the corrector
   *  compares a typed value against; another line's typo never counts. */
  knownPlaces?: string[];
  knownProducts?: string[];
  /** The panels proposed in one tap (client-specific first). Pass them all:
   *  the editor keeps those of the ticked boxes' natures that have an
   *  analysis to show. */
  profiles?: ProfileOption[];
  /** The « Profil d'analyses » block. Default true; the préleveur's visit
   *  passes false (RETOUR-LABO-06-10.md §8.3) — the profiles stay on the
   *  programme sheet and at the counter. */
  showProfiles?: boolean;
  /** The catalogue's product types (the client's own first). The selector
   *  appears on a food sample only when this list is not empty — the
   *  counter passes it, the préleveur's visit does not (V6). */
  productTypes?: ProductTypeOption[];
  /** The unit a sample leaving « Eau » (litres) falls back to: « UNITE » on
   *  a visit (default), « G » at the counter. */
  quantityUnitFallback?: QuantityUnit;
  /**
   * One container per family (the laboratory's answer of 12/10): passed by
   * the counter on a line that becomes two samples. The quantity block then
   * weighs each family's part — the line's own field becomes « Quantité 2M »,
   * this one « Quantité 2P ». Absent (the préleveur's visit, a one-family
   * line): one quantity for the line.
   */
  chimieQuantity?: {
    /** The two samples' references, « 2M » / « 2P » (`lineSampleRefs`). */
    refs: { micro: string; chimie: string };
    value: string;
    unit: QuantityUnit;
    onChange: (patch: { value?: string; unit?: QuantityUnit }) => void;
  };
};

const UNIT_CHOICES = [1, 3, 5, 9];
const KINDS: LineKind[] = ["ALIMENT", "SURFACE", "MAINS", "EAU", "AIR", "AUTRE"];
const HANDS_STATE_CHOICES = ["LAVEES", "NON_LAVEES"] as const;

/** The families as the card's subtitle says them. */
const FAMILY_SHORT: Record<LineFamily, string> = {
  MICRO: "microbiologie",
  CHIMIE: "physico-chimie",
};

const CHIP_ON = "border-brand bg-brand-light/60 text-brand ring-1 ring-brand/20";
const CHIP_OFF = "border-slate-200 text-slate-600 hover:border-slate-300";

/** The spelling the memory already knows for what was typed, when it differs. */
function knownTwin(value: string, suggestions: string[]) {
  const key = normalizeLabel(value);
  if (!key) return null;
  const twin = suggestions.find((s) => normalizeLabel(s) === key);
  return twin && twin !== value.trim() ? twin : null;
}

function Field({
  label,
  htmlFor,
  required,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** A quantity and its unit, side by side. */
function QuantityFields({
  label,
  unitLabel,
  inputId,
  unitId,
  value,
  unit,
  onValue,
  onUnit,
  describedBy,
}: {
  label: string;
  unitLabel: string;
  inputId: string;
  unitId: string;
  value: string;
  unit: QuantityUnit;
  onValue: (value: string) => void;
  onUnit: (unit: QuantityUnit) => void;
  describedBy?: string;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3">
      <Field label={label} htmlFor={inputId}>
        <input
          id={inputId}
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onValue(e.target.value)}
          aria-describedby={describedBy}
          placeholder="Ex. : 1"
          className="input-field px-4"
        />
      </Field>
      <Field label={unitLabel} htmlFor={unitId}>
        <select id={unitId} value={unit} onChange={(e) => onUnit(e.target.value as QuantityUnit)} className="input-field px-3">
          {(["UNITE", "G", "ML", "L"] as const).map((u) => (
            <option key={u} value={u}>{QUANTITY_UNIT_LABELS[u]}</option>
          ))}
        </select>
      </Field>
    </div>
  );
}

/** A row of toggle chips (« État des mains », « État de la surface »…): one
 *  choice, a second tap clears it. */
function ChoiceChips<T extends string>({
  id,
  label,
  required,
  choices,
  labels,
  value,
  onPick,
}: {
  id: string;
  label: string;
  required?: boolean;
  choices: readonly T[];
  labels: Record<T, string>;
  value: T | "";
  onPick: (value: T | "") => void;
}) {
  return (
    <div role="group" aria-labelledby={id}>
      <p id={id} className="mb-1.5 text-sm font-semibold text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </p>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice}
            type="button"
            onClick={() => onPick(value === choice ? "" : choice)}
            aria-pressed={value === choice}
            className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              value === choice ? CHIP_ON : CHIP_OFF
            }`}
          >
            {labels[choice]}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * One sample of the protocol (« Échantillon N »). The type decides the
 * fields — a chicken dish, a cutting board and a chef's hands do not ask the
 * same questions, and the préleveur never sees a field the sample does not
 * need. The nature is never picked: it follows the type × the ticked
 * « Analyses à effectuer » boxes (RETOUR-LABO-06-10.md §5, V3).
 */
export function LineEditor({
  index,
  line,
  natures,
  parameters,
  parametersLoading,
  canRemove,
  onChange,
  onKindChange,
  onDuplicate,
  onRemove,
  placeSuggestions,
  productSuggestions,
  knownPlaces = [],
  knownProducts = [],
  profiles = [],
  showProfiles = true,
  productTypes = [],
  quantityUnitFallback = "UNITE",
  chimieQuantity,
}: LineEditorProps) {
  const kind: LineKind = line.lineKind;
  const number = index + 1;
  const id = (field: string) => `${field}-${line.key}`;
  const listId = id("places");
  const productListId = id("products");

  const ticked = lineFamilies(line);
  const shown = visibleParameters(parameters, ticked);
  const natureIds = lineNatureIds(natures, line);
  const lineProfiles = showProfiles
    ? profiles.filter((p) => natureIds.includes(p.natureId) && profileParameterIds(p, parameters, ticked).length > 0)
    : [];

  // The quick choice the typed area equals, if any — its chip is pressed.
  const pickedArea = surfaceAreaChoice(line.surfaceAreaCm2);

  const placeTwin = knownTwin(line.lieu, placeSuggestions);
  const productTwin = knownTwin(line.produit, productSuggestions);
  // « Vouliez-vous dire … ? » — only when the exact rewrite has nothing.
  const placeNear = placeTwin ? [] : similarLabels(line.lieu, knownPlaces);
  const productNear = productTwin ? [] : similarLabels(line.produit, knownProducts);
  const [typeQuery, setTypeQuery] = useState("");

  function changeKind(next: LineKind) {
    if (next === kind) return;
    const patch = kindPatch(natures, line, next, { parameters, fallbackUnit: quantityUnitFallback });
    if (onKindChange) onKindChange(next, patch);
    else onChange(patch);
  }

  function toggleFamily(family: LineFamily) {
    const next = ticked.includes(family) ? ticked.filter((f) => f !== family) : [...ticked, family];
    onChange(familiesPatch(natures, line, next, parameters));
  }

  const selectedType = productTypes.find((t) => t.id === line.productTypeId);
  const visibleTypes = productTypes.filter((t) => t.id === line.productTypeId || matchesQuery(t.name, typeQuery));
  const clientTypes = visibleTypes.filter((t) => t.clientId);
  const catalogueTypes = visibleTypes.filter((t) => !t.clientId);

  /**
   * Picking a type ADDS its germs (those of a ticked box) to what is already
   * ticked and raises n to what its criteria need — never removes an
   * analysis the préleveur asked for. « Aucun » only detaches the type.
   */
  function applyProductType(typeId: string) {
    const type = productTypes.find((t) => t.id === typeId);
    if (!type) return onChange({ productTypeId: "" });
    const ids = type.parameterIds.filter((pid) => shown.some((p) => p.id === pid));
    onChange({
      productTypeId: typeId,
      ...(ids.length > 0
        ? {
            parameterIds: [...new Set([...line.parameterIds, ...ids])],
            unitCount: Math.min(MAX_UNITS, Math.max(line.unitCount, type.unitCount)),
          }
        : {}),
    });
  }

  function toggleParameter(parameterId: string) {
    onChange({
      parameterIds: line.parameterIds.includes(parameterId)
        ? line.parameterIds.filter((p) => p !== parameterId)
        : [...line.parameterIds, parameterId],
    });
  }

  const subtitle = `${LINE_KIND_LABELS[kind]} — ${
    ticked.length > 0 ? ticked.map((f) => FAMILY_SHORT[f]).join(" et ") : "aucune analyse cochée"
  }`;

  return (
    <Card className="p-4 sm:p-6">
      <div role="group" aria-labelledby={id("title")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id={id("title")} className="text-base font-semibold text-slate-900">
              Échantillon {number}
            </h3>
            <p className={`text-sm ${ticked.length > 0 ? "text-slate-500" : "text-amber-700"}`}>{subtitle}</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onDuplicate}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              aria-label={`Dupliquer l'échantillon ${number}`}
              title={`Dupliquer l'échantillon ${number}`}
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              disabled={!canRemove}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-500"
              aria-label={`Supprimer l'échantillon ${number}`}
              title={`Supprimer l'échantillon ${number}`}
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="space-y-4">
          <div role="group" aria-labelledby={id("kind")}>
            <p id={id("kind")} className="mb-1.5 text-sm font-semibold text-slate-700">
              Type de prélèvement
            </p>
            <div className="flex flex-wrap gap-2">
              {KINDS.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => changeKind(k)}
                  aria-pressed={kind === k}
                  className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    kind === k ? CHIP_ON : CHIP_OFF
                  }`}
                >
                  {LINE_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          </div>

          {/* Surface : ce qui est prélevé, son état, l'aire (V2). Ces champs
              ne s'affichent plus sur les autres types. */}
          {kind === "SURFACE" && (
            <>
              <Field label="Désignation" htmlFor={id("surface")} required>
                <input
                  id={id("surface")}
                  type="text"
                  value={line.surfaceLabel}
                  onChange={(e) => onChange({ surfaceLabel: e.target.value })}
                  placeholder="Ex. : Planche verte, plan de travail"
                  className="input-field px-4"
                />
              </Field>
              <ChoiceChips
                id={id("surface-state")}
                label="État de la surface"
                required
                choices={SURFACE_STATE_CHOICES}
                labels={SURFACE_STATE_LABELS}
                value={line.surfaceState}
                onPick={(surfaceState) => onChange({ surfaceState })}
              />
              {/* L'aire : les deux valeurs d'usage en un geste (« 100 cm² »,
                  « 1000 cm² » — retour du 14/10), le champ pour toute autre. */}
              <div role="group" aria-labelledby={id("area")}>
                <p id={id("area")} className="mb-1.5 text-sm font-semibold text-slate-700">
                  Surface prélevée (cm²)
                </p>
                <div className="flex flex-wrap gap-2">
                  {SURFACE_AREA_CHOICES.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => onChange({ surfaceAreaCm2: String(area) })}
                      aria-pressed={pickedArea === area}
                      className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                        pickedArea === area ? CHIP_ON : CHIP_OFF
                      }`}
                    >
                      {`${area} cm²`}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <label htmlFor={id("area-other")} className="text-xs text-slate-500">
                    ou saisir une autre valeur :
                  </label>
                  <input
                    id={id("area-other")}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={line.surfaceAreaCm2}
                    onChange={(e) => onChange({ surfaceAreaCm2: e.target.value })}
                    placeholder="100"
                    className="input-field w-28 px-3"
                  />
                </div>
              </div>
            </>
          )}

          {/* Mains : la personne et l'état de ses mains. La fonction n'est
              plus demandée (Q111, 16/10) : les fiches déjà saisies la gardent. */}
          {kind === "MAINS" && (
            <>
              <Field label="Personne prélevée" htmlFor={id("person")} required>
                <input
                  id={id("person")}
                  type="text"
                  value={line.personName}
                  onChange={(e) => onChange({ personName: e.target.value })}
                  placeholder="Nom et prénom"
                  className="input-field px-4"
                />
              </Field>
              <ChoiceChips
                id={id("hands")}
                label="État des mains"
                choices={HANDS_STATE_CHOICES}
                labels={HANDS_STATE_LABELS}
                value={line.handsState}
                onPick={(handsState) => onChange({ handsState })}
              />
            </>
          )}

          {(kind === "ALIMENT" || kind === "EAU" || kind === "AIR" || kind === "AUTRE") && (
            <Field
              label={kind === "ALIMENT" ? "Désignation du produit" : kind === "EAU" ? "Désignation de l'eau" : "Désignation"}
              htmlFor={id("produit")}
              required={kind === "ALIMENT"}
            >
              <input
                id={id("produit")}
                type="text"
                list={productListId}
                value={line.produit}
                onChange={(e) => onChange({ produit: e.target.value })}
                placeholder={
                  kind === "ALIMENT"
                    ? "Ex. : Salade composée"
                    : kind === "EAU"
                      ? "Ex. : Eau du réseau — robinet cuisine"
                      : "Ex. : Zone de conditionnement"
                }
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
              <DidYouMean options={productNear} onPick={(v) => onChange({ produit: v })} />
            </Field>
          )}

          {kind === "AIR" && (
            <ChoiceChips
              id={id("air-method")}
              label="Méthode de prélèvement"
              required
              choices={AIR_METHOD_CHOICES}
              labels={AIR_METHOD_LABELS}
              value={line.airMethod}
              onPick={(airMethod) => onChange({ airMethod })}
            />
          )}

          {kind === "ALIMENT" && productTypes.length > 0 && (
            <Field
              label="Type de produit"
              htmlFor={id("product-type")}
              hint={
                selectedType
                  ? selectedType.criteriaCount > 0
                    ? `Le rapport interprétera ce produit selon ses ${selectedType.criteriaCount} critère${selectedType.criteriaCount > 1 ? "s" : ""} ; ses germes ont été ajoutés aux analyses ci-dessous.`
                    : "Aucun critère enregistré pour ce type : lecture en valeur simple."
                  : "Le type de produit apporte les critères d'interprétation du rapport (facultatif)."
              }
            >
              <div className="relative mb-2">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input
                  type="search"
                  value={typeQuery}
                  onChange={(e) => setTypeQuery(e.target.value)}
                  placeholder="Rechercher un type (ex. : salade, charcuterie)"
                  aria-label="Rechercher un type de produit"
                  className="input-field pl-9 pr-4"
                />
              </div>
              {typeQuery && visibleTypes.length === 0 && (
                <p className="mb-2 text-xs text-slate-500">Aucun type ne correspond à « {typeQuery} ».</p>
              )}
              <select
                id={id("product-type")}
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
              <Field label="N° du lot" htmlFor={id("lot")}>
                <input
                  id={id("lot")}
                  type="text"
                  value={line.numeroLot}
                  onChange={(e) => onChange({ numeroLot: e.target.value })}
                  placeholder="Facultatif"
                  className="input-field px-4"
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="DLC — production" htmlFor={id("production")}>
                  <input
                    id={id("production")}
                    type="date"
                    value={line.productionDate}
                    onChange={(e) => onChange({ productionDate: e.target.value })}
                    className="input-field px-3"
                  />
                </Field>
                <Field label="DLC — expiration" htmlFor={id("expiry")}>
                  <input
                    id={id("expiry")}
                    type="date"
                    value={line.expiryDate}
                    onChange={(e) => onChange({ expiryDate: e.target.value })}
                    className="input-field px-3"
                  />
                </Field>
              </div>
            </div>
          )}

          {(kind === "ALIMENT" || kind === "EAU" || kind === "AUTRE") &&
            (chimieQuantity ? (
              // One container per family (12/10): each part weighed apart.
              <div className="space-y-3">
                <QuantityFields
                  label={`Quantité ${chimieQuantity.refs.micro}`}
                  unitLabel={`Unité ${chimieQuantity.refs.micro}`}
                  inputId={id("quantity")}
                  unitId={id("unit")}
                  value={line.quantity}
                  unit={line.quantityUnit}
                  onValue={(quantity) => onChange({ quantity })}
                  onUnit={(quantityUnit) => onChange({ quantityUnit })}
                  describedBy={id("quantity-hint")}
                />
                <QuantityFields
                  label={`Quantité ${chimieQuantity.refs.chimie}`}
                  unitLabel={`Unité ${chimieQuantity.refs.chimie}`}
                  inputId={id("quantity-chimie")}
                  unitId={id("unit-chimie")}
                  value={chimieQuantity.value}
                  unit={chimieQuantity.unit}
                  onValue={(value) => chimieQuantity.onChange({ value })}
                  onUnit={(unit) => chimieQuantity.onChange({ unit })}
                  describedBy={id("quantity-hint")}
                />
                <p id={id("quantity-hint")} className="text-xs text-slate-500">
                  Un contenant par famille : pesez la part de chaque famille.
                </p>
              </div>
            ) : (
              <QuantityFields
                label="Quantité"
                unitLabel="Unité"
                inputId={id("quantity")}
                unitId={id("unit")}
                value={line.quantity}
                unit={line.quantityUnit}
                onValue={(quantity) => onChange({ quantity })}
                onUnit={(quantityUnit) => onChange({ quantityUnit })}
              />
            ))}

          <Field label="Lieu / section" htmlFor={id("lieu")} required>
            <input
              id={id("lieu")}
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
            <DidYouMean options={placeNear} onPick={(v) => onChange({ lieu: v })} />
          </Field>

          {/* « Température au prélèvement » sur tous les types, le mot du
              laboratoire (Q112, 16/10) ; le protocole garde « T°p / T°a ».
              L'air n'en a pas (§8.5) : la T° ambiante seule. Les champs
              s'alignent par le bas quand le libellé passe sur deux lignes. */}
          <div className={kind === "AIR" ? "grid grid-cols-1 gap-3 sm:grid-cols-2" : "grid grid-cols-2 items-end gap-3"}>
            {kind !== "AIR" && (
              <Field label="Température au prélèvement (°C)" htmlFor={id("product-temperature")}>
                <input
                  id={id("product-temperature")}
                  type="text"
                  inputMode="decimal"
                  value={line.productTemperature}
                  onChange={(e) => onChange({ productTemperature: e.target.value })}
                  placeholder="Ex. : 4"
                  className="input-field px-4"
                />
              </Field>
            )}
            <Field label="T° ambiante (°C)" htmlFor={id("ambient-temperature")}>
              <input
                id={id("ambient-temperature")}
                type="text"
                inputMode="decimal"
                value={line.ambientTemperature}
                onChange={(e) => onChange({ ambientTemperature: e.target.value })}
                placeholder="Ex. : 18"
                className="input-field px-4"
              />
            </Field>
          </div>

          <div role="group" aria-labelledby={id("units")}>
            <p id={id("units")} className="mb-1.5 text-sm font-semibold text-slate-700">
              Nombre d&apos;unités (n)
            </p>
            <div className="flex flex-wrap gap-2">
              {UNIT_CHOICES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onChange({ unitCount: n })}
                  aria-pressed={line.unitCount === n}
                  className={`min-h-[40px] min-w-[52px] rounded-xl border px-3 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                    line.unitCount === n ? CHIP_ON : CHIP_OFF
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <label htmlFor={id("n")} className="text-xs text-slate-500">
                ou saisir le nombre :
              </label>
              <input
                id={id("n")}
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
            {kind === "ALIMENT" && (
              <p className="mt-1 text-xs text-slate-500">5 pour la plupart des aliments, 9 pour l&apos;histamine.</p>
            )}
          </div>

          {/* Les deux cases de l'échantillon (V3) : la nature en est déduite,
              les deux cochées donnent deux échantillons au même numéro. */}
          <fieldset className="border-t border-slate-100 pt-4">
            <legend className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <FlaskConical className="h-4 w-4 text-brand" aria-hidden="true" />
              Analyses à effectuer
              <span className="text-rose-600">*</span>
            </legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {LINE_FAMILIES.map((family) => {
                const status = familyStatus(natures, kind, family);
                const checked = ticked.includes(family);
                // A ticked box always stays untickable, even if no longer allowed.
                const disabled = status !== "OK" && !checked;
                const hintId = id(`family-${family}-hint`);
                return (
                  <label
                    key={family}
                    className={`flex min-h-[44px] items-start gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all ${
                      disabled
                        ? "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400"
                        : checked
                          ? "cursor-pointer border-brand/40 bg-brand-light/60 font-medium text-brand shadow-sm ring-1 ring-brand/10"
                          : "cursor-pointer border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggleFamily(family)}
                      aria-describedby={status !== "OK" ? hintId : undefined}
                      className="accent-brand mt-0.5 h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="block">{ANALYSIS_FAMILY_LABELS[family]}</span>
                      {status !== "OK" && (
                        <span id={hintId} className="block text-xs font-normal text-slate-500">
                          {status === "NOT_FOR_KIND" ? "Non proposées pour ce type" : "Absentes du catalogue"}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            {ticked.length === 0 && (
              <p className="mt-1.5 text-xs text-rose-600">Cochez au moins une famille d&apos;analyses.</p>
            )}
          </fieldset>

          {lineProfiles.length > 0 && (
            <div role="group" aria-labelledby={id("profiles")}>
              <p id={id("profiles")} className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
                <ListChecks className="h-4 w-4 text-brand" aria-hidden="true" />
                Profil d&apos;analyses
              </p>
              <div className="flex flex-wrap gap-2">
                {lineProfiles.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => onChange(applyProfilePatch(line, profile, parameters))}
                    aria-pressed={isProfileApplied(line, profile, parameters)}
                    className={`min-h-[40px] rounded-xl border px-4 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                      isProfileApplied(line, profile, parameters) ? CHIP_ON : CHIP_OFF
                    }`}
                  >
                    {profile.name}
                    {profile.clientId ? " · contrat" : ""}
                    {profile.unitCount > 1 ? ` · n = ${profile.unitCount}` : ""}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-sm font-semibold text-slate-700">Analyses demandées</p>
            <p className="mb-2 text-xs text-slate-500">
              Facultatif — le responsable des paramètres complète le programme.
            </p>
            {ticked.length === 0 ? (
              <p className="text-sm text-slate-500">Cochez d&apos;abord une famille d&apos;analyses.</p>
            ) : parametersLoading ? (
              <p className="text-sm text-slate-500">Chargement…</p>
            ) : (
              <div className="space-y-3">
                {ticked.map((family) => {
                  const list = shown.filter((p) => parameterFamily(p) === family);
                  return (
                    <div key={family} role="group" aria-labelledby={id(`analyses-${family}`)}>
                      <p
                        id={id(`analyses-${family}`)}
                        className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
                      >
                        {ANALYSIS_FAMILY_LABELS[family]}
                      </p>
                      {list.length === 0 ? (
                        <p className="text-sm text-slate-500">
                          Aucune analyse de cette famille au catalogue pour ce type : le laboratoire la fixera.
                        </p>
                      ) : (
                        <div className="grid gap-2 sm:grid-cols-2">
                          {list.map((param) => {
                            const checked = line.parameterIds.includes(param.id);
                            // « Norme en vigueur · unité » under the name, when known (14/10).
                            const caption = parameterCaption(param);
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
                                  className="accent-brand h-4 w-4 shrink-0"
                                />
                                <span className="min-w-0">
                                  <span className="block">{param.name}</span>
                                  {caption && <span className="block text-xs text-slate-600">{caption}</span>}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <Field label="Remarques / composition" htmlFor={id("remarks")}>
            <input
              id={id("remarks")}
              type="text"
              value={line.remarks}
              onChange={(e) => onChange({ remarks: e.target.value })}
              placeholder="Facultatif"
              className="input-field px-4"
            />
          </Field>
        </div>
      </div>
    </Card>
  );
}

/** « Vouliez-vous dire … ? » — one click replaces what was typed. */
function DidYouMean({ options, onPick }: { options: string[]; onPick: (value: string) => void }) {
  if (options.length === 0) return null;
  return (
    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-amber-800">
      <span>Vouliez-vous dire</span>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onPick(option)}
          className="rounded-md bg-amber-100 px-2 py-0.5 font-semibold text-amber-900 transition hover:bg-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          {option}
        </button>
      ))}
      <span>?</span>
    </p>
  );
}
