"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Ban,
  CheckCircle2,
  Download,
  FileWarning,
  Pencil,
  ReceiptText,
  RotateCcw,
  Search,
  Wallet,
} from "lucide-react";
import type { PaymentMode } from "@/generated/prisma/enums";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDate, formatDecimal } from "@/lib/labels";
import { formatDateOnly, parseIsoDay } from "@/lib/date-only";
import type { DueState } from "@/lib/stock";
import { PURCHASE_PAYMENT_METHODS, PURCHASE_PAYMENT_METHOD_LABELS, type PurchaseStatus } from "@/lib/purchase-invoice";
import {
  CERTIFICATE_STATE_LABELS,
  WITHHOLDING_BASE_LABELS,
  certificateEndDay,
  certificateState,
  netToPay,
  parseRate,
  proposedWithholdingRate,
  withholdingAmountFor,
  withholdingApplies,
  withholdingRefusal,
  type CertificateState,
  type WithholdingSettings,
} from "@/lib/withholding";
import { monthOf, purchaseJournalHref } from "@/lib/purchase-journal";

/**
 * Supplier invoices (lot 3D, RETOUR-LABO-28-10.md M1, M2, M6, M7): recorded
 * with their HT, VAT and TTC, the attestation de régularité fiscale and the
 * retenue à la source; paid in one or several payments (day, method,
 * reference); corrected or cancelled (« Annuler la saisie ») while nothing
 * is paid. The list is filtered and paged without a ceiling; the « Journal
 * des achats » exports a month or a year. The due badges use the same
 * dueState() the dashboard alerts use.
 */

export type PurchasePaymentRow = { id: string; paidOn: string; amount: number; method: PaymentMode; reference: string | null };

export type PurchaseInvoiceRow = {
  id: string;
  number: string;
  label: string | null;
  amount: number;
  amountHT: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  currency: string | null;
  amountForeign: number | null;
  exchangeRate: number | null;
  issueDate: string;
  dueDate: string;
  issueDay: string;
  dueDay: string;
  status: PurchaseStatus;
  statusLabel: string;
  due: DueState;
  paidAt: string | null;
  paymentMethod: PaymentMode | null;
  paymentReference: string | null;
  taxCertificateProvided: boolean | null;
  taxCertificateDay: string | null;
  certificate: CertificateState;
  withholdingRate: number | null;
  withholdingAmount: number | null;
  net: number;
  paid: number;
  remaining: number;
  correctable: boolean;
  correctedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  payments: PurchasePaymentRow[];
  supplier: { id: string; name: string };
};

export type SupplierOption = {
  id: string;
  name: string;
  archived: boolean;
  paymentTermDays: number;
  withholdingSubject: boolean;
  taxCertificateDay: string | null;
  taxCertificateValidUntil: string | null;
};

type Summary = { unpaidCount: number; paidCount: number; remaining: number };
type ListPage = { items: PurchaseInvoiceRow[]; nextCursor: string | null; summary: Summary };
type Filters = { vue: string; fournisseur: string; periode: string; q: string };
type Settings = { defaultVatRate: number; withholding: WithholdingSettings };

const inputClass = "input-field px-3 text-sm" as const;
const primaryButton =
  "inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50";
const secondaryButton =
  "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-600 transition hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

const day = (iso: string | null) => (iso ? formatDateOnly(parseIsoDay(iso) ?? new Date(iso)) : "");
const toNumber = (value: string) => Number(value.trim().replace(/\s/g, "").replace(",", "."));
const cents = (value: number) => Math.round(value * 100);

function query(filters: Filters, cursor?: string | null) {
  const params = new URLSearchParams({ paged: "1" });
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (cursor) params.set("cursor", cursor);
  return `/api/purchase-invoices?${params.toString()}`;
}

async function send(url: string, method: string, body?: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: (data as { error?: string }).error ?? "Action impossible." };
    return { ok: true, data };
  } catch {
    return { ok: false, error: "Une erreur réseau est survenue. Réessayez." };
  }
}

