"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, ChevronRight, Wand2 } from "lucide-react";
import type { AccreditationStatus, SampleType } from "@/generated/prisma/enums";
import { ACCREDITATION_LABELS, ACCREDITATION_STATUSES, accreditationFromLegacyName } from "@/lib/accreditation";
import { SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { Card } from "@/components/ui/Card";

export type AccreditationRow = { id: string; name: string; category: SampleType; accreditation: AccreditationStatus | null };

type Draft = Record<string, AccreditationStatus | null>;

/**
 * « Accréditation des paramètres » (RETOUR-LABO-28-10.md K4, Q14): the
 * status of each analysis — the report prints its legend mark after the
 * name, and the accreditation logo when at least one analysis is accredited
 * (once the file is uploaded in /admin/entreprise). The old software's marks
 * in the names (« * », « (SA) », « (SN) ») are offered as a proposal, to
 * apply and read again with the laboratory; nothing is saved before
 * « Enregistrer ».
 */
export function AccreditationManager({ parameters }: { parameters: AccreditationRow[] }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({});
  const [query, setQuery] = useState("");
  const [onlyUnknown, setOnlyUnknown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const statusOf = (row: AccreditationRow) => (row.id in draft ? draft[row.id] : row.accreditation);
  const changed = parameters.filter((row) => row.id in draft && draft[row.id] !== row.accreditation);
  const proposals = useMemo(
    () => parameters.filter((row) => row.accreditation === null && accreditationFromLegacyName(row.name) !== null),
    [parameters]
  );
  const unknown = parameters.filter((row) => statusOf(row) === null).length;
  const needle = query.trim().toLowerCase();
  const shown = parameters.filter(
    (row) => (!onlyUnknown || statusOf(row) === null) && (!needle || row.name.toLowerCase().includes(needle))
  );

  function set(id: string, value: AccreditationStatus | null) {
    setNotice("");
    setDraft((current) => ({ ...current, [id]: value }));
  }

  function applyProposals() {
    setNotice(`${proposals.length} proposition${proposals.length > 1 ? "s" : ""} appliquée${proposals.length > 1 ? "s" : ""} — relisez-les, puis enregistrez.`);
    setDraft((current) => {
      const next = { ...current };
      for (const row of proposals) next[row.id] = accreditationFromLegacyName(row.name);
      return next;
    });
  }

  async function save() {
    if (saving || changed.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch("/api/parameters/accreditation", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates: changed.map((row) => ({ id: row.id, accreditation: draft[row.id] })) }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string; updated?: number };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setDraft({});
      setNotice(`${data.updated ?? 0} paramètre${(data.updated ?? 0) > 1 ? "s" : ""} enregistré${(data.updated ?? 0) > 1 ? "s" : ""} — les prochains rapports émis porteront ces marques.`);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-5 p-0">
      <details className="group">
        <summary className="flex min-h-[56px] cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-5 py-3 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
          <BadgeCheck className="h-5 w-5 text-brand" aria-hidden="true" />
          <span className="font-semibold text-slate-900">Accréditation des paramètres</span>
          <span className="text-sm text-slate-500">
            {unknown === 0 ? "tous précisés" : `${unknown} à préciser`} · marque imprimée après le nom sur le rapport
          </span>
        </summary>
        <div className="border-t border-slate-200 px-5 pb-5 pt-4">
          <p className="text-sm text-slate-600">
            « * » non accrédité, « (SA) » sous-traité accrédité, « (SN) » sous-traité non accrédité — la légende du rapport.
            Le logo d&apos;accréditation s&apos;imprime sur un rapport qui porte au moins une analyse accréditée, une fois le
            fichier déposé dans « Entreprise ». « À préciser » : aucune marque. Les rapports déjà émis ne changent pas.
          </p>
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label htmlFor="accr-search" className="block text-sm font-medium text-slate-700">Chercher un paramètre</label>
              <input id="accr-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} className="input-field mt-1.5 px-3" />
            </div>
            <label className="flex min-h-[42px] items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={onlyUnknown} onChange={(e) => setOnlyUnknown(e.target.checked)} className="h-4 w-4 accent-brand" />
              À préciser seulement
            </label>
            {proposals.length > 0 && (
              <button
                type="button"
                onClick={applyProposals}
                className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Wand2 className="h-4 w-4" aria-hidden="true" />
                Proposer d&apos;après l&apos;ancien logiciel ({proposals.length})
              </button>
            )}
          </div>

          <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-medium">Paramètre</th>
                  <th className="px-3 py-2 font-medium">Catégorie</th>
                  <th className="px-3 py-2 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const proposal = row.accreditation === null ? accreditationFromLegacyName(row.name) : null;
                  const edited = row.id in draft && draft[row.id] !== row.accreditation;
                  return (
                    <tr key={row.id} className={`border-t border-slate-100 ${edited ? "bg-amber-50/60" : ""}`}>
                      <td className="px-3 py-2 text-slate-800">
                        {row.name}
                        {proposal && !edited && (
                          <span className="block text-xs text-slate-500">Ancien logiciel : {ACCREDITATION_LABELS[proposal]}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{SAMPLE_TYPE_LABELS[row.category]}</td>
                      <td className="px-3 py-2">
                        <label className="sr-only" htmlFor={`accr-${row.id}`}>Statut d&apos;accréditation de {row.name}</label>
                        <select
                          id={`accr-${row.id}`}
                          value={statusOf(row) ?? ""}
                          onChange={(e) => set(row.id, e.target.value ? (e.target.value as AccreditationStatus) : null)}
                          className="input-field min-h-[38px] px-2"
                        >
                          <option value="">À préciser</option>
                          {ACCREDITATION_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {ACCREDITATION_LABELS[status]}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-6 text-center text-slate-500">Aucun paramètre.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {error && (
            <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {notice && !error && (
            <p role="status" className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving || changed.length === 0}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {saving ? "Enregistrement…" : changed.length === 0 ? "Enregistrer" : `Enregistrer (${changed.length})`}
            </button>
            {changed.length > 0 && (
              <button type="button" onClick={() => setDraft({})} className="min-h-[44px] rounded-xl px-3 text-sm font-medium text-slate-600 hover:bg-slate-100">
                Annuler les modifications
              </button>
            )}
          </div>
        </div>
      </details>
    </Card>
  );
}
