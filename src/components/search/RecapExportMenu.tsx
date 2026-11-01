"use client";

import { useState } from "react";
import { ChevronDown, Table2 } from "lucide-react";
import { RECAP_DEFAULT_MODE, type RecapMode } from "@/lib/sample-recap";

/**
 * « Récapitulatif par site » beside « Exporter en Excel » on /recherche
 * (RETOUR-LABO-28-10.md L1): the same filters (`query`), and the two
 * choices R-21 still asks the laboratory — the value or C / NC per
 * parameter, and the date and N° de contrôle columns.
 */
export function RecapExportMenu({ query, withValues }: { query: string; withValues: boolean }) {
  // A role that may not read reports (réception, programmation) gets C / NC
  // only: no choice offered, the route decides again (`recapAccess`).
  const [chosen, setMode] = useState<RecapMode>(RECAP_DEFAULT_MODE);
  const mode: RecapMode = withValues ? chosen : "cnc";
  const [details, setDetails] = useState(false);
  const params = new URLSearchParams(query);
  if (mode !== RECAP_DEFAULT_MODE) params.set("mode", mode);
  if (details) params.set("details", "1");
  const href = `/api/samples/recap?${params.toString()}`;

  return (
    <details className="group relative">
      <summary className="inline-flex min-h-[42px] cursor-pointer list-none items-center gap-2 rounded-xl border border-emerald-300 bg-white px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 [&::-webkit-details-marker]:hidden">
        <Table2 className="h-4 w-4" aria-hidden="true" />
        Récapitulatif par site
        <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-lg">
        <p className="text-slate-600">
          Une ligne par échantillon, regroupées par site ; une colonne par paramètre. Mêmes filtres que la recherche.
        </p>
        {withValues ? (
          <fieldset className="mt-3">
            <legend className="font-medium text-slate-700">Pour chaque paramètre</legend>
            <label className="mt-1.5 flex items-center gap-2">
              <input type="radio" name="recap-mode" checked={mode === "valeur"} onChange={() => setMode("valeur")} className="h-4 w-4 accent-brand" />
              La valeur, colorée selon le verdict
            </label>
            <label className="mt-1 flex items-center gap-2">
              <input type="radio" name="recap-mode" checked={mode === "cnc"} onChange={() => setMode("cnc")} className="h-4 w-4 accent-brand" />
              C / NC (conforme, non conforme)
            </label>
          </fieldset>
        ) : (
          <p className="mt-3 text-slate-700">Pour chaque paramètre : C / NC (conforme, non conforme). Les valeurs sont réservées aux profils qui lisent les rapports.</p>
        )}
        <label className="mt-3 flex items-center gap-2">
          <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} className="h-4 w-4 accent-brand" />
          Ajouter la date de réception et le N° de contrôle
        </label>
        <a
          href={href}
          className="mt-4 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-semibold text-white transition hover:bg-emerald-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
        >
          Télécharger (Excel)
        </a>
        <p className="mt-2 text-xs text-slate-500">{withValues ? "Les valeurs n’apparaissent qu’une fois l’échantillon validé." : "Les verdicts n’apparaissent qu’une fois l’échantillon validé."}</p>
      </div>
    </details>
  );
}
