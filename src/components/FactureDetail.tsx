"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { formatCurrency, formatDate } from "@/lib/labels";
import { COMPANY } from "@/lib/company";
import { amountToFrenchWords } from "@/lib/number-to-words-fr";
import type { Invoice } from "@/lib/invoice-types";

export function FactureDetail({ invoice }: { invoice: Invoice }) {
  function handleDownload() {
    window.print();
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="no-print mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/factures"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-brand"
        >
          <ArrowLeft className="h-4 w-4" />
          Retour aux factures
        </Link>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#234b73] to-[#1a3a5c] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 transition-all hover:from-[#2d6a9f] hover:to-[#1a3a5c] active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            Télécharger (PDF)
          </button>
        </div>
      </div>

      <div className="print-area overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
        {/* Header band */}
        <div className="flex flex-col gap-6 bg-gradient-to-br from-[#1a3a5c] via-[#234b73] to-[#2d6a9f] px-6 py-7 text-white sm:flex-row sm:items-start sm:justify-between sm:px-10 sm:py-8">
          <div>
            <div className="inline-flex rounded-lg bg-white px-3 py-2 shadow-sm">
              <BrandLogo variant="sidebar" />
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-white/75">
              {COMPANY.tagline}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-2xl font-bold tracking-tight sm:text-3xl">FACTURE</p>
            <p className="mt-1 font-mono text-base font-semibold text-white/90">
              {invoice.number}
            </p>
            <div className="mt-3 space-y-0.5 text-xs text-white/75">
              <p>
                Date d&apos;émission :{" "}
                <span className="font-medium text-white">
                  {formatDate(invoice.issueDate)}
                </span>
              </p>
              {invoice.dueDate && (
                <p>
                  Échéance :{" "}
                  <span className="font-medium text-white">
                    {formatDate(invoice.dueDate)}
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Parties */}
        <div className="grid grid-cols-1 gap-6 border-b border-slate-100 px-6 py-6 sm:grid-cols-2 sm:px-10">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Émetteur
            </p>
            <p className="text-sm font-bold text-slate-900">{COMPANY.name}</p>
            <div className="mt-1 space-y-0.5 text-xs text-slate-500">
              <p>{COMPANY.address}</p>
              <p>{COMPANY.city}</p>
              <p>Tél : {COMPANY.phone}</p>
              <p>{COMPANY.email}</p>
              <p>ICE : {COMPANY.ice}</p>
            </div>
          </div>
          <div className="sm:text-right">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
              Facturé à
            </p>
            <p className="text-sm font-bold text-slate-900">{invoice.client.name}</p>
            <div className="mt-1 space-y-0.5 text-xs text-slate-500">
              {invoice.client.contact && <p>{invoice.client.contact}</p>}
              {invoice.client.address && <p>{invoice.client.address}</p>}
              {invoice.client.phone && <p>Tél : {invoice.client.phone}</p>}
              {invoice.client.email && <p>{invoice.client.email}</p>}
              {invoice.client.ice && <p>ICE : {invoice.client.ice}</p>}
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="px-6 py-6 sm:px-10">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b-2 border-brand/15 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-2.5 pr-3 font-semibold">Désignation</th>
                  <th className="px-3 py-2.5 text-center font-semibold">Qté</th>
                  <th className="px-3 py-2.5 text-right font-semibold">P.U. HT</th>
                  <th className="py-2.5 pl-3 text-right font-semibold">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-3 pr-3 font-medium text-slate-800">
                      {item.description}
                    </td>
                    <td className="px-3 py-3 text-center tabular-nums text-slate-600">
                      {item.quantity}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-slate-600">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="py-3 pl-3 text-right font-semibold tabular-nums text-slate-800">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-6 flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Sous-total HT</span>
                <span className="font-medium tabular-nums text-slate-800">
                  {formatCurrency(invoice.subtotal)}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">
                  TVA ({invoice.taxRate}%)
                </span>
                <span className="font-medium tabular-nums text-slate-800">
                  {formatCurrency(invoice.taxAmount)}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-brand px-4 py-3 text-white">
                <span className="text-sm font-semibold">Total TTC</span>
                <span className="text-lg font-bold tabular-nums">
                  {formatCurrency(invoice.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Amount in words */}
          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-3">
            <p className="text-xs text-slate-500">
              Arrêtée la présente facture à la somme de :{" "}
              <span className="font-semibold capitalize text-slate-700">
                {amountToFrenchWords(invoice.total)}
              </span>
              .
            </p>
          </div>

          {invoice.notes && (
            <div className="mt-6">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-400">
                Notes
              </p>
              <p className="whitespace-pre-line text-sm text-slate-600">
                {invoice.notes}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-5 text-center sm:px-10">
          <p className="text-xs font-medium text-slate-500">
            Merci de votre confiance — {COMPANY.name}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {COMPANY.address}, {COMPANY.city} · {COMPANY.phone} · {COMPANY.email} · RC :{" "}
            {COMPANY.rc} · ICE : {COMPANY.ice}
          </p>
        </div>
      </div>
    </div>
  );
}
