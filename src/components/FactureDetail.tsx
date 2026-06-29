"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { formatCurrency } from "@/lib/labels";
import { COMPANY } from "@/lib/company";
import { downloadInvoicePdf } from "@/lib/download-invoice-pdf";
import { computeInvoiceTotals } from "@/lib/invoice-math";
import type { Invoice } from "@/lib/invoice-types";

const INVOICE_BLUE = "#4472C4";
const INVOICE_BLUE_LIGHT = "#DDEBF7";

function formatInvoiceDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

const VAT_RATES = [20, 10, 5.5] as const;

export function FactureDetail({ invoice }: { invoice: Invoice }) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  function handlePrint() {
    window.print();
  }

  async function handleDownloadPdf() {
    const sheet = sheetRef.current;
    if (!sheet) return;

    setDownloading(true);
    try {
      await downloadInvoicePdf(sheet, `${invoice.number}.pdf`);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("Impossible de générer le PDF. Réessayez ou utilisez Imprimer.");
    } finally {
      setDownloading(false);
    }
  }

  const clientNumber = invoice.client.ice ?? invoice.client.id.slice(-8).toUpperCase();
  const { subtotal, taxAmount, total, lines: lineAmounts } = computeInvoiceTotals(
    invoice.items,
    invoice.taxRate
  );

  return (
    <div className="mx-auto max-w-[210mm]">
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
            onClick={handlePrint}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98]"
          >
            <Printer className="h-4 w-4" />
            Imprimer
          </button>
          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={downloading}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#234b73] to-[#1a3a5c] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 transition-all hover:from-[#2d6a9f] hover:to-[#1a3a5c] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Download className="h-4 w-4" />
            {downloading ? "Génération…" : "Télécharger (PDF)"}
          </button>
        </div>
      </div>

      <div
        ref={sheetRef}
        className="print-area invoice-sheet flex min-h-[277mm] flex-col overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-200"
      >
        {/* Logo + client */}
        <div className="flex items-start justify-between gap-6 px-6 pt-6 pb-4">
          <BrandLogo variant="invoice" className="w-[200px] sm:w-[240px]" />
          <div className="min-w-0 text-right text-[11px] leading-relaxed text-slate-700">
            <p className="mb-1 text-xs font-bold text-slate-900">Votre client</p>
            <p className="font-semibold text-slate-900">{invoice.client.name}</p>
            {invoice.client.address && <p>{invoice.client.address}</p>}
            {invoice.client.contact && <p>{invoice.client.contact}</p>}
            {invoice.client.phone && <p>Tél : {invoice.client.phone}</p>}
            {invoice.client.email && <p>{invoice.client.email}</p>}
          </div>
        </div>

        {/* Émetteur */}
        <div
          className="mx-6 px-4 py-3 text-[11px] leading-relaxed text-slate-700"
          style={{ backgroundColor: INVOICE_BLUE_LIGHT }}
        >
          <p className="font-bold text-slate-900">{COMPANY.name}</p>
          <p>{COMPANY.address}</p>
          <p>{COMPANY.city}</p>
          <p>Tél : {COMPANY.phone}</p>
          <p>{COMPANY.email}</p>
        </div>

        {/* Métadonnées facture */}
        <div
          className="mx-6 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[11px] text-white sm:grid-cols-5"
          style={{ backgroundColor: INVOICE_BLUE }}
        >
          <div>
            <p className="opacity-85">Facture N°</p>
            <p className="font-bold">{invoice.number}</p>
          </div>
          <div>
            <p className="opacity-85">N° Devis</p>
            <p className="font-bold">—</p>
          </div>
          <div>
            <p className="opacity-85">N° Client</p>
            <p className="font-bold">{clientNumber}</p>
          </div>
          <div>
            <p className="opacity-85">En date du</p>
            <p className="font-bold">{formatInvoiceDate(invoice.issueDate)}</p>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="opacity-85">Échéance au</p>
            <p className="font-bold">
              {invoice.dueDate ? formatInvoiceDate(invoice.dueDate) : "—"}
            </p>
          </div>
        </div>

        {/* Lignes de prestation */}
        <div className="mx-6 mt-3 overflow-x-auto">
          <table className="min-w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-white" style={{ backgroundColor: INVOICE_BLUE }}>
                <th className="px-2 py-2 text-left font-semibold">Description</th>
                <th className="w-14 px-2 py-2 text-center font-semibold">Unité</th>
                <th className="w-12 px-2 py-2 text-center font-semibold">Qté</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">P.U. HT</th>
                <th className="w-14 px-2 py-2 text-center font-semibold">TVA</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">Montant TVA</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">Total HT</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">Total TTC</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => {
                const amounts = lineAmounts[index];
                return (
                <tr
                  key={item.id}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50/80"}
                >
                  <td className="border-b border-slate-200 px-2 py-1.5 text-slate-800">
                    {item.description}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-center text-slate-600">
                    u.
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-700">
                    {item.quantity}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-700">
                    {formatCurrency(item.unitPrice)}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-center tabular-nums text-slate-600">
                    {invoice.taxRate}&nbsp;%
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-right tabular-nums text-slate-700">
                    {formatCurrency(amounts.lineVat)}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-right tabular-nums font-medium text-slate-800">
                    {formatCurrency(amounts.lineHt)}
                  </td>
                  <td className="border-b border-slate-200 px-2 py-1.5 text-right tabular-nums font-semibold text-slate-900">
                    {formatCurrency(amounts.lineTtc)}
                  </td>
                </tr>
              );
              })}
            </tbody>
          </table>
        </div>

        {/* TVA + totaux */}
        <div className="mx-6 mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse text-[11px]">
              <thead>
                <tr className="text-white" style={{ backgroundColor: INVOICE_BLUE }}>
                  <th className="px-2 py-1.5 text-right font-semibold">Total HT</th>
                  <th className="px-2 py-1.5 text-center font-semibold">Taux TVA</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total TVA</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Total TTC</th>
                </tr>
              </thead>
              <tbody>
                {VAT_RATES.map((rate) => {
                  const active = Math.abs(rate - invoice.taxRate) < 0.01;
                  const rowHt = active ? subtotal : 0;
                  const rowVat = active ? taxAmount : 0;
                  const rowTtc = active ? total : 0;
                  return (
                    <tr key={rate} className="border-b border-slate-200">
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {active ? formatCurrency(rowHt) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums text-slate-600">
                        {rate}&nbsp;%
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {active ? formatCurrency(rowVat) : "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-700">
                        {active ? formatCurrency(rowTtc) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className="min-w-[220px] px-4 py-3 text-[11px] text-white sm:w-[240px]"
            style={{ backgroundColor: INVOICE_BLUE }}
          >
            <table className="w-full border-collapse">
              <tbody>
                <tr>
                  <td className="py-0.5 opacity-90">Total HT</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">
                    {formatCurrency(subtotal)}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 opacity-90">Total TVA</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">
                    {formatCurrency(taxAmount)}
                  </td>
                </tr>
                <tr>
                  <td className="py-0.5 opacity-90">Total TTC</td>
                  <td className="py-0.5 text-right font-semibold tabular-nums">
                    {formatCurrency(total)}
                  </td>
                </tr>
                <tr>
                  <td className="border-t border-white/30 pt-2 font-bold">Net à payer</td>
                  <td className="border-t border-white/30 pt-2 text-right text-sm font-bold tabular-nums">
                    {formatCurrency(total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Pied de page — ancré en bas de la page */}
        <div className="invoice-footer mx-6 mt-auto grid grid-cols-1 gap-4 border-t border-slate-200 px-0 py-4 pb-6 text-[11px] leading-relaxed text-slate-600 sm:grid-cols-2">
          <div>
            <p className="mb-1 font-bold text-slate-800">Conditions de paiement</p>
            <p>
              {invoice.dueDate
                ? `Règlement avant le ${formatInvoiceDate(invoice.dueDate)}.`
                : "Règlement à réception de la facture."}
            </p>
            {invoice.notes && (
              <p className="mt-1 whitespace-pre-line text-slate-500">{invoice.notes}</p>
            )}
          </div>
          <div>
            <p className="mb-1 font-bold text-slate-800">Coordonnées bancaires</p>
            <p>{COMPANY.bank}</p>
            <p>
              IBAN : <span className="tabular-nums">{COMPANY.iban}</span>
            </p>
            <p>
              BIC : <span className="tabular-nums">{COMPANY.swift}</span>
            </p>
            <p>
              RIB : <span className="tabular-nums">{COMPANY.rib}</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
