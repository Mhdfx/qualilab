"use client";

import { Fragment, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import type { Family, LimitKind, SampleType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { LIMITLESS_HINT, bigMChange, kindChange, toleranceApplies, wideToleranceNote } from "@/lib/criteria-input";
import { fmt } from "@/lib/interpretation";
import { parseLabValue } from "@/lib/result-value";
import { MAX_UNITS } from "@/lib/series";
import { FAMILY_SHORT_LABELS as FAMILY_LABELS } from "@/lib/labels";

type TypeHeader = { id: string; name: string; family: Family; natureId: string | null; clientId: string | null; active: boolean };
type CriterionRow = {
  id: string | null;
  parameterId: string;
  normVersionId: string | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
  active: boolean;
};
type ParameterRow = { id: string; name: string; category: SampleType; unit: string | null };
type VersionRow = { id: string; code: string; version: string; label: string; current: boolean };
type ClientRow = { id: string; name: string };
/** A type d'analyse; an archived one is offered only to the family that still carries it. */
type NatureRow = { id: string; label: string; family: Family; active: boolean };

type Draft = {
  key: string;
  id: string | null;
  parameterId: string;
  normVersionId: string;
  unit: string;
  n: string;
  c: string;
  mKind: LimitKind;
  m: string;
  bigM: string;
  active: boolean;
};

const KIND_LABELS: Record<LimitKind, string> = { VALUE: "m et M chiffrés", ABSENCE: "Absence exigée", UNSPECIFIED: "m non spécifiée" };

/**
 * A limit is shown in the laboratory's notation only when that notation
 * reads back as the very same number — « 1250 » must not be re-saved as
 * « 1,3.10³ » just because it was displayed that way.
 */
function limitText(value: number | null): string {
  if (value === null) return "";
  const shown = fmt(value);
  return parseLabValue(shown).numeric === value ? shown : String(value);
}

let seed = 0;
const key = () => `c-${Date.now()}-${(seed += 1)}`;

/**
 * Whether the c cell is open. A « m et M chiffrés » row keeps it open while
 * m is being typed (m is mandatory there anyway); « m non spécifiée » opens
 * it with M; an absence test never.
 */
function offersTolerance(row: Draft): boolean {
  return toleranceApplies(row.mKind, true, row.bigM.trim() !== "");
}

/** A limit cell read as a figure, or null while it is empty or unreadable. */
function cellFigure(text: string): number | null {
  const parsed = parseLabValue(text);
  return parsed.kind === "number" ? parsed.numeric : null;
}

/** The row as the engine would read it once saved — for the note under it. */
function draftNote(row: Draft): string | null {
  const c = offersTolerance(row) && row.c.trim() !== "" ? Number(row.c) : null;
  return wideToleranceNote({
    n: Number(row.n),
    c: c !== null && Number.isInteger(c) ? c : null,
    mKind: row.mKind,
    m: row.mKind === "VALUE" ? cellFigure(row.m) : null,
    bigM: cellFigure(row.bigM),
  });
}

function toDraft(c: CriterionRow): Draft {
  return {
    key: key(),
    id: c.id,
    parameterId: c.parameterId,
    normVersionId: c.normVersionId ?? "",
    unit: c.unit ?? "",
    n: String(c.n),
    // The old software's import stored its CONTROL column on absence tests
    // and limitless rows too, where c means nothing: not shown, saved empty.
    c: c.c === null || !toleranceApplies(c.mKind, c.m !== null, c.bigM !== null) ? "" : String(c.c),
    mKind: c.mKind,
    m: limitText(c.m),
    bigM: limitText(c.bigM),
    active: c.active,
  };
}

const CELL = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50";

/**
 * The criteria grid of one famille de produits (CRITERES.md §6) — edited
 * whole, saved whole. The limits are typed in the lab's notation
 * (« 1.10² »). The header names the family, its type d'analyse
 * (RETOUR-LABO-16-10.md F4) — which sets its domain — and its client.
 */
export function CriteriaGrid({
  type,
  criteria,
  parameters,
  versions,
  clients,
  natures,
}: {
  type: TypeHeader;
  criteria: CriterionRow[];
  parameters: ParameterRow[];
  versions: VersionRow[];
  clients: ClientRow[];
  natures: NatureRow[];
}) {
  const router = useRouter();
  const [header, setHeader] = useState({
    name: type.name,
    natureId: type.natureId ?? "",
    family: type.family,
    clientId: type.clientId ?? "",
    active: type.active,
  });
  // The domain follows the type d'analyse; it is chosen only while that is « à préciser ».
  const nature = natures.find((n) => n.id === header.natureId) ?? null;
  const natureOptions = natures.filter((n) => n.active || n.id === type.natureId);
  const [rows, setRows] = useState<Draft[]>(criteria.map(toDraft));
  // Row keys come from Date.now(): fine for React, not for an id the server renders too.
  const hintId = useId();
  const [busy, setBusy] = useState<"header" | "grid" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const food = parameters.filter((p) => p.category === "ALIMENTAIRE");
  const others = parameters.filter((p) => p.category !== "ALIMENTAIRE");

  function update(k: string, patch: Partial<Draft>) {
    setRows((current) => current.map((r) => (r.key === k ? { ...r, ...patch } : r)));
    setError("");
    setNotice("");
  }

  function addRow() {
    const last = rows.at(-1);
    setRows((current) => [
      ...current,
      { key: key(), id: null, parameterId: "", normVersionId: last?.normVersionId ?? "", unit: last?.unit ?? "ufc/g", n: last?.n ?? "5", c: "", mKind: "VALUE", m: "", bigM: "", active: true },
    ]);
  }

  async function saveHeader(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy("header");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/product-types/${type.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, natureId: header.natureId || null, clientId: header.clientId || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setNotice("Famille enregistrée.");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function saveGrid() {
    if (busy) return;
    setBusy("grid");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/product-types/${type.id}/criteria`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          criteria: rows.map((r) => ({
            id: r.id,
            parameterId: r.parameterId,
            normVersionId: r.normVersionId || null,
            unit: r.unit,
            n: r.n,
            c: offersTolerance(r) ? r.c : "",
            mKind: r.mKind,
            m: r.m,
            bigM: r.bigM,
            active: r.active,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setRows((data.criteria as CriterionRow[]).map(toDraft));
      setNotice(`${data.criteria.length} critère${data.criteria.length > 1 ? "s" : ""} enregistré${data.criteria.length > 1 ? "s" : ""}.`);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5">
        <form onSubmit={saveHeader} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.6fr_1fr_1.2fr_auto_auto] lg:items-end">
          <div>
            <label htmlFor="type-name" className="block text-xs font-medium text-slate-600">Nom</label>
            <input id="type-name" type="text" value={header.name} onChange={(e) => setHeader((h) => ({ ...h, name: e.target.value }))} className="input-field mt-1 px-3" />
          </div>
          <div>
            <label htmlFor="type-nature" className="block text-xs font-medium text-slate-600">Type d&apos;analyse</label>
            <select
              id="type-nature"
              value={header.natureId}
              // Back to « à préciser », the domain stays the one the type d'analyse gave.
              onChange={(e) => setHeader((h) => ({ ...h, natureId: e.target.value, family: nature?.family ?? h.family }))}
              className="input-field mt-1 px-3"
            >
              <option value="">— à préciser —</option>
              {natureOptions.map((n) => (
                <option key={n.id} value={n.id}>{n.active ? n.label : `${n.label} (archivé)`}</option>
              ))}
            </select>
          </div>
          <div>
            {nature ? (
              <>
                <span className="block text-xs font-medium text-slate-600">Domaine</span>
                <p className="mt-1 flex min-h-[42px] flex-wrap items-center gap-x-1.5 px-1 text-sm text-slate-700">
                  {FAMILY_LABELS[nature.family]}
                  <span className="text-xs text-slate-500">(selon le type d&apos;analyse)</span>
                </p>
              </>
            ) : (
              <>
                <label htmlFor="type-family" className="block text-xs font-medium text-slate-600">Domaine</label>
                <select id="type-family" value={header.family} onChange={(e) => setHeader((h) => ({ ...h, family: e.target.value as Family }))} className="input-field mt-1 px-3">
                  {(Object.keys(FAMILY_LABELS) as Family[]).map((f) => (
                    <option key={f} value={f}>{FAMILY_LABELS[f]}</option>
                  ))}
                </select>
              </>
            )}
          </div>
          <div>
            <label htmlFor="type-client" className="block text-xs font-medium text-slate-600">Propre à un client</label>
            <select id="type-client" value={header.clientId} onChange={(e) => setHeader((h) => ({ ...h, clientId: e.target.value }))} className="input-field mt-1 px-3">
              <option value="">— catalogue commun —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <label className="flex min-h-[44px] items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={header.active} onChange={(e) => setHeader((h) => ({ ...h, active: e.target.checked }))} className="h-4 w-4 accent-brand" />
            Active
          </label>
          <SecondaryButton type="submit" disabled={busy !== null}>
            <Check className="h-4 w-4" aria-hidden="true" />
            {busy === "header" ? "Enregistrement…" : "Enregistrer"}
          </SecondaryButton>
        </form>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Critères d&apos;interprétation
          </h2>
          <button type="button" onClick={addRow} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter un critère
          </button>
        </div>
        <p className="px-5 pt-1 text-xs text-slate-500">
          Limites en notation du laboratoire (« 1.10² », « 1,5.10⁶ ») ou en chiffres. c = nombre d&apos;unités tolérées entre m et M,
          ou au-dessus de la limite quand il n&apos;y en a qu&apos;une. « m non spécifiée » sans M : {LIMITLESS_HINT}.
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-medium">Germe</th>
                <th className="px-2 py-2 font-medium">Norme (version)</th>
                <th className="w-20 px-2 py-2 font-medium">n</th>
                <th className="w-16 px-2 py-2 font-medium">c</th>
                <th className="w-44 px-2 py-2 font-medium">Type de limite</th>
                <th className="w-28 px-2 py-2 font-medium">m</th>
                <th className="w-28 px-2 py-2 font-medium">M</th>
                <th className="w-24 px-2 py-2 font-medium">Unité</th>
                <th className="w-16 px-2 py-2 font-medium">Actif</th>
                <th className="w-10 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-5 py-6 text-center text-sm text-slate-500">
                    Aucun critère : cette famille sera lue en valeur simple, sans verdict.
                  </td>
                </tr>
              )}
              {rows.map((row, index) => {
                const note = draftNote(row);
                return (
                  <Fragment key={row.key}>
                    <tr className={`${note ? "" : "border-b border-slate-100 "}align-middle`}>
                      <td className="px-3 py-1.5">
                        <select aria-label={`Germe ligne ${index + 1}`} value={row.parameterId} onChange={(e) => update(row.key, { parameterId: e.target.value })} className={CELL}>
                          <option value="">Choisir…</option>
                          <optgroup label="Microbiologie alimentaire">
                            {food.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </optgroup>
                          {others.length > 0 && (
                            <optgroup label="Autres paramètres">
                              {others.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <select aria-label={`Norme ligne ${index + 1}`} value={row.normVersionId} onChange={(e) => update(row.key, { normVersionId: e.target.value })} className={CELL}>
                          <option value="">— sans norme —</option>
                          {versions.map((v) => (
                            <option key={v.id} value={v.id}>
                              {v.code}{v.version ? `:${v.version}` : ""}{v.current ? " · en vigueur" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input aria-label={`n ligne ${index + 1}`} type="number" min={1} max={MAX_UNITS} value={row.n} onChange={(e) => update(row.key, { n: e.target.value })} className={CELL} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input aria-label={`c ligne ${index + 1}`} aria-describedby={note ? `${hintId}-c-${index}` : undefined} type="number" min={0} value={offersTolerance(row) ? row.c : ""} onChange={(e) => update(row.key, { c: e.target.value })} disabled={!offersTolerance(row)} placeholder="—" className={CELL} />
                      </td>
                      <td className="px-2 py-1.5">
                        <select aria-label={`Type de limite ligne ${index + 1}`} value={row.mKind} onChange={(e) => update(row.key, kindChange(row, e.target.value as LimitKind))} className={CELL}>
                          {(Object.keys(KIND_LABELS) as LimitKind[]).map((k) => (
                            <option key={k} value={k}>{KIND_LABELS[k]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-2 py-1.5">
                        <input aria-label={`m ligne ${index + 1}`} type="text" value={row.m} onChange={(e) => update(row.key, { m: e.target.value })} disabled={row.mKind !== "VALUE"} placeholder={row.mKind === "VALUE" ? "1.10²" : "—"} className={`${CELL} font-mono`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input aria-label={`M ligne ${index + 1}`} aria-describedby={row.mKind === "UNSPECIFIED" && !row.bigM.trim() ? `${hintId}-${index}` : undefined} type="text" value={row.bigM} onChange={(e) => update(row.key, bigMChange(row, e.target.value))} disabled={row.mKind === "ABSENCE"} placeholder={row.mKind === "ABSENCE" ? "—" : "1.10³"} className={`${CELL} font-mono`} />
                        {row.mKind === "UNSPECIFIED" && !row.bigM.trim() && (
                          <p id={`${hintId}-${index}`} className="mt-1 text-[11px] leading-tight text-slate-500">{LIMITLESS_HINT}</p>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <input aria-label={`Unité ligne ${index + 1}`} type="text" value={row.unit} onChange={(e) => update(row.key, { unit: e.target.value })} placeholder="ufc/g" className={CELL} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input aria-label={`Actif ligne ${index + 1}`} type="checkbox" checked={row.active} onChange={(e) => update(row.key, { active: e.target.checked })} className="h-4 w-4 accent-brand" />
                      </td>
                      <td className="px-2 py-1.5">
                        <button type="button" onClick={() => setRows((c) => c.filter((r) => r.key !== row.key))} aria-label={`Supprimer la ligne ${index + 1}`} title="Supprimer" className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                    {note && (
                      <tr className="border-b border-slate-100">
                        <td colSpan={10} className="px-3 pb-2">
                          <p id={`${hintId}-c-${index}`} className="text-[11px] leading-tight text-amber-800">{note}</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="px-5 pb-5 pt-4">
          {error && (
            <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {notice && (
            <p role="status" className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">Les lignes supprimées ici le sont à l&apos;enregistrement ; chaque enregistrement est tracé dans le journal.</p>
            <PrimaryButton type="button" onClick={saveGrid} disabled={busy !== null}>
              <Save className="h-4 w-4" aria-hidden="true" />
              {busy === "grid" ? "Enregistrement…" : "Enregistrer les critères"}
            </PrimaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
}
