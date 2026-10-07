"use client";

import { verbsFor } from "@/lib/sample-verbs";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, Pencil, RotateCcw, X } from "lucide-react";
import type { CancelReason, Family, QuantityUnit } from "@/generated/prisma/enums";
import type { Role } from "@/lib/roles";
import {
  AIR_METHOD_CHOICES,
  AIR_METHOD_LABELS,
  ANALYSIS_FAMILY_LABELS,
  CANCEL_REASON_LABELS,
  HANDS_STATE_LABELS,
  QUANTITY_UNIT_LABELS,
  SURFACE_STATE_CHOICES,
  SURFACE_STATE_LABELS,
} from "@/lib/labels";
import {
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
 * « Désignation », « État de la surface » and « Surface prélevée (cm²) »,
 * an air sample its « Méthode de prélèvement ». A field the dialog does not
 * show is not sent, so an old value of another kind is never emptied.
 */

// « Détruit à réception » is the reception's own verb (slice E), never picked here.
const REASONS = (Object.keys(CANCEL_REASON_LABELS) as CancelReason[]).filter((r) => r !== "DETRUIT_A_RECEPTION");
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
  if (!verbs.correct && !verbs.cancel && !verbs.reactivate) return null;

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
      {verbs.correct && button("Corriger la fiche", <Pencil className="h-3.5 w-3.5" aria-hidden="true" />, () => setOpen("correct"))}
      {verbs.cancel && button("Annuler", <Ban className="h-3.5 w-3.5" aria-hidden="true" />, () => setOpen("cancel"), "danger")}
      {verbs.reactivate && button("Réactiver", <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />, () => setOpen("reactivate"))}

      {open === "correct" && <CorrectDialog sample={sample} onClose={() => setOpen(null)} onDone={done} />}
      {open === "cancel" && <CancelDialog sample={sample} onClose={() => setOpen(null)} onDone={done} />}
      {open === "reactivate" && <ReactivateDialog sample={sample} onClose={() => setOpen(null)} onDone={done} />}
    </div>
  );
}

