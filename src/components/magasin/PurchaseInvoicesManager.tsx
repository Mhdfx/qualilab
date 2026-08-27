"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, ReceiptText, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDate } from "@/lib/labels";
import type { DueState } from "@/lib/stock";

/**
 * Supplier invoices: recorded once, then only their payment status moves.
 * The due badges use the same dueState() the dashboard alerts use.
 */

export type PurchaseInvoiceRow = {
  id: string;
  number: string;
  label: string | null;
  amount: number;
  issueDate: string;
  dueDate: string;
  status: "A_PAYER" | "PAYEE";
  paidAt: string | null;
  due: DueState;
  supplier: { id: string; name: string };
};

type SupplierOption = { id: string; name: string; paymentTermDays: number };

const inputClass = "input-field px-3 text-sm" as const;

export function PurchaseInvoicesManager({
  initialInvoices,
  suppliers,
}: {
  initialInvoices: PurchaseInvoiceRow[];
  suppliers: SupplierOption[];
}) {
  const [invoices, setInvoices] = useState(initialInvoices);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    const response = await fetch("/api/purchase-invoices");
    if (response.ok) setInvoices(await response.json());
  }, []);

  async function setStatus(invoice: PurchaseInvoiceRow, status: "PAYEE" | "A_PAYER") {
    setError("");
    const response = await fetch(`/api/purchase-invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      const data = await response.json();
      setError(data.error ?? "Action impossible.");
      return;
    }
    reload();
  }

  const unpaid = invoices.filter((invoice) => invoice.status === "A_PAYER");
  const paid = invoices.filter((invoice) => invoice.status === "PAYEE");

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          {unpaid.length} à payer · {paid.length} payée{paid.length > 1 ? "s" : ""}
        </p>
        <button
          type="button"
          onClick={() => setCreating((current) => !current)}
          disabled={suppliers.length === 0}
          className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <ReceiptText className="h-4 w-4" aria-hidden="true" />
          {creating ? "Fermer" : "Nouvelle facture"}
        </button>
      </div>

      {suppliers.length === 0 && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Créez d&apos;abord un fournisseur — chaque facture s&apos;y rattache.
        </p>
      )}

      {creating && (
        <InvoiceForm
          suppliers={suppliers}
          onDone={() => {
            setCreating(false);
            reload();
          }}
          onError={setError}
        />
      )}

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {invoices.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-500">
          Aucune facture fournisseur enregistrée.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-semibold">Fournisseur</th>
                  <th className="px-4 py-3 font-semibold">N°</th>
                  <th className="px-4 py-3 font-semibold">Échéance</th>
                  <th className="px-4 py-3 text-right font-semibold">Montant</th>
                  <th className="px-4 py-3 text-right font-semibold">Statut</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {invoice.supplier.name}
                      {invoice.label && (
                        <span className="block text-xs font-normal text-slate-500">
                          {invoice.label}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {invoice.number}
                    </td>
                    <td className="px-4 py-3">
                      <DueBadge invoice={invoice} />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-slate-800">
                      {formatCurrency(invoice.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {invoice.status === "A_PAYER" ? (
                        <button
                          type="button"
                          onClick={() => setStatus(invoice, "PAYEE")}
                          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Marquer payée
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-2">
                          <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                            Payée{invoice.paidAt ? ` le ${formatDate(new Date(invoice.paidAt))}` : ""}
                          </span>
                          <button
                            type="button"
                            onClick={() => setStatus(invoice, "A_PAYER")}
                            aria-label={`Rouvrir la facture ${invoice.number}`}
                            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function DueBadge({ invoice }: { invoice: PurchaseInvoiceRow }) {
  const date = formatDate(new Date(invoice.dueDate));
  if (invoice.status === "PAYEE") {
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

function InvoiceForm({
  suppliers,
  onDone,
  onError,
}: {
  suppliers: SupplierOption[];
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [number, setNumber] = useState("");
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [issueDate, setIssueDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);

  const supplier = suppliers.find((option) => option.id === supplierId);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/purchase-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, number, label, amount, issueDate, dueDate }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Enregistrement impossible.");
        return;
      }
      onDone();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 border-l-4 border-brand p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Fournisseur</span>
          <select
            value={supplierId}
            onChange={(event) => setSupplierId(event.target.value)}
            className={`mt-1 ${inputClass} bg-white`}
          >
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
          <input value={number} onChange={(e) => setNumber(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="F-2026-041" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Libellé</span>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`mt-1 ${inputClass}`} placeholder="Facultatif" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Montant TTC (DH)</span>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className={`mt-1 ${inputClass}`} placeholder="1250,50" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Date d&apos;émission</span>
          <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`mt-1 ${inputClass}`} />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-700">Échéance</span>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`mt-1 ${inputClass}`} />
          <span className="mt-1 block text-xs text-slate-500">
            {supplier
              ? `Vide = ${supplier.paymentTermDays === 0 ? "comptant" : `${supplier.paymentTermDays} jours`} (convention du fournisseur)`
              : "Vide = convention du fournisseur"}
          </span>
        </label>
      </div>
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="mt-3 inline-flex min-h-[40px] items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
      >
        {saving ? "Enregistrement…" : "Enregistrer la facture"}
      </button>
    </Card>
  );
}
