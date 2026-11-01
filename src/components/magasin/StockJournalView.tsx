"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDecimal } from "@/lib/labels";
import { formatDateOnly, parseIsoDay } from "@/lib/date-only";
import { MOVEMENT_TYPE_LABELS, stockJournalHref, type StockJournalRow } from "@/lib/stock-journal";
import type { MovementType } from "@/lib/stock";

/**
 * The stock register on screen (lot 3D, M3): the template's columns, the
 * filters (period, article, type), « Afficher plus » without a ceiling and
 * the Excel export of the same filters.
 */

type Filters = { du: string; au: string; article: string; type: string };

const inputClass = "input-field px-3 text-sm" as const;
const day = (iso: string) => (iso ? formatDateOnly(parseIsoDay(iso) as Date) : "");
const quantity = (value: number | null) => (value === null ? "" : formatDecimal(value, 2));

function apiHref(filters: Filters, cursor?: string | null) {
  const href = stockJournalHref(filters, "/api/stock/journal");
  const extra = cursor ? `cursor=${encodeURIComponent(cursor)}` : "";
  return extra ? `${href}${href.includes("?") ? "&" : "?"}${extra}` : href;
}

export function StockJournalView({
  initialRows,
  initialCursor,
  initialFilters,
  initialError,
  items,
  today,
}: {
  initialRows: StockJournalRow[];
  initialCursor: string | null;
  initialFilters: Filters;
  initialError: string;
  items: { id: string; name: string; archived: boolean }[];
  today: string;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [rows, setRows] = useState(initialRows);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);

  async function fetchPage(next: Filters, after: string | null) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(apiHref(next, after));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Chargement impossible.");
      setRows((current) => (after ? [...current, ...data.items] : data.items));
      setCursor(data.nextCursor);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function apply(patch: Partial<Filters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void fetchPage(next, null);
    // The address keeps the filters: a reload or a shared link shows the same register.
    const href = stockJournalHref(next, "/magasin/stock/journal");
    window.history.replaceState(null, "", href);
  }

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5" role="group" aria-label="Filtres du journal">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Du</span>
          <input type="date" value={filters.du} max={today} onChange={(event) => apply({ du: event.target.value })} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Au</span>
          <input type="date" value={filters.au} max={today} onChange={(event) => apply({ au: event.target.value })} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Article</span>
          <select value={filters.article} onChange={(event) => apply({ article: event.target.value })} className={`mt-1 ${inputClass} bg-white`}>
            <option value="">Tous les articles</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.archived ? " (archivé)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Type</span>
          <select value={filters.type} onChange={(event) => apply({ type: event.target.value })} className={`mt-1 ${inputClass} bg-white`}>
            <option value="">Tous</option>
            {(Object.keys(MOVEMENT_TYPE_LABELS) as MovementType[]).map((type) => (
              <option key={type} value={type}>
                {MOVEMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <a
            href={stockJournalHref(filters)}
            className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter (Excel)
          </a>
        </div>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          {Object.values(filters).some(Boolean) ? "Aucun mouvement pour ces filtres." : "Aucun mouvement enregistré."}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-3 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Libellé</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Lot</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Expiration</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Entrée</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Sortie</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Stock</th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold">Prix (DH HT)</th>
                  <th scope="col" className="px-3 py-3 font-semibold">Lieu de stockage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-700">{day(row.day)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {row.label}
                      <span className="block text-xs font-normal text-slate-500">
                        {row.type}
                        {row.by && ` · ${row.by}`}
                        {row.note && ` · ${row.note}`}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.lot}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-600">{day(row.expiry)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-emerald-700">{quantity(row.entry)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-rose-700">{quantity(row.exit)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-slate-800">
                      {row.stock === null ? "" : `${quantity(row.stock)} ${row.unit}`}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {row.unitPrice !== null && (
                        <>
                          {formatCurrency(row.unitPrice)}
                          {row.amount !== null && <span className="block text-xs text-slate-500">{formatCurrency(row.amount)}</span>}
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{row.location}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button
                type="button"
                onClick={() => fetchPage(filters, cursor)}
                disabled={loading}
                className="inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              >
                {loading ? "Chargement…" : "Afficher plus de mouvements"}
              </button>
            </div>
          )}
        </Card>
      )}
      <p className="mt-3 text-xs text-slate-500">
        « Stock » : le niveau juste après le mouvement (vide pour un mouvement enregistré avant le 01/11/2026). Un ajustement d&apos;inventaire
        montre son écart en entrée ou en sortie. Prix : prix unitaire HT de l&apos;entrée, puis le montant (quantité × prix).
      </p>
    </div>
  );
}