export function PurchaseInvoicesManager({
  initial,
  initialFilters,
  suppliers,
  settings,
  today,
  partialPayments,
  paymentRequiresCertificate,
}: {
  initial: ListPage;
  initialFilters: Filters;
  suppliers: SupplierOption[];
  settings: Settings;
  /** The lab's today, « AAAA-MM-JJ ». */
  today: string;
  /** `PURCHASE_PARTIAL_PAYMENTS` (lab-proposals.ts). */
  partialPayments: boolean;
  /** `PAYMENT_REQUIRES_TAX_CERTIFICATE` (lab-proposals.ts). */
  paymentRequiresCertificate: boolean;
}) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState<ListPage>(initial);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [open, setOpen] = useState<{ id: string; panel: "pay" | "correct" | "cancel" | "payments" } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const activeSuppliers = suppliers.filter((supplier) => !supplier.archived);

  const load = useCallback(async (next: Filters) => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(query(next));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Chargement impossible.");
      setPage(data);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  async function loadMore() {
    if (!page.nextCursor || loading) return;
    setLoading(true);
    try {
      const response = await fetch(query(filters, page.nextCursor));
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Chargement impossible.");
      setPage((current) => ({ items: [...current.items, ...data.items], nextCursor: data.nextCursor, summary: data.summary }));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }

  function applyFilters(next: Filters) {
    setFilters(next);
    setOpen(null);
    void load(next);
  }

  /** A changed invoice replaces its row in place (the pages loaded stay); the totals are re-read. */
  function replaced(row: PurchaseInvoiceRow, message: string) {
    setNotice(message);
    setOpen(null);
    setPage((current) => ({ ...current, items: current.items.map((item) => (item.id === row.id ? row : item)) }));
    void fetch(`${query(filters)}&limit=1`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ListPage | null) => {
        if (data) setPage((current) => ({ ...current, summary: data.summary }));
      })
      .catch(() => undefined);
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500" aria-live="polite">
          {page.summary.unpaidCount} à payer · reste{" "}
          <span className="font-semibold text-slate-700">{formatCurrency(page.summary.remaining)}</span> ·{" "}
          {page.summary.paidCount} payée{page.summary.paidCount > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            setCreating((current) => !current);
            setNotice("");
          }}
          disabled={activeSuppliers.length === 0}
          className={primaryButton}
        >
          <ReceiptText className="h-4 w-4" aria-hidden="true" />
          {creating ? "Fermer" : "Nouvelle facture"}
        </button>
      </div>

      {activeSuppliers.length === 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Créez d&apos;abord un fournisseur — chaque facture s&apos;y rattache.
        </p>
      )}

      <ExportPanel today={today} />

      <FilterBar filters={filters} suppliers={suppliers} onApply={applyFilters} />

      {creating && (
        <InvoiceForm
          suppliers={activeSuppliers}
          settings={settings}
          today={today}
          onDone={(row) => {
            setCreating(false);
            setNotice(`Facture ${row.number} enregistrée.`);
            void load(filters);
          }}
          onError={setError}
        />
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {notice && !error && (
        <p role="status" className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      )}

      {page.items.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          {filters.vue === "a_payer"
            ? "Aucune facture fournisseur à payer."
            : Object.values(filters).some(Boolean)
              ? "Aucune facture ne correspond à ces filtres."
              : "Aucune facture fournisseur enregistrée."}
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="px-4 py-3 font-semibold">Fournisseur</th>
                  <th scope="col" className="px-4 py-3 font-semibold">N°</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Échéance</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Montant</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Reste</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    open={open?.id === invoice.id ? open.panel : null}
                    onOpen={(panel) => {
                      setNotice("");
                      setError("");
                      setOpen(open?.id === invoice.id && open.panel === panel ? null : { id: invoice.id, panel });
                    }}
                    onReopen={async () => {
                      const count = invoice.payments.length;
                      const question =
                        count > 0
                          ? `Rouvrir la facture ${invoice.number} ? ${count > 1 ? `Ses ${count} paiements seront annulés` : "Son paiement sera annulé"} (jour, mode et référence).`
                          : `Rouvrir la facture ${invoice.number} ? Elle redevient à payer.`;
                      if (!window.confirm(question)) return;
                      const result = await send(`/api/purchase-invoices/${invoice.id}`, "PATCH", { status: "A_PAYER" });
                      if (!result.ok) setError(result.error);
                      else replaced(result.data as PurchaseInvoiceRow, `Facture ${invoice.number} rouverte : ses paiements sont annulés.`);
                    }}
                    panel={
                      open?.id === invoice.id ? (
                        open.panel === "pay" ? (
                          <PaymentForm
                            invoice={invoice}
                            today={today}
                            partialPayments={partialPayments}
                            paymentRequiresCertificate={paymentRequiresCertificate}
                            onDone={(row) => replaced(row, row.status === "PAYEE" ? `Facture ${row.number} payée.` : `Paiement enregistré : reste ${formatCurrency(row.remaining)}.`)}
                            onError={setError}
                          />
                        ) : open.panel === "correct" ? (
                          <InvoiceForm
                            invoice={invoice}
                            suppliers={suppliers.filter((supplier) => !supplier.archived || supplier.id === invoice.supplier.id)}
                            settings={settings}
                            today={today}
                            onDone={(row) => replaced(row, `Facture ${row.number} corrigée.`)}
                            onError={setError}
                          />
                        ) : open.panel === "cancel" ? (
                          <CancelForm invoice={invoice} onDone={(row) => replaced(row, `Saisie de la facture ${row.number} annulée.`)} onError={setError} />
                        ) : (
                          <PaymentsList invoice={invoice} onDone={(row) => replaced(row, "Paiement annulé.")} onError={setError} />
                        )
                      ) : null
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
          {page.nextCursor && (
            <div className="border-t border-slate-100 p-3 text-center">
              <button type="button" onClick={loadMore} disabled={loading} className={secondaryButton}>
                {loading ? "Chargement…" : "Afficher plus de factures"}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function ExportPanel({ today }: { today: string }) {
  const [mode, setMode] = useState<"mois" | "annee" | "tout">("mois");
  const [month, setMonth] = useState(monthOf(today));
  const [year, setYear] = useState(today.slice(0, 4));
  const href = purchaseJournalHref(mode === "mois" ? { mois: month } : mode === "annee" ? { annee: year } : {});
  return (
    <details className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium text-slate-700">Exporter le journal des achats (Excel)</summary>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Période</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as typeof mode)} className={`mt-1 ${inputClass} bg-white`}>
            <option value="mois">Un mois</option>
            <option value="annee">Une année</option>
            <option value="tout">Toutes les factures</option>
          </select>
        </label>
        {mode === "mois" && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Mois</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} className={`mt-1 ${inputClass}`} />
          </label>
        )}
        {mode === "annee" && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Année</span>
            <input value={year} onChange={(event) => setYear(event.target.value)} inputMode="numeric" maxLength={4} className={`mt-1 ${inputClass} w-24`} />
          </label>
        )}
        {(mode === "mois" && !month) || (mode === "annee" && !/^\d{4}$/.test(year)) ? (
          <button type="button" disabled className={primaryButton}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger
          </button>
        ) : (
          <a href={href} className={primaryButton}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Télécharger
          </a>
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Les 13 colonnes de votre modèle, dans leur ordre, puis la retenue à la source, le net à payer et l&apos;attestation ; une feuille
        « Retenues à la source » et une feuille « Paiements ».
      </p>
    </details>
  );
}

function FilterBar({ filters, suppliers, onApply }: { filters: Filters; suppliers: SupplierOption[]; onApply: (next: Filters) => void }) {
  const [q, setQ] = useState(filters.q);
  const set = (patch: Partial<Filters>) => onApply({ ...filters, ...patch });
  return (
    <form
      className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        set({ q: q.trim() });
      }}
      aria-label="Filtres des factures"
    >
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Statut</span>
        <select value={filters.vue} onChange={(event) => set({ vue: event.target.value })} className={`mt-1 ${inputClass} bg-white`}>
          <option value="">Toutes (sauf annulées)</option>
          <option value="a_payer">À payer</option>
          <option value="payees">Payées</option>
          <option value="annulees">Saisies annulées</option>
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Fournisseur</span>
        <select value={filters.fournisseur} onChange={(event) => set({ fournisseur: event.target.value })} className={`mt-1 ${inputClass} bg-white`}>
          <option value="">Tous</option>
          {suppliers.map((supplier) => (
            <option key={supplier.id} value={supplier.id}>
              {supplier.name}
              {supplier.archived ? " (archivé)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Mois de la facture</span>
        <input type="month" value={filters.periode} onChange={(event) => set({ periode: event.target.value })} className={`mt-1 ${inputClass}`} />
      </label>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">N° de facture</span>
        <span className="mt-1 flex gap-2">
          <input value={q} onChange={(event) => setQ(event.target.value)} className={inputClass} placeholder="Rechercher" />
          <button type="submit" className={secondaryButton} aria-label="Rechercher le numéro">
            <Search className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </span>
      </label>
    </form>
  );
}

function InvoiceRow({
  invoice,
  open,
  onOpen,
  onReopen,
  panel,
}: {
  invoice: PurchaseInvoiceRow;
  open: "pay" | "correct" | "cancel" | "payments" | null;
  onOpen: (panel: "pay" | "correct" | "cancel" | "payments") => void;
  onReopen: () => void;
  panel: React.ReactNode;
}) {
  const cancelled = invoice.status === "ANNULEE";
  return (
    <>
      <tr className={`border-b border-slate-100 align-top last:border-0 ${cancelled ? "bg-slate-50 text-slate-400" : ""}`}>
        <td className="px-4 py-3 font-medium text-slate-800">
          {invoice.supplier.name}
          {invoice.label && <span className="block text-xs font-normal text-slate-500">{invoice.label}</span>}
          <span className="block text-xs font-normal text-slate-500">Facture du {day(invoice.issueDay)}</span>
          {invoice.certificate !== "VALIDE" && !cancelled && (
            <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
              <FileWarning className="h-3 w-3" aria-hidden="true" />
              {CERTIFICATE_STATE_LABELS[invoice.certificate]}
            </span>
          )}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-slate-600">
          {invoice.number}
          {invoice.correctedAt && <span className="block font-sans text-[11px] text-slate-400">corrigée</span>}
        </td>
        <td className="px-4 py-3">
          <DueBadge invoice={invoice} />
        </td>
        <td className="px-4 py-3 text-right tabular-nums">
          <span className="font-semibold text-slate-800">{formatCurrency(invoice.amount)}</span>
          {invoice.amountHT !== null && (
            <span className="block text-xs text-slate-500">
              HT {formatCurrency(invoice.amountHT)} · TVA {formatCurrency(invoice.vatAmount ?? 0)}
            </span>
          )}
          {invoice.currency && invoice.amountForeign !== null && (
            <span className="block text-xs text-slate-500">
              {formatDecimal(invoice.amountForeign, 2)} {invoice.currency}
            </span>
          )}
          {invoice.withholdingAmount !== null && invoice.withholdingAmount > 0 && (
            <span className="block text-xs text-violet-700">
              Retenue {formatCurrency(invoice.withholdingAmount)} · net {formatCurrency(invoice.net)}
            </span>
          )}
        </td>
        <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
          {cancelled ? "—" : formatCurrency(invoice.remaining)}
        </td>
        <td className="px-4 py-3 text-right">
          <StatusBadge invoice={invoice} />
          <div className="mt-2 flex flex-wrap justify-end gap-1.5">
            {invoice.status === "A_PAYER" && (
              <button type="button" onClick={() => onOpen("pay")} aria-expanded={open === "pay"} className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                Payer
              </button>
            )}
            {invoice.payments.length > 0 && (
              <button type="button" onClick={() => onOpen("payments")} aria-expanded={open === "payments"} className={secondaryButton}>
                Paiements ({invoice.payments.length})
              </button>
            )}
            {invoice.correctable && (
              <>
                <button type="button" onClick={() => onOpen("correct")} aria-expanded={open === "correct"} className={secondaryButton}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  Corriger
                </button>
                <button type="button" onClick={() => onOpen("cancel")} aria-expanded={open === "cancel"} className={secondaryButton}>
                  <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                  Annuler la saisie
                </button>
              </>
            )}
            {invoice.status === "PAYEE" && (
              <button type="button" onClick={onReopen} aria-label={`Rouvrir la facture ${invoice.number}`} title="Rouvrir (annule ses paiements)" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </td>
      </tr>
      {panel && (
        <tr className="border-b border-slate-100 bg-slate-50/60">
          <td colSpan={6} className="px-4 py-3">
            {panel}
          </td>
        </tr>
      )}
    </>
  );
}

function StatusBadge({ invoice }: { invoice: PurchaseInvoiceRow }) {
  if (invoice.status === "ANNULEE") {
    return (
      <span title={invoice.cancelReason ?? undefined} className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500 ring-1 ring-slate-200">
        Saisie annulée
      </span>
    );
  }
  if (invoice.status === "PAYEE") {
    // The last payment's day; an invoice paid before lot 3D: the instant of its click, on the lab's clock.
    const lastPaid = invoice.payments.at(-1)?.paidOn;
    const paidLabel = lastPaid ? day(lastPaid) : invoice.paidAt ? formatDate(invoice.paidAt) : "";
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
        Payée{paidLabel ? ` le ${paidLabel}` : ""}
        {invoice.paymentMethod ? ` · ${PURCHASE_PAYMENT_METHOD_LABELS[invoice.paymentMethod]}` : ""}
      </span>
    );
  }
  if (invoice.statusLabel === "Partiellement payée") {
    return (
      <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-sky-200">
        Partiellement payée · {formatCurrency(invoice.paid)}
      </span>
    );
  }
  return <span className="text-xs font-medium text-slate-500">{invoice.statusLabel}</span>;
}

function DueBadge({ invoice }: { invoice: PurchaseInvoiceRow }) {
  const date = day(invoice.dueDay);
  if (invoice.status !== "A_PAYER") {
    return <span className="text-xs text-slate-400">{date}</span>;
  }
  if (invoice.due === "RETARD") {
    return (
      <span className="rounded-full bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
        En retard · {date}
      </span>
    );
  }
  if (invoice.due === "BIENTOT") {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
        Bientôt · {date}
      </span>
    );
  }
  return <span className="text-xs text-slate-500">{date}</span>;
}

// ————— Recording or correcting an invoice —————

/** The VAT of an invoice to correct when it was typed by hand (not HT x rate); "" otherwise. */
function typedVat(invoice?: PurchaseInvoiceRow): string {
  if (!invoice || invoice.amountHT === null || invoice.vatAmount === null || invoice.vatRate === null) return "";
  const computed = Math.round(cents(invoice.amountHT) * invoice.vatRate / 100) / 100;
  return cents(computed) === cents(invoice.vatAmount) ? "" : String(invoice.vatAmount).replace(".", ",");
}

function InvoiceForm({
  invoice,
  suppliers,
  settings,
  today,
  onDone,
  onError,
}: {
  /** The invoice to correct; absent = a new one. */
  invoice?: PurchaseInvoiceRow;
  suppliers: SupplierOption[];
  settings: Settings;
  today: string;
  onDone: (row: PurchaseInvoiceRow) => void;
  onError: (message: string) => void;
}) {
  const [values, setValues] = useState({
    supplierId: invoice?.supplier.id ?? "",
    number: invoice?.number ?? "",
    label: invoice?.label ?? "",
    issueDate: invoice?.issueDay ?? "",
    dueDate: invoice?.dueDay ?? "",
    amountHT: invoice?.amountHT !== null && invoice?.amountHT !== undefined ? String(invoice.amountHT) : "",
    vatRate: String(invoice?.vatRate ?? settings.defaultVatRate),
    // A VAT typed by hand at the recording (it differs from HT x rate) is kept, not recomputed.
    vatAmount: typedVat(invoice),
    amount: invoice && invoice.amountHT === null ? String(invoice.amount) : "",
    currency: invoice?.currency ?? "",
    amountForeign: invoice?.amountForeign !== null && invoice?.amountForeign !== undefined ? String(invoice.amountForeign) : "",
    exchangeRate: invoice?.exchangeRate !== null && invoice?.exchangeRate !== undefined ? String(invoice.exchangeRate) : "",
    taxCertificateProvided: invoice?.taxCertificateProvided ?? false,
    taxCertificateDate: invoice?.taxCertificateDay ?? "",
    withholdingRate: invoice?.withholdingRate !== null && invoice?.withholdingRate !== undefined ? String(invoice.withholdingRate) : "",
    reason: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const supplier = suppliers.find((option) => option.id === values.supplierId);
  const preview = useMemo(() => {
    const ht = toNumber(values.amountHT);
    const hasHT = values.amountHT.trim() !== "" && Number.isFinite(ht) && ht > 0;
    const rate = parseRate(values.vatRate) ?? settings.defaultVatRate;
    const vatTyped = values.vatAmount.trim() !== "" ? toNumber(values.vatAmount) : null;
    const vat = hasHT ? (vatTyped !== null && Number.isFinite(vatTyped) ? Math.round(vatTyped * 100) / 100 : Math.round(cents(ht) * (Number.isNaN(rate) ? 0 : rate) / 100) / 100) : null;
    const ttc = hasHT && vat !== null ? (cents(ht) + cents(vat)) / 100 : toNumber(values.amount);
    const issue = parseIsoDay(values.issueDate);
    const state: CertificateState | null = issue
      ? certificateState({
          issueDate: issue,
          invoiceProvided: values.taxCertificateProvided,
          invoiceCertificateDate: parseIsoDay(values.taxCertificateDate),
          supplierCertificateDate: supplier?.taxCertificateDay ? parseIsoDay(supplier.taxCertificateDay) : null,
          supplierCertificateValidUntil: supplier?.taxCertificateValidUntil ? parseIsoDay(supplier.taxCertificateValidUntil) : null,
          validityMonths: settings.withholding.certificateValidityMonths,
        })
      : null;
    const proposed = state && supplier ? proposedWithholdingRate(settings.withholding, supplier.withholdingSubject, state) : null;
    const typedRate = parseRate(values.withholdingRate);
    const appliedRate = typedRate !== null && !Number.isNaN(typedRate) ? typedRate : proposed;
    const withheld = Number.isFinite(ttc) && ttc > 0
      ? withholdingAmountFor(settings.withholding.base, appliedRate, { ht: hasHT ? ht : null, tva: vat, ttc })
      : 0;
    // The routes' refusal, shown before saving: a rate on the HT or the TVA needs the HT.
    const refusal = Number.isFinite(ttc) && ttc > 0
      ? withholdingRefusal(settings.withholding.base, appliedRate, { ht: hasHT ? ht : null, tva: vat, ttc })
      : null;
    return { hasHT, vat, ttc, state, proposed, appliedRate, withheld, refusal, net: Number.isFinite(ttc) ? netToPay(ttc, withheld) : 0 };
  }, [values, supplier, settings]);
  const withholdingShown =
    withholdingApplies(settings.withholding.scope, supplier?.withholdingSubject ?? false) || values.withholdingRate.trim() !== "";

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    const body = { ...values, amount: preview.hasHT ? "" : values.amount };
    const result = invoice
      ? await send(`/api/purchase-invoices/${invoice.id}`, "PUT", body)
      : await send("/api/purchase-invoices", "POST", body);
    setSaving(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onDone(result.data as PurchaseInvoiceRow);
  }

  return (
    <Card className={`${invoice ? "" : "mb-4 border-l-4 border-brand"} p-4`}>
      {invoice && (
        <p className="mb-3 text-sm font-medium text-slate-700">
          Corriger la facture {invoice.number} — possible tant qu&apos;aucun paiement n&apos;est enregistré ; la correction est journalisée.
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Fournisseur</span>
          <select value={values.supplierId} onChange={set("supplierId")} className={`mt-1 ${inputClass} bg-white`}>
            <option value="">Sélectionner</option>
            {suppliers.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">N° de facture</span>
          <input value={values.number} onChange={set("number")} className={`mt-1 ${inputClass}`} placeholder="F-2026-041" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Date d&apos;émission</span>
          <input type="date" value={values.issueDate} max={today} onChange={set("issueDate")} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Échéance</span>
          <input type="date" value={values.dueDate} onChange={set("dueDate")} className={`mt-1 ${inputClass}`} />
          <span className="mt-1 block text-xs text-slate-500">
            {supplier
              ? `Vide = ${supplier.paymentTermDays === 0 ? "comptant" : `${supplier.paymentTermDays} jours`} (convention du fournisseur)`
              : "Vide = convention du fournisseur"}
          </span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Montant HT (DH)</span>
          <input value={values.amountHT} onChange={set("amountHT")} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="1042,08" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Taux de TVA (%)</span>
          <input value={values.vatRate} onChange={set("vatRate")} inputMode="decimal" className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">TVA (DH)</span>
          <input
            value={values.vatAmount}
            onChange={set("vatAmount")}
            inputMode="decimal"
            disabled={!preview.hasHT}
            className={`mt-1 ${inputClass}`}
            placeholder={preview.vat !== null ? formatDecimal(preview.vat, 2) : "Calculée"}
          />
          <span className="mt-1 block text-xs text-slate-500">Vide = HT × taux ; à saisir si la facture porte plusieurs taux.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Montant TTC (DH)</span>
          <input
            value={preview.hasHT ? formatDecimal(preview.ttc, 2) : values.amount}
            onChange={set("amount")}
            inputMode="decimal"
            readOnly={preview.hasHT}
            className={`mt-1 ${inputClass} ${preview.hasHT ? "bg-slate-50" : ""}`}
            placeholder="TTC seul, si le HT n'est pas connu"
          />
          <span className="mt-1 block text-xs text-slate-500">{preview.hasHT ? "HT + TVA, au centime." : "Sans HT : le TTC seul est enregistré."}</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Libellé</span>
          <input value={values.label} onChange={set("label")} className={`mt-1 ${inputClass}`} placeholder="Facultatif" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Devise (facultatif)</span>
          <input value={values.currency} onChange={set("currency")} list="purchase-currencies" maxLength={3} className={`mt-1 ${inputClass} uppercase`} placeholder="DH" />
          <datalist id="purchase-currencies">
            <option value="EUR" />
            <option value="USD" />
            <option value="GBP" />
          </datalist>
        </label>
        {values.currency.trim() && !["MAD", "DH"].includes(values.currency.trim().toUpperCase()) && (
          <>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Montant en {values.currency.toUpperCase()}</span>
              <input value={values.amountForeign} onChange={set("amountForeign")} inputMode="decimal" className={`mt-1 ${inputClass}`} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Taux de change (facultatif)</span>
              <input value={values.exchangeRate} onChange={set("exchangeRate")} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="10,85" />
            </label>
          </>
        )}
      </div>

      <fieldset className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
        <legend className="px-1 text-sm font-semibold text-slate-700">Attestation de régularité fiscale</legend>
        <div className="flex flex-wrap items-end gap-4">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.taxCertificateProvided}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  taxCertificateProvided: event.target.checked,
                  taxCertificateDate: event.target.checked && !current.taxCertificateDate ? current.issueDate : current.taxCertificateDate,
                }))
              }
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            Fournie avec cette facture
          </label>
          {values.taxCertificateProvided && (
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Date de l&apos;attestation</span>
              <input type="date" value={values.taxCertificateDate} max={today} onChange={set("taxCertificateDate")} className={`mt-1 ${inputClass}`} />
            </label>
          )}
          {preview.state && (
            <p className={`text-sm font-medium ${preview.state === "VALIDE" ? "text-emerald-700" : "text-amber-700"}`}>
              {CERTIFICATE_STATE_LABELS[preview.state]}
              {preview.state === "VALIDE" && supplier?.taxCertificateValidUntil && !values.taxCertificateProvided
                ? ` (celle du fournisseur, jusqu'au ${day(supplier.taxCertificateValidUntil)})`
                : preview.state === "VALIDE" && values.taxCertificateProvided && values.taxCertificateDate
                  ? ` (jusqu'au ${day(certificateEndDay(parseIsoDay(values.taxCertificateDate), null, settings.withholding.certificateValidityMonths))})`
                  : ""}
            </p>
          )}
        </div>
        {withholdingShown && (
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <label className="block text-sm">
              <span className="font-medium text-slate-700">Taux de retenue à la source (%)</span>
              <input
                value={values.withholdingRate}
                onChange={set("withholdingRate")}
                inputMode="decimal"
                className={`mt-1 ${inputClass} w-32`}
                placeholder={preview.proposed !== null ? formatDecimal(preview.proposed, 2) : "Aucun"}
              />
            </label>
            <p className="text-sm text-slate-600">
              Base : {WITHHOLDING_BASE_LABELS[settings.withholding.base].toLowerCase()} · retenue{" "}
              <span className="font-semibold">{formatCurrency(preview.withheld)}</span> · net à payer{" "}
              <span className="font-semibold">{formatCurrency(preview.net)}</span>
            </p>
            {preview.refusal && (
              <p role="alert" className="w-full text-sm font-medium text-amber-700">
                {preview.refusal}
              </p>
            )}
          </div>
        )}
      </fieldset>

      {invoice && (
        <label className="mt-3 block text-sm">
          <span className="font-medium text-slate-700">Motif de la correction</span>
          <textarea value={values.reason} onChange={set("reason")} rows={2} className={`mt-1 ${inputClass} py-2`} placeholder="Ex. : montant HT mal recopié" />
        </label>
      )}
      <button type="button" onClick={save} disabled={saving} className={`mt-3 ${primaryButton}`}>
        {saving ? "Enregistrement…" : invoice ? "Enregistrer la correction" : "Enregistrer la facture"}
      </button>
    </Card>
  );
}

// ————— Paying —————

function PaymentForm({
  invoice,
  today,
  partialPayments,
  paymentRequiresCertificate,
  onDone,
  onError,
}: {
  invoice: PurchaseInvoiceRow;
  today: string;
  partialPayments: boolean;
  paymentRequiresCertificate: boolean;
  onDone: (row: PurchaseInvoiceRow) => void;
  onError: (message: string) => void;
}) {
  const [paidOn, setPaidOn] = useState(today);
  const [method, setMethod] = useState<PaymentMode | "">("");
  const [reference, setReference] = useState("");
  const [amount, setAmount] = useState(String(invoice.remaining).replace(".", ","));
  const [saving, setSaving] = useState(false);
  const blocked = paymentRequiresCertificate && invoice.certificate !== "VALIDE";

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    const result = await send(`/api/purchase-invoices/${invoice.id}/payments`, "POST", {
      paidOn,
      method,
      reference,
      amount: partialPayments ? amount : "",
    });
    setSaving(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onDone(result.data as PurchaseInvoiceRow);
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-700">
        Payer la facture {invoice.number} — reste à payer <span className="font-semibold">{formatCurrency(invoice.remaining)}</span>
        {invoice.withholdingAmount ? ` (net de la retenue de ${formatCurrency(invoice.withholdingAmount)})` : ""}.
      </p>
      {invoice.certificate !== "VALIDE" && (
        <p className={`mb-3 rounded-xl border px-3 py-2 text-sm ${blocked ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
          {`${CERTIFICATE_STATE_LABELS[invoice.certificate]} : l'attestation de régularité fiscale doit accompagner chaque facture`}
          {blocked ? " — enregistrez-la (sur la facture ou le fournisseur) avant le paiement." : " pour appliquer correctement la retenue à la source."}
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Date du paiement</span>
          <input type="date" value={paidOn} min={invoice.issueDay} max={today} onChange={(event) => setPaidOn(event.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Mode de paiement</span>
          <select value={method} onChange={(event) => setMethod(event.target.value as PaymentMode)} className={`mt-1 ${inputClass} bg-white`}>
            <option value="">Sélectionner</option>
            {PURCHASE_PAYMENT_METHODS.map((mode) => (
              <option key={mode} value={mode}>
                {PURCHASE_PAYMENT_METHOD_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Référence (n° de chèque, virement…)</span>
          <input value={reference} onChange={(event) => setReference(event.target.value)} className={`mt-1 ${inputClass}`} placeholder="Facultatif" />
        </label>
        {partialPayments && (
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Montant payé (DH)</span>
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} />
            <span className="mt-1 block text-xs text-slate-500">Moins que le reste : paiement partiel.</span>
          </label>
        )}
      </div>
      <button type="button" onClick={save} disabled={saving || blocked} className={`mt-3 ${primaryButton}`}>
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {saving ? "Enregistrement…" : "Enregistrer le paiement"}
      </button>
    </div>
  );
}

function PaymentsList({ invoice, onDone, onError }: { invoice: PurchaseInvoiceRow; onDone: (row: PurchaseInvoiceRow) => void; onError: (message: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  async function cancel(paymentId: string) {
    if (busy) return;
    if (!window.confirm("Annuler ce paiement ? La facture redevient à payer pour ce montant.")) return;
    setBusy(paymentId);
    onError("");
    const result = await send(`/api/purchase-invoices/${invoice.id}/payments/${paymentId}`, "DELETE");
    setBusy(null);
    if (!result.ok) onError(result.error);
    else onDone(result.data as PurchaseInvoiceRow);
  }
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-slate-700">
        Paiements de la facture {invoice.number} — net à payer {formatCurrency(invoice.net)}, payé {formatCurrency(invoice.paid)}
      </p>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
        {invoice.payments.map((payment) => (
          <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 text-sm">
            <span>
              {day(payment.paidOn)} · {PURCHASE_PAYMENT_METHOD_LABELS[payment.method]}
              {payment.reference ? ` · ${payment.reference}` : ""}
            </span>
            <span className="flex items-center gap-3">
              <span className="font-semibold tabular-nums">{formatCurrency(payment.amount)}</span>
              <button type="button" onClick={() => cancel(payment.id)} disabled={busy !== null} className={secondaryButton}>
                {busy === payment.id ? "Annulation…" : "Annuler ce paiement"}
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CancelForm({ invoice, onDone, onError }: { invoice: PurchaseInvoiceRow; onDone: (row: PurchaseInvoiceRow) => void; onError: (message: string) => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    const result = await send(`/api/purchase-invoices/${invoice.id}`, "PATCH", { status: "ANNULEE", reason });
    setSaving(false);
    if (!result.ok) onError(result.error);
    else onDone(result.data as PurchaseInvoiceRow);
  }
  return (
    <div>
      <p className="mb-2 text-sm text-slate-700">
        Annuler la saisie de la facture {invoice.number} (saisie par erreur) : elle reste dans l&apos;historique, hors des totaux, des alertes et du
        journal des achats.
      </p>
      <label className="block text-sm">
        <span className="font-medium text-slate-700">Motif</span>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} className={`mt-1 ${inputClass} py-2`} placeholder="Ex. : facture saisie deux fois" />
      </label>
      <button type="button" onClick={save} disabled={saving} className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-rose-600 px-4 text-sm font-semibold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50">
        <Ban className="h-4 w-4" aria-hidden="true" />
        {saving ? "Annulation…" : "Annuler la saisie"}
      </button>
    </div>
  );
}
