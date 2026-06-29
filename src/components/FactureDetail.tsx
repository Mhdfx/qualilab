"use client";

import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { formatCurrency, formatDate, INVOICE_STATUS_LABELS } from "@/lib/labels";
import { COMPANY } from "@/lib/company";
import { amountToFrenchWords } from "@/lib/number-to-words-fr";
import type { Invoice } from "@/lib/invoice-types";

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const styles =
    status === "PAYEE"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
  const dot = status === "PAYEE" ? "bg-emerald-500" : "bg-amber-500";

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] ring-1 ${styles}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
}

export function FactureDetail({ invoice }: { invoice: Invoice }) {
  function handleDownload() {
    window.print();
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/admin/factures"
          className="inline-flex items-center gap-2 text-sm text-slate-500 transition hover:text-brand"
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

      <div className="print-area relative overflow-hidden rounded-2xl bg-white shadow-xl shadow-slate-300/40 ring-1 ring-slate-100">
        {/* Subtle watermark */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
        >
          <span className="-rotate-[24deg] whitespace-nowrap text-[7rem] font-semibold uppercase tracking-[0.12em] text-slate-900/[0.03]">
            {COMPANY.name}
          </span>
        </div>

        <div className="relative z-10">
          {/* Header band */}
          <div className="flex flex-col gap-6 bg-gradient-to-br from-[#1a3a5c] via-[#234b73] to-[#2d6a9f] px-8 py-10 text-white sm:flex-row sm:items-start sm:justify-between sm:px-10">
            <div>
              <p className="text-3xl font-semibold tracking-tight">Facture</p>
              <p className="mt-2 font-mono text-sm tracking-wide text-white/70">
                {invoice.number}
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:items-end">
              <StatusBadge status={invoice.status} />
              <div className="space-y-1 text-xs sm:text-right">
                <p className="text-white/55">
                  Date d&apos;émission
                  <span className="ml-2 text-sm font-semibold text-white">
                    {formatDate(invoice.issueDate)}
                  </span>
                </p>
                {invoice.dueDate && (
                  <p className="text-white/55">
                    Échéance
                    <span className="ml-2 text-sm font-semibold text-white">
                      {formatDate(invoice.dueDate)}
                    </span>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Parties */}
          <div className="grid grid-cols-1 gap-8 px-8 py-8 sm:grid-cols-2 sm:px-10">
            <div>
              <BrandLogo variant="full" className="mb-4" />
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Émetteur
              </p>
              <p className="text-sm font-semibold text-slate-900">{COMPANY.name}</p>
              <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
                <p>{COMPANY.address}</p>
                <p>{COMPANY.city}</p>
                <p>Tél&nbsp;: {COMPANY.phone}</p>
                <p>{COMPANY.email}</p>
                <p>ICE&nbsp;: {COMPANY.ice} · RC&nbsp;: {COMPANY.rc}</p>
              </div>
            </div>
            <div className="sm:text-right">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                Facturé à
              </p>
              <p className="text-sm font-semibold text-slate-900">{invoice.client.name}</p>
              <div className="mt-2 space-y-1 text-xs leading-relaxed text-slate-500">
                {invoice.client.contact && <p>{invoice.client.contact}</p>}
                {invoice.client.address && <p>{invoice.client.address}</p>}
                {invoice.client.phone && <p>Tél&nbsp;: {invoice.client.phone}</p>}
                {invoice.client.email && <p>{invoice.client.email}</p>}
                {invoice.client.ice && <p>ICE&nbsp;: {invoice.client.ice}</p>}
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="px-8 sm:px-10">
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-[0.08em] text-slate-500">
                    <th className="rounded-l-lg bg-slate-50 px-4 py-3 font-semibold">
                      Désignation
                    </th>
                    <th className="bg-slate-50 px-4 py-3 text-center font-semibold">Qté</th>
                    <th className="bg-slate-50 px-4 py-3 text-right font-semibold">P.U. HT</th>
                    <th className="rounded-r-lg bg-slate-50 px-4 py-3 text-right font-semibold">
                      Total HT
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr key={item.id} className="border-b border-slate-100">
                      <td className="border-b border-slate-100 px-4 py-4 text-slate-800">
                        {item.description}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-center tabular-nums text-slate-500">
                        {item.quantity}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right tabular-nums text-slate-500">
                        {formatCurrency(item.unitPrice)}
                      </td>
                      <td className="border-b border-slate-100 px-4 py-4 text-right font-semibold tabular-nums text-slate-800">
                        {formatCurrency(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="mt-8 flex justify-end">
              <div className="relative w-full max-w-xs pl-5">
                <span className="absolute left-0 top-1 h-[calc(100%-0.5rem)] w-[3px] rounded-full bg-brand" />
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-500">Sous-total HT</span>
                  <span className="tabular-nums text-slate-800">
                    {formatCurrency(invoice.subtotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-slate-500">TVA ({invoice.taxRate}%)</span>
                  <span className="tabular-nums text-slate-800">
                    {formatCurrency(invoice.taxAmount)}
                  </span>
                </div>
                <div className="mt-2 flex items-baseline justify-between rounded-lg bg-brand-light/60 px-4 py-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-brand">
                    Total TTC
                  </span>
                  <span className="text-xl font-semibold tabular-nums text-brand">
                    {formatCurrency(invoice.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* Amount in words */}
            <div className="mt-8 rounded-lg border border-slate-200 px-4 py-3">
              <p className="text-sm leading-relaxed text-slate-600">
                Arrêtée la présente facture à la somme de{" "}
                <span className="font-semibold text-slate-800">
                  {amountToFrenchWords(invoice.total)}
                </span>
                .
              </p>
            </div>

            {/* Payment terms + RIB */}
            <div className="mt-8 grid grid-cols-1 gap-6 rounded-xl bg-slate-50/80 px-6 py-6 sm:grid-cols-2">
              <div>
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Conditions de paiement
                </p>
                <div className="space-y-1 text-xs leading-relaxed text-slate-600">
                  <p>
                    {invoice.dueDate
                      ? `Règlement avant le ${formatDate(invoice.dueDate)}.`
                      : "Règlement à réception de la facture."}
                  </p>
                  {invoice.notes && (
                    <p className="whitespace-pre-line text-slate-500">{invoice.notes}</p>
                  )}
                </div>
              </div>
              <div className="sm:border-l sm:border-slate-200 sm:pl-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
                  Coordonnées bancaires
                </p>
                <div className="space-y-1 text-xs leading-relaxed text-slate-600">
                  <p>{COMPANY.bank}</p>
                  <p>
                    RIB&nbsp;: <span className="tabular-nums">{COMPANY.rib}</span>
                  </p>
                  <p>
                    IBAN&nbsp;: <span className="tabular-nums">{COMPANY.iban}</span>
                  </p>
                  <p>SWIFT&nbsp;: {COMPANY.swift}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t border-slate-100 px-8 py-8 text-center sm:px-10">
            <p className="text-sm text-slate-500">
              Merci de votre confiance — {COMPANY.name}
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
              {COMPANY.address}, {COMPANY.city} · {COMPANY.phone} · {COMPANY.email}
              <br />
              RC&nbsp;: {COMPANY.rc} · ICE&nbsp;: {COMPANY.ice}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
