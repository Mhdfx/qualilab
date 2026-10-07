"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Trash2, X } from "lucide-react";
import { formatCurrency, formatDecimal } from "@/lib/labels";
import { toLabWallTime } from "@/lib/lab-time";
import {
  checkPayment,
  checkReason,
  PAYMENT_MODE_LABELS,
  RECORDABLE_PAYMENT_MODES,
} from "@/lib/invoice-lifecycle";
import type { PaymentMode } from "@/generated/prisma/enums";
import {
  amountInput,
  creditNoteDraftLines,
  creditNotePreview,
  parseAmount,
  type CreditNoteDraftLine,
  type InvoiceViewItem,
} from "./invoice-view";

/**
 * The dialogs of the invoice fiche (FACTURATION.md §5): confirm an issue or
 * a deletion, give a reason, record a settlement, draw up a credit note.
 * Each one posts to the §4 contract and shows the API's French error as is.
 */

/** Sends a JSON request; resolves with the body, or throws the API's message. */
export async function sendJson(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof data?.error === "string" ? data.error : "L'opération n'a pas pu être enregistrée.");
  }
  return data;
}

function networkMessage(error: unknown) {
  return error instanceof Error && error.message !== "Failed to fetch"
    ? error.message
    : "Une erreur réseau est survenue. Réessayez.";
}

