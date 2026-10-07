"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileText, Plus, Search, Receipt, Wallet, FileBarChart, Hourglass } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { useInvoiceBasePath } from "@/lib/invoice-paths";
import { PrimaryLink } from "@/components/PrimaryButton";
import { formatCurrency, formatDate } from "@/lib/labels";
import { INVOICE_STATE_LABELS } from "@/lib/invoice-lifecycle";
import type { InvoiceKind } from "@/generated/prisma/enums";
import { InvoiceStateBadge } from "@/components/invoices/InvoiceStateBadge";
import {
  documentLabel,
  LIST_KIND_FILTER_LABELS,
  LIST_KIND_FILTERS,
  LIST_STATE_FILTERS,
  listFiltersQuery,
  type InvoiceListRow,
  type ListFilters,
  type ListStateFilter,
} from "@/components/invoices/invoice-view";

/** The headline figures the list shows (FACTURATION.md §4), computed by the page. */
export type InvoiceListFigures = {
  issuedCount: number;
  issuedThisMonth: number;
  draftCount: number;
  cancelledCount: number;
  creditNoteCount: number;
  billed: number;
  collected: number;
  outstanding: number;
};

/**
 * The invoice list (FACTURATION.md §5): filters by state and by type, a
 * « Reste à payer » column, and figures where drafts and cancelled invoices
 * stay apart and credit notes are deducted. The page reads the rows on the
 * server; the filters live in the address, so a filtered list can be shared.
 */