function Dialog({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" role="dialog" aria-modal="true" aria-label={title}>
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

function CorrectDialog({ sample, onClose, onDone }: { sample: VerbSample; onClose: () => void; onDone: () => void }) {
  const kind = sample.lineKind;
  const [values, setValues] = useState<CorrectionValues>(() => correctionValues(sample));
  const [parameterIds, setParameterIds] = useState<string[]>(sample.parameterIds);
  const [productTypes, setProductTypes] = useState<{ id: string; name: string; clientId: string | null; unitCount: number }[]>([]);
  const [options, setOptions] = useState<ParameterOption[] | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (kind !== "ALIMENT") return;
    let cancelled = false;
    fetch(`/api/product-types?clientId=${sample.clientId}`)
      .then((r) => r.json())
      .then((data: { id: string; name: string; clientId: string | null; unitCount: number }[]) => {
        if (!cancelled) setProductTypes(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [kind, sample.clientId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/parameters?category=${sample.type}`)
      .then((r) => r.json())
      .then((data: ParameterOption[]) => {
        if (!cancelled) setOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sample.type]);

  const shown = correctionFields(kind);
  const set = (key: keyof CorrectionValues, value: string | number) => setValues((v) => ({ ...v, [key]: value }));
  const input = (key: keyof CorrectionValues, label: string, type = "text", hint?: string) => (
    <div>
      <label htmlFor={`correct-${key}`} className="block text-xs font-medium text-slate-600">{label}</label>
      <input
        id={`correct-${key}`}
        type={type}
        value={String(values[key])}
        onChange={(e) => set(key, e.target.value)}
        className="input-field mt-1 px-3"
        {...(type === "number" ? { inputMode: "numeric" as const, min: 1 } : {})}
      />
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
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
      await send(`/api/samples/${sample.id}/intake`, "PATCH", correctionBody(kind, values, sameParameters ? null : parameterIds, reason));
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Corriger la fiche — ${sample.controlCode ?? sample.code}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {shown.produit && input("produit", "Désignation")}
          {shown.food && (
            <div>
              <label htmlFor="correct-product-type" className="block text-xs font-medium text-slate-600">Type de produit (critères)</label>
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
                <option value="">— aucun —</option>
                {productTypes.some((t) => t.clientId) && (
                  <optgroup label="Types du client">
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
          {shown.surface && input("surfaceLabel", "Désignation", "text", "Ce qui est prélevé (ex. : planche verte)")}
          {shown.surface && input("surfaceAreaCm2", "Surface prélevée (cm²)", "number", "Vide = 100 cm²")}
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
                    onClick={() => set("airMethod", method)}
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
            </div>
          )}
          {shown.hands && input("personName", "Personne")}
          {shown.hands && input("personRole", "Fonction")}
          {shown.food && input("numeroLot", "N° du lot")}
          {shown.food && input("productionDate", "DLC — production", "date")}
          {shown.food && input("expiryDate", "DLC — expiration", "date")}
          {shown.quantity && (
            <div>
              <label className="block text-xs font-medium text-slate-600">Quantité</label>
              <div className="mt-1 flex gap-2">
                <input type="text" inputMode="decimal" value={values.quantity} onChange={(e) => set("quantity", e.target.value)} className="input-field px-3" />
                <select value={values.quantityUnit} onChange={(e) => set("quantityUnit", e.target.value)} className="input-field w-28 px-2">
                  {UNITS.map((u) => (
                    <option key={u} value={u}>{QUANTITY_UNIT_LABELS[u]}</option>
                  ))}
                </select>
              </div>
            </div>
          )}
          {input("lieu", "Lieu / section")}
          {shown.hands && (
            <div role="group" aria-labelledby="correct-hands-state">
              <p id="correct-hands-state" className="text-xs font-medium text-slate-600">État des mains</p>
              <div className="mt-1 flex gap-2">
                {(["LAVEES", "NON_LAVEES"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set("handsState", values.handsState === s ? "" : s)}
                    aria-pressed={values.handsState === s}
                    className={choice(values.handsState === s)}
                  >
                    {HANDS_STATE_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3">
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
          {options === null ? (
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
          <p className="mt-1 text-xs text-amber-700">Changer les analyses efface les résultats déjà saisis et renvoie l&apos;échantillon à la paillasse.</p>
        </div>

        <div className="mt-3">
          <label className="block text-xs font-medium text-slate-600">Motif de la correction *</label>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="input-field mt-1 resize-none px-3" placeholder="Ex. : lot mal lu sur le protocole" />
        </div>
        {input("remarks", "Remarques")}

        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Actions busy={busy} label="Enregistrer la correction" onClose={onClose} />
      </form>
    </Dialog>
  );
}

function CancelDialog({ sample, onClose, onDone }: { sample: VerbSample; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await send(`/api/samples/${sample.id}/cancel`, "POST", { reason, note });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Annuler — ${sample.controlCode ?? sample.code}`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <p className="text-sm text-slate-600">
          L&apos;échantillon sort de toutes les files, du rapport et de la facturation. Seul un administrateur peut le réactiver.
        </p>
        <label className="mt-3 block text-xs font-medium text-slate-600">Motif *</label>
        <select value={reason} onChange={(e) => setReason(e.target.value as CancelReason | "")} className="input-field mt-1 px-3">
          <option value="">Choisir un motif</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>{CANCEL_REASON_LABELS[r]}</option>
          ))}
        </select>
        <label className="mt-3 block text-xs font-medium text-slate-600">Précision {reason === "AUTRE" && "*"}</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field mt-1 resize-none px-3" placeholder="Facultatif" />
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
        <label className="mt-3 block text-xs font-medium text-slate-600">Motif *</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input-field mt-1 resize-none px-3" />
        {error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        <Actions busy={busy} label="Réactiver" onClose={onClose} />
      </form>
    </Dialog>
  );
}