export function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Read through a ref: a parent re-rendering with a new arrow must not
  // re-run the effect and steal the focus back to the first field.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    // The first field (or button) takes the focus; it returns to the
    // button that opened the dialog when it closes.
    const first = panel.current?.querySelector<HTMLElement>(
      "input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button[type=submit]:not([disabled])"
    );
    first?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
    >
      <div
        ref={panel}
        className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl ${wide ? "max-w-3xl" : "max-w-lg"}`}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id={titleId} className="text-base font-semibold text-slate-900">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-sm text-slate-600">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DialogError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}

function DialogActions({
  busy,
  label,
  onClose,
  danger = false,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  onClose: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <button
        type="submit"
        disabled={busy || disabled}
        className={`inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-semibold text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ${
          danger
            ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-600"
            : "bg-brand hover:bg-brand-dark focus-visible:ring-brand"
        }`}
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {busy ? "Enregistrement…" : label}
      </button>
      <button
        type="button"
        onClick={onClose}
        className="inline-flex min-h-[44px] items-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
      >
        Fermer
      </button>
    </div>
  );
}

const LABEL = "block text-xs font-medium text-slate-600";

/** A yes/no question before an action that cannot be undone. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (e) {
      setError(networkMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} description={message} onClose={onClose}>
      <form onSubmit={submit}>
        <DialogError message={error} />
        <DialogActions busy={busy} label={confirmLabel} onClose={onClose} danger={danger} />
      </form>
    </Dialog>
  );
}

/** An action that needs a written reason (cancellation, settlement deletion). */
export function ReasonDialog({
  title,
  message,
  confirmLabel,
  onSubmit,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fieldId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const refusal = checkReason(reason);
    if (refusal) {
      setError(refusal);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onSubmit(reason.trim());
    } catch (e) {
      setError(networkMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog title={title} description={message} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label htmlFor={fieldId} className={LABEL}>
          Motif (obligatoire)
        </label>
        <textarea
          id={fieldId}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          required
          aria-invalid={error ? true : undefined}
          className="input-field mt-1 resize-none px-3"
        />
        <DialogError message={error} />
        <DialogActions busy={busy} label={confirmLabel} onClose={onClose} danger />
      </form>
    </Dialog>
  );
}

/** « Enregistrer un règlement », pre-filled with what is left to pay. */
export function PaymentDialog({
  invoiceId,
  invoiceNumber,
  balanceDue,
  onDone,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  balanceDue: number;
  onDone: () => void;
  onClose: () => void;
}) {
  const [amount, setAmount] = useState(() => amountInput(balanceDue));
  const [mode, setMode] = useState<PaymentMode>("VIREMENT");
  const [today] = useState(() => toLabWallTime(new Date()).slice(0, 10));
  const [paidAt, setPaidAt] = useState(today);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ids = { amount: useId(), mode: useId(), date: useId(), reference: useId(), note: useId() };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const value = parseAmount(amount);
    const refusal = checkPayment(Number.isNaN(value) ? amount : value, balanceDue);
    if (refusal) {
      setError(refusal);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      setError("Indiquez la date du règlement.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJson(`/api/invoices/${invoiceId}/payments`, "POST", {
        amount: value,
        mode,
        paidAt,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(networkMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Enregistrer un règlement — ${invoiceNumber}`}
      description={`Reste à payer : ${formatCurrency(balanceDue)}.`}
      onClose={onClose}
    >
      <form onSubmit={submit} noValidate>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.amount} className={LABEL}>
              Montant (DH)
            </label>
            <input
              id={ids.amount}
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="input-field mt-1 px-3 text-right tabular-nums"
            />
          </div>
          <div>
            <label htmlFor={ids.mode} className={LABEL}>
              Mode de règlement
            </label>
            <select
              id={ids.mode}
              value={mode}
              onChange={(e) => setMode(e.target.value as PaymentMode)}
              className="input-field mt-1 px-3"
            >
              {RECORDABLE_PAYMENT_MODES.map((value) => (
                <option key={value} value={value}>
                  {PAYMENT_MODE_LABELS[value]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.date} className={LABEL}>
              Date du règlement
            </label>
            <input
              id={ids.date}
              type="date"
              value={paidAt}
              max={today}
              onChange={(e) => setPaidAt(e.target.value)}
              required
              className="input-field mt-1 px-3"
            />
          </div>
          <div>
            <label htmlFor={ids.reference} className={LABEL}>
              Référence (optionnel)
            </label>
            <input
              id={ids.reference}
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              maxLength={191}
              placeholder="N° de chèque, de virement…"
              className="input-field mt-1 px-3"
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor={ids.note} className={LABEL}>
              Note (optionnel)
            </label>
            <textarea
              id={ids.note}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={1000}
              className="input-field mt-1 resize-none px-3"
            />
          </div>
        </div>
        <DialogError message={error} />
        <DialogActions busy={busy} label="Enregistrer le règlement" onClose={onClose} />
      </form>
    </Dialog>
  );
}

let freeLineCounter = 0;

/**
 * « Créer un avoir »: lines taken back from the invoice (quantity or price
 * reduced) and free lines, at the invoice's VAT rate, with a reason; the
 * remaining creditable amount is shown and checked before sending.
 */
export function CreditNoteDialog({
  invoiceId,
  invoiceNumber,
  items,
  taxRate,
  remaining,
  onDone,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  items: InvoiceViewItem[];
  taxRate: number;
  remaining: number;
  onDone: (creditNoteId: string | null) => void;
  onClose: () => void;
}) {
  const [lines, setLines] = useState<CreditNoteDraftLine[]>(() => creditNoteDraftLines(items));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const reasonId = useId();
  const summaryId = useId();

  const preview = useMemo(() => creditNotePreview(lines, remaining, taxRate), [lines, remaining, taxRate]);

  function update(key: string, patch: Partial<CreditNoteDraftLine>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function addFreeLine() {
    freeLineCounter += 1;
    setLines((current) => [
      ...current,
      {
        key: `free-${freeLineCounter}`,
        invoiceItemId: null,
        selected: true,
        description: "",
        quantity: "1",
        unitPrice: "",
      },
    ]);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (preview.error) {
      setError(preview.error);
      return;
    }
    const refusal = checkReason(reason);
    if (refusal) {
      setError(refusal);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await sendJson(`/api/invoices/${invoiceId}/credit-notes`, "POST", {
        items: preview.lines,
        reason: reason.trim(),
      });
      onDone(typeof created?.id === "string" ? created.id : null);
    } catch (e) {
      setError(networkMessage(e));
      setBusy(false);
    }
  }

  return (
    <Dialog
      title={`Créer un avoir — ${invoiceNumber}`}
      description={`Montant encore créditable : ${formatCurrency(remaining)} TTC. L'avoir est émis immédiatement et ne s'annule pas.`}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} noValidate aria-describedby={summaryId}>
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Lignes reprises
          </legend>
          <div className="hidden grid-cols-[1.5rem_1fr_5rem_7rem_2.25rem] gap-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
            <span />
            <span>Désignation</span>
            <span className="text-center">Qté</span>
            <span className="text-right">P.U. HT</span>
            <span />
          </div>
          <ul className="space-y-2">
            {lines.map((line, index) => {
              const free = line.invoiceItemId === null;
              const position = `ligne ${index + 1}`;
              return (
                <li
                  key={line.key}
                  className={`grid grid-cols-[1.5rem_1fr] gap-2 rounded-xl border p-2 sm:grid-cols-[1.5rem_1fr_5rem_7rem_2.25rem] sm:items-center ${
                    line.selected ? "border-brand/30 bg-brand-light/30" : "border-slate-200 bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={line.selected}
                    onChange={(e) => update(line.key, { selected: e.target.checked })}
                    aria-label={`Reprendre la ${position}`}
                    className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
                  />
                  {free ? (
                    <input
                      type="text"
                      value={line.description}
                      onChange={(e) => update(line.key, { description: e.target.value })}
                      placeholder="Désignation de la ligne libre"
                      aria-label={`Désignation, ${position}`}
                      maxLength={191}
                      className="input-field px-3 py-2"
                    />
                  ) : (
                    <span className="text-sm text-slate-800">{line.description}</span>
                  )}
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.quantity}
                    onChange={(e) => update(line.key, { quantity: e.target.value })}
                    disabled={!line.selected}
                    aria-label={`Quantité, ${position}`}
                    className="input-field col-start-2 px-2 py-2 text-center tabular-nums disabled:opacity-50 sm:col-start-auto"
                  />
                  <input
                    type="text"
                    inputMode="decimal"
                    value={line.unitPrice}
                    onChange={(e) => update(line.key, { unitPrice: e.target.value })}
                    disabled={!line.selected}
                    placeholder="0.00"
                    aria-label={`Prix unitaire HT, ${position}`}
                    className="input-field col-start-2 px-2 py-2 text-right tabular-nums disabled:opacity-50 sm:col-start-auto"
                  />
                  {free ? (
                    <button
                      type="button"
                      onClick={() => setLines((current) => current.filter((row) => row.key !== line.key))}
                      aria-label={`Retirer la ${position}`}
                      className="col-start-2 flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:col-start-auto"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={addFreeLine}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-light/50 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Ajouter une ligne libre
          </button>
        </fieldset>

        <div className="mt-4">
          <label htmlFor={reasonId} className={LABEL}>
            Motif de l&apos;avoir (obligatoire)
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            maxLength={500}
            required
            className="input-field mt-1 resize-none px-3"
          />
        </div>

        <dl
          id={summaryId}
          className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-slate-50 px-4 py-3 text-sm sm:grid-cols-4"
        >
          <div>
            <dt className="text-xs text-slate-500">Total HT</dt>
            <dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(preview.totals.subtotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">TVA {formatDecimal(taxRate)}&nbsp;%</dt>
            <dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(preview.totals.taxAmount)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Total de l&apos;avoir TTC</dt>
            <dd className="font-bold tabular-nums text-brand">{formatCurrency(preview.totals.total)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Encore créditable</dt>
            <dd className="font-semibold tabular-nums text-slate-800">{formatCurrency(remaining)}</dd>
          </div>
        </dl>

        <DialogError message={error} />
        <DialogActions busy={busy} label="Émettre l'avoir" onClose={onClose} />
      </form>
    </Dialog>
  );
}
