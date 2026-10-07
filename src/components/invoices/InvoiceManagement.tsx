"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, FilePen, FileMinus2, Send, Trash2, Wallet } from "lucide-react";
import { useInvoiceBasePath } from "@/lib/invoice-paths";
import { formatCurrency, formatDate } from "@/lib/labels";
import { PAYMENT_MODE_LABELS } from "@/lib/invoice-lifecycle";
import { Card } from "@/components/ui/Card";
import { InvoiceStateBadge } from "./InvoiceStateBadge";
import { ConfirmDialog, CreditNoteDialog, PaymentDialog, ReasonDialog, sendJson } from "./InvoiceDialogs";
import { documentLabel, invoiceActions, type InvoiceDetailView, type PaymentView } from "./invoice-view";

/**
 * The actions of an invoice fiche (FACTURATION.md §5) and its ledger —
 * settlements and credit notes. What is offered follows the invoice's
 * state through `invoiceActions`; the API checks every request again.
 */

const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";
const NEUTRAL = `${BUTTON} border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50`;
const PRIMARY = `${BUTTON} border-transparent bg-gradient-to-b from-[#234b73] to-[#1a3a5c] text-white shadow-brand/25 hover:from-[#2d6a9f] hover:to-[#1a3a5c]`;
const DANGER = `${BUTTON} border-rose-200 bg-white text-rose-700 hover:border-rose-300 hover:bg-rose-50`;

type Open = "issue" | "deleteDraft" | "payment" | "creditNote" | "cancel" | null;

export function InvoiceActionsBar({ invoice, canManage }: { invoice: InvoiceDetailView; canManage: boolean }) {
  const router = useRouter();
  const base = useInvoiceBasePath();
  const [open, setOpen] = useState<Open>(null);
  const blockedId = useId();
  const actions = invoiceActions(invoice, canManage);
  const label = documentLabel(invoice);
  const close = () => setOpen(null);
  const refresh = () => {
    setOpen(null);
    router.refresh();
  };

  const anything =
    actions.edit || actions.issue || actions.deleteDraft || actions.recordPayment || actions.creditNote || actions.cancel;
  if (!anything) return null;

  return (
    <div className="no-print mb-4">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Actions sur la facture">
        {actions.edit && (
          <Link href={`${base}/${invoice.id}/modifier`} className={NEUTRAL}>
            <FilePen className="h-4 w-4" aria-hidden="true" />
            Modifier
          </Link>
        )}
        {actions.issue && (
          <button type="button" onClick={() => setOpen("issue")} className={PRIMARY}>
            <Send className="h-4 w-4" aria-hidden="true" />
            Émettre
          </button>
        )}
        {actions.deleteDraft && (
          <button type="button" onClick={() => setOpen("deleteDraft")} className={DANGER}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Supprimer le brouillon
          </button>
        )}
        {actions.recordPayment && (
          <button type="button" onClick={() => setOpen("payment")} className={PRIMARY}>
            <Wallet className="h-4 w-4" aria-hidden="true" />
            Enregistrer un règlement
          </button>
        )}
        {actions.creditNote && (
          <button type="button" onClick={() => setOpen("creditNote")} className={NEUTRAL}>
            <FileMinus2 className="h-4 w-4" aria-hidden="true" />
            Créer un avoir
          </button>
        )}
        {actions.cancel && (
          <button
            type="button"
            onClick={() => setOpen("cancel")}
            disabled={actions.cancelBlockedBy !== null}
            aria-describedby={actions.cancelBlockedBy ? blockedId : undefined}
            className={DANGER}
          >
            <Ban className="h-4 w-4" aria-hidden="true" />
            Annuler la facture
          </button>
        )}
      </div>
      {actions.cancel && actions.cancelBlockedBy && (
        <p id={blockedId} className="mt-2 text-xs text-slate-500">
          Annulation impossible : {actions.cancelBlockedBy}
        </p>
      )}

      {open === "issue" && (
        <ConfirmDialog
          title="Émettre la facture"
          message="La facture recevra le prochain numéro FAC-AAAA-NNNN et ne pourra plus jamais être modifiée. Une erreur se corrige ensuite par un avoir."
          confirmLabel="Émettre la facture"
          onConfirm={async () => {
            await sendJson(`/api/invoices/${invoice.id}/issue`, "POST");
            refresh();
          }}
          onClose={close}
        />
      )}
      {open === "deleteDraft" && (
        <ConfirmDialog
          title="Supprimer le brouillon"
          message="Le brouillon sera supprimé définitivement ; ses échantillons seront de nouveau proposés à la facturation."
          confirmLabel="Supprimer le brouillon"
          danger
          onConfirm={async () => {
            await sendJson(`/api/invoices/${invoice.id}`, "DELETE");
            router.push(base);
            router.refresh();
          }}
          onClose={close}
        />
      )}
      {open === "payment" && (
        <PaymentDialog
          invoiceId={invoice.id}
          invoiceNumber={label}
          balanceDue={invoice.balance}
          onDone={refresh}
          onClose={close}
        />
      )}
      {open === "creditNote" && (
        <CreditNoteDialog
          invoiceId={invoice.id}
          invoiceNumber={label}
          items={invoice.items}
          taxRate={invoice.taxRate}
          remaining={invoice.remainingCreditable}
          onDone={(id) => {
            setOpen(null);
            if (id) router.push(`${base}/${id}`);
            router.refresh();
          }}
          onClose={close}
        />
      )}
      {open === "cancel" && (
        <ReasonDialog
          title={`Annuler la facture ${label}`}
          message="Le numéro est conservé et la facture portera la mention « ANNULÉE ». Ses échantillons redeviendront facturables."
          confirmLabel="Annuler la facture"
          onSubmit={async (reason) => {
            await sendJson(`/api/invoices/${invoice.id}/cancel`, "POST", { reason });
            refresh();
          }}
          onClose={close}
        />
      )}
    </div>
  );
}

