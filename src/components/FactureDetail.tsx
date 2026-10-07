"use client";

import Link from "next/link";
import { useInvoiceBasePath } from "@/lib/invoice-paths";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { formatCurrency, formatDate, formatDecimal } from "@/lib/labels";
import type { CompanyInfo } from "@/lib/company";
import { computeInvoiceTotals } from "@/lib/invoice-math";
import { INVOICE_NOTICE_LABELS, invoiceNotices } from "@/lib/invoice-notices";
import { InvoiceStateBadge } from "@/components/invoices/InvoiceStateBadge";
import { InvoiceActionsBar, InvoiceLedger } from "@/components/invoices/InvoiceManagement";
import { collectable, documentLabel, type InvoiceDetailView } from "@/components/invoices/invoice-view";

const INVOICE_BLUE = "#4472C4";
const INVOICE_BLUE_LIGHT = "#DDEBF7";

function formatInvoiceDate(date: Date | string) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(date));
}

/**
 * The invoice fiche (FACTURATION.md §5): the document as printed, its
 * readable state, the actions its state allows, its settlements and its
 * credit notes. A credit note shows the same sheet titled « Avoir » and
 * links back to the invoice it corrects.
 */
export function FactureDetail({
  invoice,
  company,
  canManage = false,
}: {
  invoice: InvoiceDetailView;
  company: CompanyInfo;
  /** COMPTABLE and ADMIN act on the invoice; the others only read it. */
  canManage?: boolean;
}) {
  // The recap lists the standard rates plus whatever rate this invoice
  // actually carries, so an unusual rate never prints an all-dash recap.
  const vatRates = [invoice.taxRate, 20, 10, 5.5]
    .filter((rate, index, all) => all.indexOf(rate) === index)
    .sort((a, b) => b - a);
  const base = useInvoiceBasePath();
  function handlePrint() {
    window.print();
  }

  const isCreditNote = invoice.kind === "AVOIR";
  const isDraft = invoice.status === "BROUILLON" && !isCreditNote;
  const isCancelled = invoice.status === "ANNULEE";
  const showBalance = collectable(invoice.state);
  const label = documentLabel(invoice);
  const clientNumber = invoice.client.ice ?? invoice.client.id.slice(-8).toUpperCase();
  // Billed on the programme (PROGRAMME.md §6): say so while the results are
  // not validated, and flag a line cancelled after it was billed.
  const notices = isCreditNote ? [] : invoiceNotices(invoice.items);
  // The per-line VAT is shown for reading only; the totals are the stored
  // ones — those the number was issued with, the PDF prints and « Reste à
  // payer » is computed from — never recomputed on screen.
  const { lines: lineAmounts } = computeInvoiceTotals(invoice.items, invoice.taxRate);
  const { subtotal, taxAmount, total } = invoice;

  return (
    <div className="mx-auto max-w-[210mm]">
      <div className="no-print mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href={base}
          className="inline-flex items-center gap-2 rounded text-sm text-slate-500 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour aux factures
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-slate-600">
            <span className="font-mono font-semibold text-slate-900">{label}</span>
            <InvoiceStateBadge state={invoice.state} />
          </span>
          {showBalance && (
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              Reste à payer : <span className="tabular-nums">{formatCurrency(invoice.balance)}</span>
            </span>
          )}
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand active:scale-[0.98]"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimer
          </button>
          {/* Rendered server-side, like the analysis report: selectable text
              and real page breaks rather than a screenshot of this page. */}
          <a
            href={`/api/invoices/${invoice.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#234b73] to-[#1a3a5c] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-brand/25 transition-all hover:from-[#2d6a9f] hover:to-[#1a3a5c] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.98]"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger (PDF)
          </a>
        </div>
      </div>

      <InvoiceActionsBar invoice={invoice} canManage={canManage} />

      {isDraft && (
        <p role="status" className="no-print mb-4 rounded-xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <b>Brouillon</b> — cette facture n&apos;a pas encore de numéro et reste modifiable. Ses
          échantillons sont réservés : ils ne sont plus proposés sur une autre facture.
        </p>
      )}

      {isCancelled && (
        <p role="status" className="no-print mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <b>Facture annulée</b>
          {invoice.cancelledAt ? ` le ${formatDate(invoice.cancelledAt)}` : ""}
          {invoice.cancelledBy ? ` par ${invoice.cancelledBy}` : ""}
          {invoice.cancelReason ? ` — motif : ${invoice.cancelReason}` : ""}. Son numéro est conservé ; ses
          échantillons sont de nouveau facturables.
        </p>
      )}

      {isCreditNote && (
        <p role="status" className="no-print mb-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <b>Avoir</b>
          {invoice.creditedInvoice ? (
            <>
              {" "}— se rapporte à la facture{" "}
              <Link
                href={`${base}/${invoice.creditedInvoice.id}`}
                className="rounded font-mono font-semibold underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {invoice.creditedInvoice.number ?? "sans numéro"}
              </Link>{" "}
              du {formatDate(invoice.creditedInvoice.issueDate)}.
            </>
          ) : (
            " — la facture d'origine n'existe plus."
          )}
        </p>
      )}

      {notices.length > 0 && (
        <div className="no-print mb-4 space-y-2" aria-label="Avertissements de facturation">
          {notices.map((notice) => (
            <p
              key={notice.kind}
              role="status"
              className={`rounded-xl border px-4 py-3 text-sm ${
                notice.kind === "CANCELLED"
                  ? "border-rose-200 bg-rose-50 text-rose-800"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              <b>{INVOICE_NOTICE_LABELS[notice.kind].title}</b> — {INVOICE_NOTICE_LABELS[notice.kind].hint}{" "}
              <span className="font-mono">{notice.references.join(", ")}</span>
            </p>
          ))}
        </div>
      )}

      <div
        className="print-area invoice-sheet relative flex min-h-[277mm] flex-col overflow-hidden rounded-lg bg-white shadow-lg ring-1 ring-slate-200"
      >
        {isDraft && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <span className="-rotate-[30deg] select-none text-[88px] font-black tracking-[0.2em] text-slate-300/50">
              BROUILLON
            </span>
          </div>
        )}
        {isCancelled && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[38%] z-10 flex justify-center">
            <div className="-rotate-12 rounded-lg border-4 border-rose-600/70 bg-white/60 px-6 py-3 text-center text-rose-700/80">
              <p className="text-5xl font-black tracking-[0.2em]">ANNULÉE</p>
              {invoice.cancelledAt && (
                <p className="mt-1 text-sm font-semibold">le {formatInvoiceDate(invoice.cancelledAt)}</p>
              )}
              {invoice.cancelReason && <p className="mt-0.5 max-w-xs text-xs">Motif : {invoice.cancelReason}</p>}
            </div>
          </div>
        )}
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
          <p className="font-bold text-slate-900">{company.name}</p>
          <p>{company.address}</p>
          <p>{company.city}</p>
          <p>Tél : {company.phone}</p>
          <p>{company.email}</p>
        </div>

        {/* Métadonnées facture */}
        <div
          className="mx-6 mt-3 grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-[11px] text-white sm:grid-cols-5"
          style={{ backgroundColor: INVOICE_BLUE }}
        >
          <div>
            <p className="opacity-85">{isCreditNote ? "Avoir N°" : "Facture N°"}</p>
            <p className="font-bold">{label}</p>
          </div>
          <div>
            <p className="opacity-85">{isCreditNote ? "Facture d'origine" : "N° Devis"}</p>
            <p className="font-bold">
              {isCreditNote ? (invoice.creditedInvoice?.number ?? "—") : "—"}
            </p>
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
                    {formatDecimal(invoice.taxRate)}&nbsp;%
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
                {vatRates.map((rate) => {
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
                        {formatDecimal(rate)}&nbsp;%
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
                {showBalance && invoice.creditedAmount > 0 && (
                  <tr>
                    <td className="py-0.5 opacity-90">Avoirs</td>
                    <td className="py-0.5 text-right font-semibold tabular-nums">
                      − {formatCurrency(invoice.creditedAmount)}
                    </td>
                  </tr>
                )}
                {showBalance && invoice.paidAmount > 0 && (
                  <tr>
                    <td className="py-0.5 opacity-90">Réglé</td>
                    <td className="py-0.5 text-right font-semibold tabular-nums">
                      − {formatCurrency(invoice.paidAmount)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="border-t border-white/30 pt-2 font-bold">
                    {isCreditNote ? "Montant de l'avoir" : showBalance ? "Reste à payer" : "Net à payer"}
                  </td>
                  <td className="border-t border-white/30 pt-2 text-right text-sm font-bold tabular-nums">
                    {formatCurrency(showBalance ? invoice.balance : total)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Pied de page — ancré en bas de la page */}
        <div className="invoice-footer mx-6 mt-auto grid grid-cols-1 gap-4 border-t border-slate-200 px-0 py-4 pb-6 text-[11px] leading-relaxed text-slate-600 sm:grid-cols-2">
          <div>
            {isCreditNote ? (
              <>
                <p className="mb-1 font-bold text-slate-800">Avoir</p>
                <p>
                  {invoice.creditedInvoice
                    ? `Se rapporte à la facture ${invoice.creditedInvoice.number ?? ""} du ${formatInvoiceDate(invoice.creditedInvoice.issueDate)} et vient en déduction de son montant.`
                    : "Vient en déduction de la facture d'origine."}
                </p>
              </>
            ) : (
              <>
                <p className="mb-1 font-bold text-slate-800">Conditions de paiement</p>
                <p>
                  {invoice.dueDate
                    ? `Règlement avant le ${formatInvoiceDate(invoice.dueDate)}.`
                    : "Règlement à réception de la facture."}
                </p>
              </>
            )}
            {invoice.notes && (
              <p className="mt-1 whitespace-pre-line text-slate-500">{invoice.notes}</p>
            )}
          </div>
          <div>
            <p className="mb-1 font-bold text-slate-800">Coordonnées bancaires</p>
            <p>{company.bank}</p>
            <p>
              IBAN : <span className="tabular-nums">{company.iban}</span>
            </p>
            <p>
              BIC : <span className="tabular-nums">{company.swift}</span>
            </p>
            <p>
              RIB : <span className="tabular-nums">{company.rib}</span>
            </p>
          </div>
        </div>
      </div>

      <InvoiceLedger invoice={invoice} canManage={canManage} />
    </div>
  );
}
