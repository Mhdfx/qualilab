"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FileText, Plus, Search, Receipt, Wallet, FileBarChart } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { LoadingState } from "@/components/ui/LoadingState";
import { PrimaryLink } from "@/components/PrimaryButton";
import { formatCurrency, formatDate } from "@/lib/labels";
import type { Invoice } from "@/lib/invoice-types";

export function FacturesList() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/invoices")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setInvoices(data);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.number.toLowerCase().includes(q) ||
        inv.client.name.toLowerCase().includes(q)
    );
  }, [invoices, search]);

  const totalBilled = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const thisMonth = invoices.filter((inv) => {
    const d = new Date(inv.issueDate);
    const now = new Date();
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const stats = [
    { label: "Factures émises", value: invoices.length, icon: Receipt, accent: "brand" as const },
    { label: "Ce mois-ci", value: thisMonth, icon: FileBarChart, accent: "blue" as const },
    {
      label: "Montant total",
      value: formatCurrency(totalBilled),
      icon: Wallet,
      accent: "emerald" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader
        badge="Administration"
        title="Factures"
        subtitle="Créez, consultez et téléchargez les factures clients"
        action={
          <PrimaryLink href="/admin/factures/nouvelle" className="px-6 py-3">
            <Plus className="h-4 w-4" />
            Nouvelle facture
          </PrimaryLink>
        }
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        {stats.map(({ label, value, icon, accent }) => (
          <StatCard key={label} label={label} value={value} icon={icon} accent={accent} />
        ))}
      </div>

      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-slate-800">Toutes les factures</h2>
          {!loading && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-500">
              {filtered.length} résultat{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Rechercher (n° ou client)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field w-full py-2.5 pl-10 pr-4 sm:w-72"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-light">
            <FileText className="h-5 w-5 text-brand/60" />
          </div>
          <p className="font-medium text-slate-600">Aucune facture pour le moment</p>
          <p className="mt-1 text-sm text-slate-400">
            Cliquez sur « Nouvelle facture » pour en générer une.
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3 md:hidden">
            {filtered.map((inv) => (
              <Link
                key={inv.id}
                href={`/admin/factures/${inv.id}`}
                className="block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:border-slate-300 hover:shadow-md active:scale-[0.99]"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <p className="font-mono text-base font-bold text-brand">{inv.number}</p>
                  <p className="text-base font-bold text-slate-900">
                    {formatCurrency(inv.total)}
                  </p>
                </div>
                <p className="font-medium text-slate-900">{inv.client.name}</p>
                <p className="mt-2 text-sm text-slate-500">{formatDate(inv.issueDate)}</p>
              </Link>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm md:block">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-brand-light/30 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3.5 font-semibold">N° Facture</th>
                    <th className="px-5 py-3.5 font-semibold">Client</th>
                    <th className="px-5 py-3.5 font-semibold">Date</th>
                    <th className="px-5 py-3.5 text-right font-semibold">Total TTC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((inv) => (
                    <tr
                      key={inv.id}
                      onClick={() => {
                        window.location.href = `/admin/factures/${inv.id}`;
                      }}
                      className="cursor-pointer transition-colors hover:bg-brand-light/40"
                    >
                      <td className="px-5 py-4">
                        <span className="font-mono font-semibold text-brand">{inv.number}</span>
                      </td>
                      <td className="px-5 py-4 font-medium text-slate-800">{inv.client.name}</td>
                      <td className="px-5 py-4 text-slate-500">{formatDate(inv.issueDate)}</td>
                      <td className="px-5 py-4 text-right font-semibold text-slate-900">
                        {formatCurrency(inv.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