/** Settlements and credit notes of an issued invoice; the origin of a credit note. */
export function InvoiceLedger({ invoice, canManage }: { invoice: InvoiceDetailView; canManage: boolean }) {
  const router = useRouter();
  const base = useInvoiceBasePath();
  const [deleting, setDeleting] = useState<PaymentView | null>(null);
  const actions = invoiceActions(invoice, canManage);

  if (invoice.kind === "AVOIR") {
    const origin = invoice.creditedInvoice;
    return (
      <Card className="no-print mt-6 p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Facture d&apos;origine</h2>
        {origin ? (
          <p className="mt-3 text-sm text-slate-700">
            Cet avoir se rapporte à la facture{" "}
            <Link
              href={`${base}/${origin.id}`}
              className="rounded font-mono font-semibold text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              {origin.number ?? "sans numéro"}
            </Link>{" "}
            du {formatDate(origin.issueDate)} ({formatCurrency(origin.total)} TTC).
          </p>
        ) : (
          <p className="mt-3 text-sm text-slate-500">La facture d&apos;origine n&apos;existe plus.</p>
        )}
      </Card>
    );
  }

  if (invoice.status === "BROUILLON") return null;

  return (
    <div className="no-print mt-6 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_320px]">
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Règlements</h2>
        {invoice.payments.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-500">Aucun règlement enregistré.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <caption className="sr-only">Règlements reçus pour cette facture</caption>
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-2 py-2 font-semibold">Date</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Mode</th>
                  <th scope="col" className="px-2 py-2 font-semibold">Référence</th>
                  <th scope="col" className="px-2 py-2 text-right font-semibold">Montant</th>
                  {actions.deletePayment && (
                    <th scope="col" className="px-2 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoice.payments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="whitespace-nowrap px-2 py-2.5 text-slate-700">{formatDate(payment.paidAt)}</td>
                    <td className="px-2 py-2.5 text-slate-700">{PAYMENT_MODE_LABELS[payment.mode]}</td>
                    <td className="px-2 py-2.5 text-slate-600">
                      {payment.reference ?? <span className="text-slate-400">—</span>}
                      {payment.note && <span className="mt-0.5 block text-xs text-slate-500">{payment.note}</span>}
                      {payment.createdBy && (
                        <span className="mt-0.5 block text-[11px] text-slate-400">Saisi par {payment.createdBy}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-right font-semibold tabular-nums text-slate-900">
                      {formatCurrency(payment.amount)}
                    </td>
                    {actions.deletePayment && (
                      <td className="px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => setDeleting(payment)}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Supprimer
                          <span className="sr-only">
                            {" "}
                            le règlement de {formatCurrency(payment.amount)} du {formatDate(payment.paidAt)}
                          </span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <dl className="mt-4 space-y-1.5 border-t border-slate-100 pt-3 text-sm">
          <Row label="Total TTC" value={formatCurrency(invoice.total)} />
          {invoice.creditedAmount > 0 && <Row label="Avoirs" value={`− ${formatCurrency(invoice.creditedAmount)}`} />}
          <Row label="Réglé" value={`− ${formatCurrency(invoice.paidAmount)}`} />
          {invoice.status !== "ANNULEE" && (
            <Row label="Reste à payer" value={formatCurrency(invoice.balance)} strong />
          )}
        </dl>
      </Card>

      <Card className="p-5 lg:self-start">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Avoirs</h2>
        {invoice.creditNotes.length === 0 ? (
          <p className="py-2 text-sm text-slate-500">Aucun avoir sur cette facture.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {invoice.creditNotes.map((note) => (
              <li key={note.id} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  href={`${base}/${note.id}`}
                  className="min-w-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <span className="block font-mono text-sm font-semibold text-brand">{note.number ?? "Avoir"}</span>
                  <span className="block text-xs text-slate-500">{formatDate(note.issueDate)}</span>
                </Link>
                <span className="flex items-center gap-2">
                  <InvoiceStateBadge state="AVOIR" size="sm" />
                  <span className="text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(note.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {invoice.status !== "ANNULEE" && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            Montant encore créditable :{" "}
            <span className="font-semibold tabular-nums text-slate-700">{formatCurrency(invoice.remainingCreditable)}</span>
          </p>
        )}
      </Card>

      {deleting && (
        <ReasonDialog
          title="Supprimer le règlement"
          message={`Règlement de ${formatCurrency(deleting.amount)} du ${formatDate(deleting.paidAt)} (${PAYMENT_MODE_LABELS[deleting.mode]}). La suppression est inscrite au journal ; la facture repasse en attente s'il reste un montant à payer.`}
          confirmLabel="Supprimer le règlement"
          onSubmit={async (reason) => {
            await sendJson(`/api/invoices/${invoice.id}/payments/${deleting.id}`, "DELETE", { reason });
            setDeleting(null);
            router.refresh();
          }}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${strong ? "pt-1 text-base font-bold text-slate-900" : "text-slate-600"}`}>
      <dt>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}