export function FacturesList({
  rows,
  truncated,
  filters,
  figures,
}: {
  rows: InvoiceListRow[];
  truncated: boolean;
  filters: ListFilters;
  figures: InvoiceListFigures;
}) {
  const base = useInvoiceBasePath();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(filters.q);

  function apply(next: Partial<ListFilters>) {
    const query = listFiltersQuery({ ...filters, q: search.trim(), ...next });
    startTransition(() => router.replace(`${base}${query}`));
  }

  const filtered = filters.state !== null || filters.kind !== null || filters.q !== "";

  const stats = [
    { label: "Factures émises", value: figures.issuedCount, icon: Receipt, accent: "brand" as const },
    { label: "Facturé (net d'avoirs)", value: formatCurrency(figures.billed), icon: FileBarChart, accent: "blue" as const },
    { label: "Encaissé", value: formatCurrency(figures.collected), icon: Wallet, accent: "emerald" as const },
    { label: "Reste à payer", value: formatCurrency(figures.outstanding), icon: Hourglass, accent: "amber" as const },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        badge="Administration"
        title="Factures"
        subtitle="Créez, émettez et suivez les factures clients, leurs règlements et leurs avoirs"
        action={
          <PrimaryLink href={`${base}/nouvelle`} className="px-6 py-3">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Nouvelle facture
          </PrimaryLink>
        }
      />

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        {stats.map(({ label, value, icon, accent }) => (
          <StatCard key={label} label={label} value={value} icon={icon} accent={accent} />
        ))}
      </div>
      <p className="mb-8 text-xs text-slate-500">
        {figures.issuedThisMonth} facture{figures.issuedThisMonth !== 1 ? "s" : ""} émise
        {figures.issuedThisMonth !== 1 ? "s" : ""} ce mois-ci. Chiffres hors brouillons ({figures.draftCount}) et
        factures annulées ({figures.cancelledCount}) ; {figures.creditNoteCount} avoir
        {figures.creditNoteCount !== 1 ? "s" : ""} déduit{figures.creditNoteCount !== 1 ? "s" : ""}.
      </p>

      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">
            {filtered ? "Factures filtrées" : "Toutes les factures"}
          </h2>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500" aria-live="polite">
            {pending ? "Chargement…" : `${rows.length} résultat${rows.length !== 1 ? "s" : ""}`}
          </span>
        </div>
        <form
          role="search"
          aria-label="Filtrer les factures"
          onSubmit={(e) => {
            e.preventDefault();
            apply({});
          }}
          className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
        >
          <div>
            <label htmlFor="invoice-filter-state" className="mb-1 block text-xs font-medium text-slate-600">
              Statut
            </label>
            <select
              id="invoice-filter-state"
              value={filters.state ?? ""}
              onChange={(e) => apply({ state: (e.target.value || null) as ListStateFilter | null })}
              className="input-field py-2.5 pl-3 pr-8 sm:w-48"
            >
              <option value="">Tous les statuts</option>
              {LIST_STATE_FILTERS.map((state) => (
                <option key={state} value={state}>
                  {INVOICE_STATE_LABELS[state]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="invoice-filter-kind" className="mb-1 block text-xs font-medium text-slate-600">
              Type
            </label>
            <select
              id="invoice-filter-kind"
              value={filters.kind ?? ""}
              onChange={(e) => apply({ kind: (e.target.value || null) as InvoiceKind | null })}
              className="input-field py-2.5 pl-3 pr-8 sm:w-40"
            >
              <option value="">Factures et avoirs</option>
              {LIST_KIND_FILTERS.map((kind) => (
                <option key={kind} value={kind}>
                  {LIST_KIND_FILTER_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="invoice-filter-q" className="mb-1 block text-xs font-medium text-slate-600">
              Recherche
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="invoice-filter-q"
                type="search"
                placeholder="N° ou client…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field w-full py-2.5 pl-10 pr-4 sm:w-60"
              />
            </div>
          </div>
          <button
            type="submit"
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            Rechercher
          </button>
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-light">
            <FileText className="h-5 w-5 text-brand/60" aria-hidden="true" />
          </div>
          {filtered ? (
            <>
              <p className="font-medium text-slate-600">Aucune facture ne correspond à ces filtres</p>
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  startTransition(() => router.replace(base));
                }}
                className="mt-2 rounded text-sm font-medium text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Effacer les filtres
              </button>
            </>
          ) : (
            <>
              <p className="font-medium text-slate-600">Aucune facture pour le moment</p>
              <p className="mt-1 text-sm text-slate-500">
                Cliquez sur « Nouvelle facture » pour en préparer une.
              </p>
            </>
          )}
        </div>
      ) : (
        <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <div className="space-y-3 md:hidden">
            {rows.map((inv) => (
              <Link
                key={inv.id}
                href={`${base}/${inv.id}`}
                className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.99]"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <p className={`font-mono text-base font-bold ${inv.number ? "text-brand" : "italic text-slate-500"}`}>
                    {documentLabel(inv)}
                  </p>
                  <p className="text-base font-bold tabular-nums text-slate-900">{formatCurrency(inv.total)}</p>
                </div>
                <p className="font-medium text-slate-900">{inv.client.name}</p>
                {inv.creditedInvoice && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    Sur la facture <span className="font-mono">{inv.creditedInvoice.number ?? "sans numéro"}</span>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500">
                  <span>{formatDate(inv.issueDate)}</span>
                  <InvoiceStateBadge state={inv.state} size="sm" />
                </div>
                {inv.balance !== null && (
                  <p className="mt-2 text-sm text-slate-600">
                    Reste à payer :{" "}
                    <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(inv.balance)}</span>
                  </p>
                )}
              </Link>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <caption className="sr-only">Factures et avoirs, les plus récents en premier</caption>
                <thead>
                  <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-brand-light/30 text-xs uppercase tracking-wide text-slate-500">
                    <th scope="col" className="px-5 py-3.5 font-semibold">N°</th>
                    <th scope="col" className="px-5 py-3.5 font-semibold">Client</th>
                    <th scope="col" className="px-5 py-3.5 font-semibold">Date</th>
                    <th scope="col" className="px-5 py-3.5 font-semibold">Statut</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-semibold">Total TTC</th>
                    <th scope="col" className="px-5 py-3.5 text-right font-semibold">Reste à payer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => router.push(`${base}/${inv.id}`)}
                      className="cursor-pointer transition-colors hover:bg-brand-light/40"
                    >
                      <td className="px-5 py-4">
                        <Link
                          href={`${base}/${inv.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={`rounded font-mono font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
                            inv.number ? "text-brand" : "italic text-slate-500"
                          }`}
                        >
                          {documentLabel(inv)}
                        </Link>
                        {inv.creditedInvoice && (
                          <span className="mt-0.5 block text-xs text-slate-500">
                            Sur <span className="font-mono">{inv.creditedInvoice.number ?? "sans numéro"}</span>
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-800">{inv.client.name}</td>
                      <td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(inv.issueDate)}</td>
                      <td className="px-5 py-4">
                        <InvoiceStateBadge state={inv.state} size="sm" />
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right font-semibold tabular-nums text-slate-900">
                        {formatCurrency(inv.total)}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right tabular-nums">
                        {inv.balance === null ? (
                          <span className="text-slate-400" aria-label="Sans objet">—</span>
                        ) : (
                          <span className={inv.balance > 0 ? "font-semibold text-slate-900" : "text-emerald-700"}>
                            {formatCurrency(inv.balance)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {truncated && (
            <p className="mt-3 text-center text-xs text-slate-500">
              Seules les factures les plus récentes sont affichées : affinez avec les filtres ou la recherche.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
