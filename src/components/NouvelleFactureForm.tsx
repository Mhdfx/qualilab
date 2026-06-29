"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  CalendarClock,
  Plus,
  Trash2,
  Percent,
  FileText,
  AlertCircle,
} from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import { formatCurrency } from "@/lib/labels";
import {
  LAB_SERVICE_CATEGORIES,
  LAB_SERVICE_CATEGORY_LABELS,
  type LabServiceOption,
} from "@/lib/lab-services";
import { computeInvoiceTotals, computeLineAmounts } from "@/lib/invoice-math";

type ClientOption = {
  id: string;
  name: string;
};

type LineItem = {
  key: string;
  serviceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

let lineCounter = 0;

function newLine(): LineItem {
  lineCounter += 1;
  return {
    key: `line-${lineCounter}`,
    serviceId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
  };
}

export function NouvelleFactureForm() {
  const router = useRouter();
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [services, setServices] = useState<LabServiceOption[]>([]);
  const [clientId, setClientId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [taxRate, setTaxRate] = useState("20");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<LineItem[]>(() => [newLine()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/clients")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setClients(data);
      });
    fetch("/api/lab-services")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setServices(data);
      });
  }, []);

  const servicesByCategory = useMemo(() => {
    const grouped = new Map<string, LabServiceOption[]>();
    for (const category of LAB_SERVICE_CATEGORIES) {
      grouped.set(
        category,
        services.filter((s) => s.category === category)
      );
    }
    return grouped;
  }, [services]);

  const { subtotal, taxAmount, total } = useMemo(() => {
    const rate = Math.max(0, Number(taxRate) || 0);
    const validItems = items
      .filter((item) => item.description.trim() && Number(item.quantity) > 0)
      .map((item) => ({
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
      }));
    return computeInvoiceTotals(validItems, rate);
  }, [items, taxRate]);

  function updateItem(key: string, field: keyof LineItem, value: string) {
    setItems((prev) =>
      prev.map((item) => (item.key === key ? { ...item, [field]: value } : item))
    );
  }

  function selectService(key: string, serviceId: string) {
    const service = services.find((s) => s.id === serviceId);
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? {
              ...item,
              serviceId,
              description: service?.name ?? "",
              unitPrice: service ? String(service.unitPrice) : "",
            }
          : item
      )
    );
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== key) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!clientId) {
      setError("Veuillez sélectionner un client.");
      return;
    }

    const validItems = items.filter(
      (item) => item.description.trim() && Number(item.quantity) > 0
    );
    if (validItems.length === 0) {
      setError("Ajoutez au moins une ligne de prestation valide.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          dueDate: dueDate || undefined,
          notes,
          taxRate: Number(taxRate) || 0,
          items: validItems.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice) || 0,
          })),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Impossible de créer la facture.");
        setSubmitting(false);
        return;
      }

      const invoice = await res.json();
      router.push(`/admin/factures/${invoice.id}`);
    } catch {
      setError("Une erreur réseau est survenue.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href="/admin/factures"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux factures
      </Link>

      <PageHeader
        badge="Administration"
        title="Nouvelle facture"
        subtitle="Sélectionnez un client, ajoutez les prestations et générez la facture"
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label className="section-title mb-2">
                <Building2 className="h-4 w-4" />
                Client
              </label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="input-field px-4"
                required
              >
                <option value="">Sélectionner un client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="section-title mb-2">
                <CalendarClock className="h-4 w-4" />
                Échéance (optionnel)
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-field px-4"
              />
            </div>

          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="section-title">
              <FileText className="h-4 w-4" />
              Prestations
            </h3>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, newLine()])}
              className="inline-flex items-center gap-1.5 rounded-full border border-brand/20 bg-brand-light/50 px-3 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand-light"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter une ligne
            </button>
          </div>

          <div className="space-y-3">
            <div className="hidden grid-cols-[1fr_5rem_8rem_8rem_2.5rem] gap-3 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:grid">
              <span>Désignation</span>
              <span className="text-center">Qté</span>
              <span className="text-right">P.U. HT</span>
              <span className="text-right">Total TTC</span>
              <span />
            </div>

            {items.map((item) => {
              const qty = Number(item.quantity) || 0;
              const price = Number(item.unitPrice) || 0;
              const rate = Math.max(0, Number(taxRate) || 0);
              const { lineTtc } = computeLineAmounts(qty, price, rate);
              return (
                <div
                  key={item.key}
                  className="grid grid-cols-2 gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 sm:grid-cols-[1fr_5rem_8rem_8rem_2.5rem] sm:items-center sm:border-0 sm:bg-transparent sm:p-0"
                >
                  <div className="col-span-2 sm:col-span-1">
                    <select
                      value={item.serviceId}
                      onChange={(e) => selectService(item.key, e.target.value)}
                      className="input-field px-4 py-2.5"
                      required
                    >
                      <option value="">
                        {services.length === 0
                          ? "Chargement des prestations…"
                          : "Sélectionner une prestation…"}
                      </option>
                      {LAB_SERVICE_CATEGORIES.map((category) => {
                        const categoryServices = servicesByCategory.get(category) ?? [];
                        if (categoryServices.length === 0) return null;
                        return (
                          <optgroup
                            key={category}
                            label={LAB_SERVICE_CATEGORY_LABELS[category]}
                          >
                            {categoryServices.map((service) => (
                              <option key={service.id} value={service.id}>
                                {service.name}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    aria-label="Quantité"
                    value={item.quantity}
                    onChange={(e) => updateItem(item.key, "quantity", e.target.value)}
                    className="input-field px-3 py-2.5 text-center"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0.00"
                    aria-label="Prix unitaire"
                    value={item.unitPrice}
                    onChange={(e) => updateItem(item.key, "unitPrice", e.target.value)}
                    className="input-field px-3 py-2.5 text-right"
                  />
                  <div className="flex items-center justify-end px-1 text-sm font-semibold tabular-nums text-slate-700">
                    {formatCurrency(lineTtc)}
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    disabled={items.length === 1}
                    aria-label="Supprimer la ligne"
                    className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card className="p-5 sm:p-6">
            <label className="section-title mb-2">Notes (optionnel)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Conditions de paiement, références, remerciements…"
              className="input-field resize-none px-4"
            />
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">Sous-total (HT)</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {formatCurrency(subtotal)}
              </span>
            </div>
            <div className="mb-3 flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5 text-sm text-slate-600">
                <Percent className="h-3.5 w-3.5" />
                TVA
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  aria-label="Taux de TVA"
                  className="input-field w-20 px-3 py-1.5 text-right"
                />
                <span className="text-sm text-slate-500">%</span>
              </div>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-slate-600">Montant TVA</span>
              <span className="font-semibold tabular-nums text-slate-800">
                {formatCurrency(taxAmount)}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
              <span className="text-base font-bold text-slate-900">Total TTC</span>
              <span className="text-xl font-bold tabular-nums text-brand">
                {formatCurrency(total)}
              </span>
            </div>
          </Card>
        </div>

        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton
            type="button"
            onClick={() => router.push("/admin/factures")}
            className="px-6 py-3"
          >
            Annuler
          </SecondaryButton>
          <PrimaryButton type="submit" disabled={submitting} className="px-8 py-3">
            {submitting ? "Génération…" : "Générer la facture"}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}
