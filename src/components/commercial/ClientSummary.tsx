import Link from "next/link";
import { BarChart3, Download, Search } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { searchQueryString, type SampleSearch } from "@/lib/sample-search";
import type { SearchRow } from "@/lib/sample-search-server";

/**
 * A client's analyses over a period (RETOUR-LABO-29-09.md, slice F): the
 * counts by conclusion, the detail in the search screen, the Excel export.
 * A plain GET form on the client page — the period is in the URL.
 */
export function ClientSummary({ search, rows, total }: { search: SampleSearch; rows: SearchRow[]; total: number }) {
  const iso = (d: Date | null) =>
    d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "";
  const byConclusion = new Map<string, { count: number; tone: string }>();
  for (const row of rows) {
    const entry = byConclusion.get(row.conclusion.label) ?? { count: 0, tone: row.conclusion.tone };
    entry.count += 1;
    byConclusion.set(row.conclusion.label, entry);
  }
  const TONES: Record<string, string> = {
    ok: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    mid: "bg-amber-50 text-amber-800 ring-amber-200",
    no: "bg-rose-50 text-rose-800 ring-rose-200",
    pending: "bg-slate-50 text-slate-700 ring-slate-200",
    muted: "bg-slate-50 text-slate-500 ring-slate-200",
  };
  const query = searchQueryString(search);

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <BarChart3 className="h-4 w-4 text-brand" aria-hidden="true" />
        Synthèse des analyses
      </h2>
      <form method="GET" className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="du" className="block text-xs font-medium text-slate-600">Reçues du</label>
          <input id="du" name="du" type="date" defaultValue={iso(search.from)} className="input-field mt-1 px-3" />
        </div>
        <div>
          <label htmlFor="au" className="block text-xs font-medium text-slate-600">au</label>
          <input id="au" name="au" type="date" defaultValue={iso(search.to)} className="input-field mt-1 px-3" />
        </div>
        <button type="submit" className="inline-flex min-h-[42px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          Appliquer
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-600">
        <b className="text-slate-900">{total}</b> analyse{total > 1 ? "s" : ""} reçue{total > 1 ? "s" : ""} sur la période.
      </p>
      {byConclusion.size > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {[...byConclusion.entries()].map(([label, { count, tone }]) => (
            <li key={label} className={`rounded-full px-3 py-1 text-xs font-semibold ring-1 ${TONES[tone]}`}>
              {label} · {count}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link href={`/recherche?${query}`} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
          <Search className="h-4 w-4" aria-hidden="true" />
          Voir le détail
        </Link>
        <a href={`/api/samples/export?${query}`} className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-4 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100">
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter en Excel
        </a>
      </div>
    </Card>
  );
}
