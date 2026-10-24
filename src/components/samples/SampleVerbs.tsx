"use client";

import { CORRECTION_MESSAGES, correctionLabel, verbsFor, type CorrectionRights } from "@/lib/sample-verbs";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Pencil, RotateCcw, X } from "lucide-react";
import type { CancelReason, Family, QuantityUnit } from "@/generated/prisma/enums";
import type { Role } from "@/lib/roles";
import {
  AIR_EXPOSURE_MINUTES,
  AIR_METHOD_CHOICES,
  AIR_METHOD_LABELS,
  ANALYSIS_FAMILY_LABELS,
  CANCEL_REASON_LABELS,
  HANDS_STATE_CHOICES,
  HANDS_STATE_LABELS,
  QUANTITY_UNIT_LABELS,
  SURFACE_AREA_CHOICES,
  SURFACE_STATE_CHOICES,
  SURFACE_STATE_LABELS,
  isExposedPlate,
} from "@/lib/labels";
import { surfaceAreaChoice } from "@/components/preleveur/visit-types";
import { notReceivedNoticeText } from "@/lib/not-received";
import {
  analysesNotice,
  billedCorrectionWarning,
  cancelConsequences,
  cancelReasonsFor,
  correctionBody,
  correctionFields,
  correctionValues,
  type CorrectionValues,
  type VerbSample,
} from "./sample-verbs-logic";

export type { CorrectionValues, VerbSample };

/**
 * The correction verbs of a sample (WORKFLOW.md §8), each with a reason and
 * an audit line: « Corriger la fiche » until approval, « Annuler » with a
 * coded motif, « Réactiver » for an admin. The state machine decides which
 * one a role sees; the API checks again.
 *
 * « Corriger la fiche » shows the fields of the sample's kind only
 * (RETOUR-LABO-06-10.md §5, V2 and V4): a surface sample its
 * « Désignation », « État de la surface » and « Surface prélevée (cm²) »
 * (with « Autre », 16/10), an air sample its « Méthode de prélèvement » and
 * the plate's duration, a hands sample its state (16/10). The two
 * temperatures on every kind — the air its ambient one only (P9, 16/10). A
 * field the dialog does not show is not sent, so an old value of another
 * kind is never emptied.
 *
 * Who changes what (16/10, Q128 — `correctionRights`): the dialog shows the
 * halves this person may change and sends nothing else. The reception, the
 * validateur and the Direction correct the identification, and the
 * analyses — their list, the product type, the number of units — only
 * before the programme; once the bench has started, the responsable des
 * paramètres changes the analyses only (« Corriger les analyses »); the
 * administrator both, until the approval. A withdrawal keeps the other
 * results (Q91 — `analysesNotice` says what the change will do).
 */

const UNITS = Object.keys(QUANTITY_UNIT_LABELS) as QuantityUnit[];
const UNIT_CHOICES = [1, 3, 5, 9];
const FAMILY_ORDER: Family[] = ["MICRO", "CHIMIE", "AUTRE"];

/** A parameter offered by the dialog, as `GET /api/parameters` serves it. */
type ParameterOption = { id: string; name: string; family?: Family | null };

const CHOICE = "min-h-[36px] rounded-lg border px-3 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand";
const choice = (active: boolean) =>
  `${CHOICE} ${active ? "border-brand bg-brand-light/60 text-brand" : "border-slate-200 text-slate-600 hover:border-slate-300"}`;

export { verbsFor };

