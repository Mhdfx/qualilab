"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus, Save, Trash2 } from "lucide-react";
import type { Family, LimitKind, SampleType } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { fmt } from "@/lib/interpretation";
import { parseLabValue } from "@/lib/result-value";
import { MAX_UNITS } from "@/lib/series";

type TypeHeader = { id: string; name: string; family: Family; clientId: string | null; active: boolean };
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

const FAMILY_LABELS: Record<Family, string> = { MICRO: "Microbiologie", CHIMIE: "Physico-chimie", AUTRE: "Autre" };
const KIND_LABELS: Record<LimitKind, string> = { VALUE: "m et M chiffrés", ABSENCE: "Absence exigée", UNSPECIFIED: "m non spécifiée (M seule)" };

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

function toDraft(c: CriterionRow): Draft {
  return {
    key: key(),
    id: c.id,
    parameterId: c.parameterId,
    normVersionId: c.normVersionId ?? "",
    unit: c.unit ?? "",
    n: String(c.n),
    c: c.c === null ? "" : String(c.c),
    mKind: c.mKind,
    m: limitText(c.m),
    bigM: limitText(c.bigM),
    active: c.active,
  };
}

const CELL = "w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-900 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50";

/**
 * The criteria grid of one product type (CRITERES.md §6) — edited whole,
 * saved whole. The limits are typed in the lab's notation (« 1.10² »).
 */
export function CriteriaGrid({
  type,
  criteria,
  parameters,
  versions,
  clients,
}: {
  type: TypeHeader;
  criteria: CriterionRow[];
  parameters: ParameterRow[];
  versions: VersionRow[];
  clients: ClientRow[];
}) {
  const router = useRouter();
  const [header, setHeader] = useState({ name: type.name, family: type.family, clientId: type.clientId ?? "", active: type.active });
  const [rows, setRows] = useState<Draft[]>(criteria.map(toDraft));
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
        body: JSON.stringify({ ...header, clientId: header.clientId || null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setNotice("Type de produit enregistré.");
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
            c: r.c,
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
        <form onSubmit={saveHeader} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] sm:items-end">
          <div>
            <label htmlFor="type-name" className="block text-xs font-medium text-slate-600">Nom</label>
            <input id="type-name" type="text" value={header.name} onChange={(e) => setHeader((h) => ({ ...h, name: e.target.value }))} className="input-field mt-1 px-3" />
          </div>
          <div>
            <label htmlFor="type-family" className="block text-xs font-medium text-slate-600">Famille</label>
            <select id="type-family" value={header.family} onChange={(e) => setHeader((h) => ({ ...h, family: e.target.value as Family }))} className="input-field mt-1 px-3">
              {(Object.keys(FAMILY_LABELS) as Family[]).map((f) => (
                <option key={f} value={f}>{FAMILY_LABELS[f]}</option>
              ))}
            </select>
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
            Actif
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
          Limites en notation du laboratoire (« 1.10² », « 1,5.10⁶ ») ou en chiffres. c = nombre d&apos;unités tolérées entre m et M.
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
                    Aucun critère : ce type sera lu en valeur simple, sans verdict.
                  </td>
                </tr>
              )}
              {rows.map((row, index) => (
                <tr key={row.key} className="border-b border-slate-100 align-middle">
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
                    <input aria-label={`c ligne ${index + 1}`} type="number" min={0} value={row.c} onChange={(e) => update(row.key, { c: e.target.value })} disabled={row.mKind !== "VALUE"} placeholder="—" className={CELL} />
                  </td>
                  <td className="px-2 py-1.5">
                    <select aria-label={`Type de limite ligne ${index + 1}`} value={row.mKind} onChange={(e) => update(row.key, { mKind: e.target.value as LimitKind, ...(e.target.value !== "VALUE" ? { c: "" } : {}), ...(e.target.value === "ABSENCE" ? { m: "", bigM: "" } : {}), ...(e.target.value === "UNSPECIFIED" ? { m: "" } : {}) })} className={CELL}>
                      {(Object.keys(KIND_LABELS) as LimitKind[]).map((k) => (
                        <option key={k} value={k}>{KIND_LABELS[k]}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <input aria-label={`m ligne ${index + 1}`} type="text" value={row.m} onChange={(e) => update(row.key, { m: e.target.value })} disabled={row.mKind !== "VALUE"} placeholder={row.mKind === "VALUE" ? "1.10²" : "—"} className={`${CELL} font-mono`} />
                  </td>
                  <td className="px-2 py-1.5">
                    <input aria-label={`M ligne ${index + 1}`} type="text" value={row.bigM} onChange={(e) => update(row.key, { bigM: e.target.value })} disabled={row.mKind === "ABSENCE"} placeholder={row.mKind === "ABSENCE" ? "—" : "1.10³"} className={`${CELL} font-mono`} />
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
              ))}
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