export function SampleVerbs({
  sample,
  role,
  compact = false,
  onChanged,
}: {
  sample: VerbSample;
  role: Role;
  compact?: boolean;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<"correct" | "cancel" | "reactivate" | null>(null);
  const verbs = verbsFor(sample, role);
  const scope: CorrectionRights = { identification: verbs.correct, analyses: verbs.correctAnalyses };
  const correctLabel = correctionLabel(scope);
  if (!verbs.correct && !verbs.correctAnalyses && !verbs.cancel && !verbs.reactivate) return null;

  function done() {
    setOpen(null);
    if (onChanged) onChanged();
    else router.refresh();
  }

  const button = (label: string, icon: React.ReactNode, onClick: () => void, tone: "neutral" | "danger" = "neutral") => (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
        tone === "danger" ? "text-rose-700 hover:bg-rose-50" : "text-slate-600 hover:bg-slate-100 hover:text-brand"
      }`}
    >
      {icon}
      {compact ? null : label}
      {compact && <span className="sr-only">{label}</span>}
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {(verbs.correct || verbs.correctAnalyses) &&
        button(correctLabel, <Pencil className="h-3.5 w-3.5" aria-hidden="true" />, () => setOpen("correct"))}
      {verbs.cancel && button("Annuler", <Ban className="h-3.5 w-3.5" aria-hidden="true" />, () => setOpen("cancel"), "danger")}
      {verbs.reactivate && button("Réactiver", <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />, () => setOpen("reactivate"))}

      {open === "correct" && (
        <CorrectDialog sample={sample} scope={scope} title={correctLabel} onClose={() => setOpen(null)} onDone={done} />
      )}
      {open === "cancel" && <CancelDialog sample={sample} onClose={() => setOpen(null)} onDone={done} />}
      {open === "reactivate" && <ReactivateDialog sample={sample} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  );
}

/** The star for the eye, « (obligatoire) » for a screen reader. */
function RequiredMark() {
  return (
    <>
      <span aria-hidden="true">*</span>
      <span className="sr-only">(obligatoire)</span>
    </>
  );
}

function Dialog({
  title,
  children,
  onClose,
  describedBy,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  /** The id of the text that says what the dialog is about, read with its title. */
  describedBy?: string;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      aria-describedby={describedBy}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Actions({ busy, label, onClose, danger }: { busy: boolean; label: string; onClose: () => void; danger?: boolean }) {
  return (
    <div className="mt-4 flex gap-2">
      <button
        type="submit"
        disabled={busy}
        className={`inline-flex min-h-[42px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white transition disabled:opacity-50 ${
          danger ? "bg-rose-600 hover:bg-rose-700" : "bg-brand hover:bg-brand-dark"
        }`}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {busy ? "Enregistrement…" : label}
      </button>
      <button type="button" onClick={onClose} className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Fermer
      </button>
    </div>
  );
}

async function send(url: string, method: string, body: unknown) {
  const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error ?? "Enregistrement impossible.");
  return data;
}

function CorrectDialog({
  sample,
  scope,
  title,
  onClose,
  onDone,
}: {
  sample: VerbSample;
  /** The halves of the fiche this person may change (`correctionRights`). */
  scope: CorrectionRights;
  title: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const kind = sample.lineKind;
  const [values, setValues] = useState<CorrectionValues>(() => correctionValues(sample));
  const [parameterIds, setParameterIds] = useState<string[]>(sample.parameterIds);
  const [productTypes, setProductTypes] = useState<{ id: string; name: string; clientId: string | null; unitCount: number }[]>([]);
  const [options, setOptions] = useState<ParameterOption[] | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Saved on a sample an invoice holds: what to tell the accountant, before the dialog closes.
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!scope.analyses) return;
    let cancelled = false;
    // The families of the sample's category, plus those still « à préciser »
    // (RETOUR-LABO-16-10.md F1 / F5): a water, surface, hands or air line
    // corrects its family here too once the bench has started.
    fetch(`/api/product-types?${new URLSearchParams({ category: sample.type, clientId: sample.clientId })}`)
      .then((r) => r.json())
      .then((data: { id: string; name: string; clientId: string | null; unitCount: number }[]) => {
        if (!cancelled) setProductTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sample.type, sample.clientId, scope.analyses]);

  useEffect(() => {
    if (!scope.analyses) return;
    let cancelled = false;
    fetch(`/api/parameters?category=${sample.type}`)
      .then((r) => {
        // A refusal or a server error is said, never shown as an empty list.
        if (!r.ok) throw new Error(`parameters ${r.status}`);
        return r.json();
      })
      .then((data: unknown) => {
        if (cancelled) return;
        if (!Array.isArray(data)) throw new Error("parameters");
        setOptions(data as ParameterOption[]);
      })
      .catch(() => {
        if (!cancelled) setOptionsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [sample.type, scope.analyses]);

  const shown = correctionFields(kind);
  // What the analyses on screen will do to the results already typed (Q91).
  const notice = scope.analyses ? analysesNotice(sample, parameterIds, values) : null;
  // And to the invoice that holds the sample, if one does.
  const billedWarning = scope.analyses ? billedCorrectionWarning(sample, parameterIds) : null;
  // The quick choice the typed area equals, if any — its chip is pressed.
  const pickedArea = surfaceAreaChoice(values.surfaceAreaCm2);
  // « Autre » (16/10): open on a value that is not a chip, or once tapped.
  const [areaOther, setAreaOther] = useState(() => values.surfaceAreaCm2.trim() !== "" && pickedArea === null);
  const set = (key: keyof CorrectionValues, value: string | number) => setValues((v) => ({ ...v, [key]: value }));
  const input = (
    key: keyof CorrectionValues,
    label: string,
    type = "text",
    hint?: string,
    inputMode?: "decimal"
  ) => (
    <div>
      <label htmlFor={`correct-${key}`} className="block text-xs font-medium text-slate-600">{label}</label>
      <input
        id={`correct-${key}`}
        type={type}
        value={String(values[key])}
        onChange={(e) => set(key, e.target.value)}
        aria-describedby={hint ? `correct-${key}-hint` : undefined}
        className="input-field mt-1 px-3"
        {...(type === "number" ? { inputMode: "numeric" as const, min: 1 } : {})}
        {...(inputMode ? { inputMode } : {})}
      />
      {hint && <p id={`correct-${key}-hint`} className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );

  // The analyses offered, grouped by family when more than one is present.
  const groups = (() => {
    if (!options) return [];
    const present = FAMILY_ORDER.filter((family) => options.some((p) => (p.family ?? "MICRO") === family));
    return present.map((family) => ({ family, parameters: options.filter((p) => (p.family ?? "MICRO") === family) }));
  })();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const sameParameters = parameterIds.length === sample.parameterIds.length && parameterIds.every((id) => sample.parameterIds.includes(id));
      const data = await send(
        `/api/samples/${sample.id}/intake`,
        "PATCH",
        correctionBody(kind, values, sameParameters ? null : parameterIds, reason, scope)
      );
      if (data && typeof data.billing?.notice === "string") setBillingNotice(data.billing.notice);
      else onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (billingNotice) {
    // Saved: whatever closes the dialog refreshes the page.
    return (
      <Dialog title={`Correction enregistrée — ${sample.controlCode ?? sample.code}`} onClose={onDone} describedBy="correct-billing-notice">
        <p id="correct-billing-notice" role="status" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {billingNotice}
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onDone}
            aria-describedby="correct-billing-notice"
            autoFocus
            className="inline-flex min-h-[42px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Fermer
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`${title} — ${sample.controlCode ?? sample.code}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        {scope.identification && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {shown.produit && input("produit", "Désignation")}
            {shown.surface && input("surfaceLabel", "Désignation", "text", "Ce qui est prélevé (ex. : planche verte)")}
            {shown.surface && (
              // The two usual areas in one tap (« 100 cm² », « 1000 cm² » —
              // 14/10), then « Autre » (16/10): another area, or a text.
              <div>
                <p id="correct-surface-area" className="block text-xs font-medium text-slate-600">
                  Surface prélevée (cm²)
                </p>
                <div role="group" aria-labelledby="correct-surface-area" className="mt-1 flex flex-wrap gap-2">
                  {SURFACE_AREA_CHOICES.map((area) => (
                    <button
                      key={area}
                      type="button"
                      onClick={() => {
                        setAreaOther(false);
                        set("surfaceAreaCm2", String(area));
                      }}
                      aria-pressed={!areaOther && pickedArea === area}
                      className={choice(!areaOther && pickedArea === area)}
                    >
                      {`${area} cm²`}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      if (areaOther) return;
                      setAreaOther(true);
                      if (pickedArea !== null) set("surfaceAreaCm2", "");
                    }}
                    aria-pressed={areaOther}
                    className={choice(areaOther)}
                  >
                    Autre
                  </button>
                </div>
                {areaOther && (
                  <>
                    <label htmlFor="correct-surfaceAreaCm2" className="mt-2 block text-xs font-medium text-slate-600">
                      Préciser
                    </label>
                    <input
                      id="correct-surfaceAreaCm2"
                      type="text"
                      maxLength={191}
                      value={values.surfaceAreaCm2}
                      onChange={(e) => set("surfaceAreaCm2", e.target.value)}
                      placeholder="Ex. : 250, couteau entier"
                      aria-describedby="correct-surface-area-hint"
                      className="input-field mt-1 px-3"
                    />
                    <p id="correct-surface-area-hint" className="mt-0.5 text-[11px] text-slate-500">
                      Un nombre entier de cm², ou ce qui est prélevé ; vide = 100 cm².
                    </p>
                  </>
                )}
              </div>
            )}
            {shown.surface && (
              <div className="sm:col-span-2" role="group" aria-labelledby="correct-surface-state">
                <p id="correct-surface-state" className="text-xs font-medium text-slate-600">
                  État de la surface {sample.surfaceState ? "*" : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {SURFACE_STATE_CHOICES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => set("surfaceState", state)}
                      aria-pressed={values.surfaceState === state}
                      className={choice(values.surfaceState === state)}
                    >
                      {SURFACE_STATE_LABELS[state]}
                    </button>
                  ))}
                </div>
                {!sample.surfaceState && !values.surfaceState && (
                  <p className="mt-0.5 text-[11px] text-slate-500">Non renseigné sur cet échantillon ancien : facultatif ici.</p>
                )}
              </div>
            )}
            {shown.air && (
              <div className="sm:col-span-2" role="group" aria-labelledby="correct-air-method">
                <p id="correct-air-method" className="text-xs font-medium text-slate-600">
                  Méthode de prélèvement {sample.airMethod ? "*" : ""}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {AIR_METHOD_CHOICES.map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() =>
                        setValues((v) => ({
                          ...v,
                          airMethod: method,
                          // A plate just chosen proposes its 30 minutes (16/10, Q50).
                          airExposureMin:
                            isExposedPlate(method) && !isExposedPlate(sample.airMethod) && !v.airExposureMin.trim()
                              ? String(AIR_EXPOSURE_MINUTES.default)
                              : v.airExposureMin,
                        }))
                      }
                      aria-pressed={values.airMethod === method}
                      className={choice(values.airMethod === method)}
                    >
                      {AIR_METHOD_LABELS[method]}
                    </button>
                  ))}
                </div>
                {!sample.airMethod && !values.airMethod && (
                  <p className="mt-0.5 text-[11px] text-slate-500">Non renseignée sur cet échantillon ancien : facultative ici.</p>
                )}
                {isExposedPlate(values.airMethod) && (
                  <div className="mt-2">
                    <label htmlFor="correct-airExposureMin" className="block text-xs font-medium text-slate-600">
                      Durée d&apos;exposition (min){" "}
                      {sample.airExposureMin !== null || !isExposedPlate(sample.airMethod) ? <RequiredMark /> : null}
                    </label>
                    <input
                      id="correct-airExposureMin"
                      type="text"
                      inputMode="numeric"
                      value={values.airExposureMin}
                      onChange={(e) => set("airExposureMin", e.target.value)}
                      placeholder={String(AIR_EXPOSURE_MINUTES.default)}
                      aria-required={sample.airExposureMin !== null || !isExposedPlate(sample.airMethod) ? "true" : undefined}
                      aria-describedby="correct-air-exposure-hint"
                      className="input-field mt-1 w-28 px-3"
                    />
                    <p id="correct-air-exposure-hint" className="mt-0.5 text-[11px] text-slate-500">
                      {sample.airExposureMin === null && isExposedPlate(sample.airMethod)
                        ? "Non renseignée sur cet échantillon ancien : lue 30 min."
                        : `De ${AIR_EXPOSURE_MINUTES.min} à ${AIR_EXPOSURE_MINUTES.max} minutes.`}
                    </p>
                  </div>
                )}
              </div>
            )}
            {/* La fonction n'est plus demandée (Q111, 16/10) : celle d'une
                fiche ancienne est renvoyée telle quelle, donc gardée. */}
            {shown.hands && input("personName", "Personne")}
            {shown.food && input("numeroLot", "N° du lot")}
            {shown.food && input("productionDate", "DLC — production", "date")}
            {shown.food && input("expiryDate", "DLC — expiration", "date")}
            {shown.quantity && (
              <div>
                <label htmlFor="correct-quantity" className="block text-xs font-medium text-slate-600">Quantité</label>
                <div className="mt-1 flex gap-2">
                  <input id="correct-quantity" type="text" inputMode="decimal" value={values.quantity} onChange={(e) => set("quantity", e.target.value)} className="input-field px-3" />
                  <select aria-label="Unité de la quantité" value={values.quantityUnit} onChange={(e) => set("quantityUnit", e.target.value)} className="input-field w-28 px-2">
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{QUANTITY_UNIT_LABELS[u]}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {input("lieu", "Lieu / section")}
            {shown.hands && (
              // The one list of labels.ts (16/10, Q109): a state set is changed,
              // never emptied; an older sample may stay without one.
              <div className="sm:col-span-2" role="group" aria-labelledby="correct-hands-state">
                <p id="correct-hands-state" className="text-xs font-medium text-slate-600">
                  État des mains {sample.handsState ? <RequiredMark /> : null}
                </p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {HANDS_STATE_CHOICES.map((state) => (
                    <button
                      key={state}
                      type="button"
                      onClick={() => set("handsState", state)}
                      aria-pressed={values.handsState === state}
                      className={choice(values.handsState === state)}
                    >
                      {HANDS_STATE_LABELS[state]}
                    </button>
                  ))}
                </div>
                {!sample.handsState && !values.handsState && (
                  <p className="mt-0.5 text-[11px] text-slate-500">Non renseigné sur cet échantillon ancien : facultatif ici.</p>
                )}
              </div>
            )}
            {/* P9 (16/10): the temperatures of the protocole, decimal comma
                accepted; one recorded is corrected, never emptied. */}
            {shown.productTemperature &&
              input(
                "productTemperature",
                "Température au prélèvement (°C)",
                "text",
                sample.productTemperature !== null ? "Relevée : peut être corrigée, pas effacée." : "De −80 à 300 °C.",
                "decimal"
              )}
            {input(
              "ambientTemperature",
              "T° ambiante (°C)",
              "text",
              sample.ambientTemperature !== null ? "Relevée : peut être corrigée, pas effacée." : "De −80 à 300 °C.",
              "decimal"
            )}
          </div>
        )}

        {scope.analyses ? (
          <div className={scope.identification ? "mt-3 border-t border-slate-100 pt-3" : ""}>
            {shown.family && (
              <div>
                <label htmlFor="correct-product-type" className="block text-xs font-medium text-slate-600">Famille de produits (critères)</label>
                <select
                  id="correct-product-type"
                  value={values.productTypeId}
                  onChange={(e) => {
                    const type = productTypes.find((t) => t.id === e.target.value);
                    set("productTypeId", e.target.value);
                    // The criteria of this type need their units: never judge a
                    // 5-unit plan on the single unit the line carried before.
                    if (type && type.unitCount > values.unitCount) set("unitCount", type.unitCount);
                  }}
                  className="input-field mt-1 px-3"
                >
                  <option value="">— aucune —</option>
                  {/* The line's family when the list no longer offers it (archived, or classified for another category): named, never shown as « — aucune — ». */}
                  {values.productTypeId && productTypes.length > 0 && !productTypes.some((t) => t.id === values.productTypeId) && (
                    <option value={values.productTypeId}>
                      {values.productTypeId === sample.productTypeId && sample.productTypeName
                        ? `${sample.productTypeName} (hors de la liste)`
                        : "Famille enregistrée (hors de la liste)"}
                    </option>
                  )}
                  {productTypes.some((t) => t.clientId) && (
                    <optgroup label="Familles du client">
                      {productTypes.filter((t) => t.clientId).map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Catalogue">
                    {productTypes.filter((t) => !t.clientId).map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            )}

            <div className={shown.family ? "mt-3" : ""}>
              <p className="text-xs font-medium text-slate-600">Nombre d&apos;unités (n)</p>
              <div className="mt-1 flex gap-2">
                {UNIT_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set("unitCount", n)}
                    aria-pressed={values.unitCount === n}
                    className={`min-h-[36px] min-w-[44px] rounded-lg border px-3 text-sm font-semibold ${values.unitCount === n ? "border-brand bg-brand-light/60 text-brand" : "border-slate-200 text-slate-600"}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3">
              <p className="text-xs font-medium text-slate-600">Analyses demandées</p>
              {optionsFailed ? (
                <p role="alert" className="mt-1 text-xs font-medium text-rose-700">
                  Impossible de charger les analyses. Fermez la fenêtre et réessayez.
                </p>
              ) : options === null ? (
                <p className="mt-1 text-xs text-slate-500">Chargement…</p>
              ) : (
                <div className="mt-1 space-y-2">
                  {groups.map((group) => (
                    <div key={group.family} role="group" aria-label={ANALYSIS_FAMILY_LABELS[group.family]}>
                      {groups.length > 1 && (
                        <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{ANALYSIS_FAMILY_LABELS[group.family]}</p>
                      )}
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        {group.parameters.map((p) => (
                          <label key={p.id} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm">
                            <input
                              type="checkbox"
                              checked={parameterIds.includes(p.id)}
                              onChange={() => setParameterIds((c) => (c.includes(p.id) ? c.filter((x) => x !== p.id) : [...c, p.id]))}
                              className="h-4 w-4 accent-brand"
                            />
                            {p.name}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {notice && (
                <p className={`mt-1 text-xs ${notice.tone === "warning" ? "text-amber-700" : "text-slate-500"}`}>{notice.text}</p>
              )}
              {billedWarning && <p className="mt-1 text-xs font-medium text-amber-700">{billedWarning}</p>}
            </div>
          </div>
        ) : (
          // After the programme the analyses are the responsable des
          // paramètres' (16/10, Q128): said here, refused by the route.
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">{CORRECTION_MESSAGES.analysesReserved}</p>
        )}

        <div className="mt-3">
          <label htmlFor="correct-reason" className="block text-xs font-medium text-slate-600">Motif de la correction *</label>
          <textarea
            id="correct-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="input-field mt-1 resize-none px-3"
            placeholder={scope.identification ? "Ex. : lot mal lu sur le protocole" : "Ex. : analyse non faite, échantillon épuisé"}
          />
        </div>
        {scope.identification && input("remarks", "Remarques")}

        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Actions busy={busy} label="Enregistrer la correction" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function CancelDialog({ sample, onClose, onDone }: { sample: VerbSample; onClose: () => void; onDone: () => void }) {
  const consequences = cancelConsequences(sample);
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // « Non reçu »: whether the client was told (16/10, Q74), shown before the dialog closes.
  const [notice, setNotice] = useState<{ status: string; error?: string | null } | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const data = await send(`/api/samples/${sample.id}/cancel`, "POST", { reason, note });
      if (data && typeof data.notice?.status === "string") setNotice(data.notice);
      else onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (notice) {
    // The sample is cancelled: whatever closes the dialog refreshes the page.
    const { ok, text } = notReceivedNoticeText(notice);
    return (
      // The notice is on screen when the dialog mounts (a role="status" is not
      // read then) and the focus goes to « Fermer »: the dialog and the button
      // are described by it, so a screen reader says whether the client was told.
      <Dialog title={`Annulé — ${sample.controlCode ?? sample.code}`} onClose={onDone} describedBy="cancel-notice-done cancel-notice-text">
        <p id="cancel-notice-done" className="text-sm text-slate-700">Échantillon annulé : non reçu au laboratoire.</p>
        <p
          id="cancel-notice-text"
          role="status"
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}
        >
          {text}
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={onDone}
            aria-describedby="cancel-notice-text"
            autoFocus
            className="inline-flex min-h-[42px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            Fermer
          </button>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog title={`Annuler — ${sample.controlCode ?? sample.code}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-slate-600">
          {consequences.text} Seul un administrateur peut le réactiver.
        </p>
        {consequences.warnings.map((warning) => (
          <p key={warning} className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {warning}
          </p>
        ))}
        {/* Each label names its field (htmlFor): a click on « Précision » puts
            the cursor in the box, a screen reader reads the label with it. */}
        <label htmlFor="cancel-reason" className="mt-3 block text-xs font-medium text-slate-600">Motif *</label>
        <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value as CancelReason | "")} className="input-field mt-1 px-3">
          <option value="">Choisir un motif</option>
          {cancelReasonsFor(sample.status).map((r) => (
            <option key={r} value={r}>{CANCEL_REASON_LABELS[r]}</option>
          ))}
        </select>
        {reason === "NON_RECU" && (
          <p className="mt-2 text-xs text-slate-600">
            Un e-mail est adressé au client, aux adresses qui reçoivent les rapports : aucune analyse, rien n&apos;est
            facturé pour cet échantillon. L&apos;écran suivant dit s&apos;il est parti.
          </p>
        )}
        <label htmlFor="cancel-note" className="mt-3 block text-xs font-medium text-slate-600">Précision {reason === "AUTRE" && "*"}</label>
        <textarea id="cancel-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field mt-1 resize-none px-3" placeholder="Facultatif" />
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Actions busy={busy} label="Annuler l'échantillon" onClose={onClose} danger />
      </form>
    </Dialog>
  );
}

function ReactivateDialog({ sample, onClose, onDone }: { sample: VerbSample; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send(`/api/samples/${sample.id}/reactivate`, "POST", { note });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Réactiver — ${sample.controlCode ?? sample.code}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-slate-600">
          L&apos;échantillon reprend à l&apos;étape atteinte : {sample.controlCode ? "reçu, avec son N° de contrôle" : "en attente de réception"}.
        </p>
        <label htmlFor="reactivate-note" className="mt-3 block text-xs font-medium text-slate-600">Motif *</label>
        <textarea id="reactivate-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field mt-1 resize-none px-3" />
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Actions busy={busy} label="Réactiver" onClose={onClose} />
      </form>
    </Dialog>
  );
}
