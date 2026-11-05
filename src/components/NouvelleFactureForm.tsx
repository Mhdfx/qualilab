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
  Send,
} from "lucide-react";
import { useInvoiceBasePath } from "@/lib/invoice-paths";
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
import {
  BillableSamples,
  type BillableLine,
} from "@/components/invoices/BillableSamples";
import { ConfirmDialog, sendJson } from "@/components/invoices/InvoiceDialogs";
import type { DraftFormInvoice } from "@/components/invoices/invoice-view";
import { ClientPicker, type PickedClient } from "@/components/commercial/ClientPicker";
import {
  INVOICE_LINE_PRICE_SOURCE_LABELS,
  linePriceOriginLabel,
  linePriceSource,
  priceEditedByHand,
  repriceServiceLine,
  servicePickPrice,
  type ClientPriceRow,
  type InvoiceLinePriceSource,
  type LinePriceOrigin,
} from "@/lib/client-prices";

/** Every active client may be invoiced. */
const NO_EXCLUDED_CLIENTS: string[] = [];

type LineItem = {
  key: string;
  serviceId: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /** Set when the line came from a validated analysis. */
  sampleId?: string | null;
  /**
   * Lot 4H, H5: where the proposed price came from (the client's own, the
   * catalogue's, none) and that price — the line says it, and says
   * « Prix modifié à la main » once the accountant types another one.
   * Unknown (null) on a line typed by hand or reopened from a draft.
   */
  priceOrigin?: LinePriceOrigin | null;
  proposedPrice?: number | null;
  /** A line reopened from a draft: the origin it was saved with (`InvoiceItem.priceSource`). */
  savedSource?: InvoiceLinePriceSource | null;
  /** A line filled from a catalogue service: that service's catalogue price (re-priced once the client's prices load). */
  servicePrice?: number | null;
};

/** What the draft saves of a line's price origin (`InvoiceItem.priceSource`). */
function sourceOf(item: LineItem): InvoiceLinePriceSource | null {
  return linePriceSource({ origin: item.priceOrigin, saved: item.savedSource, proposedPrice: item.proposedPrice, typed: item.unitPrice });
}

/** Lines filled from a catalogue service, re-proposed at this client's prices (a price typed by hand is kept). */
function repriceLines(items: LineItem[], rows: ClientPriceRow[]): LineItem[] {
  let changed = false;
  const next = items.map((item) => {
    const price = repriceServiceLine(item, rows);
    if (!price) return item;
    changed = true;
    return { ...item, unitPrice: String(price.unitPrice), priceOrigin: price.origin, proposedPrice: price.unitPrice };
  });
  return changed ? next : items;
}

let lineCounter = 0;

function newLine(): LineItem {
  lineCounter += 1;
  return {
    key: `line-${lineCounter}`,
    serviceId: "",
    description: "",
    quantity: "1",
    unitPrice: "",
    sampleId: null,
  };
}

function draftLines(draft: DraftFormInvoice | undefined): LineItem[] {
  if (!draft || draft.items.length === 0) return [newLine()];
  return draft.items.map((item) => {
    lineCounter += 1;
    return {
      key: `line-${lineCounter}`,
      serviceId: "",
      description: item.description,
      quantity: String(item.quantity),
      unitPrice: item.unitPrice ? item.unitPrice.toFixed(2) : "",
      sampleId: item.sampleId,
      // The origin saved with the line, and its price as the one it names.
      savedSource: item.priceSource ?? null,
      proposedPrice: item.unitPrice,
    };
  });
}

/**
 * The invoice form (FACTURATION.md §1, §5): a new invoice, or a draft being
 * edited. « Enregistrer le brouillon » keeps it without a number (its
 * samples are reserved); « Émettre » draws the number and freezes it.
 */
export function NouvelleFactureForm({ draft }: { draft?: DraftFormInvoice } = {}) {
  const router = useRouter();
  const base = useInvoiceBasePath();
  // The client is searched on the server (ClientPicker), never the whole base
  // loaded. A draft starts on its own client — even one that has since left
  // the active list (archived, merged).
  const [client, setClient] = useState<PickedClient | null>(() =>
    draft ? { id: draft.clientId, name: draft.clientName, ice: null, sites: [] } : null
  );
  const clientId = client?.id ?? "";
  const [services, setServices] = useState<LabServiceOption[]>([]);
  const [dueDate, setDueDate] = useState(draft?.dueDate ?? "");
  const [taxRate, setTaxRate] = useState(draft ? String(draft.taxRate) : "20");
  const [notes, setNotes] = useState(draft?.notes ?? "");
  const [items, setItems] = useState<LineItem[]>(() => draftLines(draft));
  const [submitting, setSubmitting] = useState(false);
  const [confirmIssue, setConfirmIssue] = useState(false);
  const [error, setError] = useState("");
  // Lot 4H, H5: the chosen client's own prices for the catalogue's services.
  const [clientPrices, setClientPrices] = useState<{ clientId: string; rows: ClientPriceRow[] } | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    fetch(`/api/clients/${clientId}/prices`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (cancelled) return;
        const rows: ClientPriceRow[] = Array.isArray(data) ? data : [];
        setClientPrices({ clientId, rows });
        // A service picked before the prices arrived (or for another client) takes this client's price.
        setItems((prev) => repriceLines(prev, rows));
      })
      .catch(() => {
        if (cancelled) return;
        setClientPrices({ clientId, rows: [] });
        setItems((prev) => repriceLines(prev, []));
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);
  const ownPrices = useMemo(() => (clientPrices?.clientId === clientId ? clientPrices.rows : []), [clientPrices, clientId]);
  // The catalogue's services are offered once this client's prices are known
  // (a pick before would propose the catalogue's price — lot 4H review).
  const pricesReady = !clientId || clientPrices?.clientId === clientId;

  useEffect(() => {
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

  /** The services this client has a price of its own for (its analysis billed as it, or the service itself). */
  const clientPricedServices = useMemo(
    () => new Set(services.filter((s) => servicePickPrice(ownPrices, s).origin.source === "CLIENT").map((s) => s.id)),
    [services, ownPrices]
  );

  /** Prefills a line from the catalogue. Clearing the picker leaves the line
   *  alone: the wording may have been edited on purpose. */
  function selectService(key: string, serviceId: string) {
    const service = services.find((s) => s.id === serviceId);
    // Lot 4H, H5 — the order of the invoice proposal (`resolveLinePrice`):
    // the client's price for the analysis billed as this service, else for
    // the service, else the catalogue's.
    const price = service ? servicePickPrice(ownPrices, service) : null;
    setItems((prev) =>
      prev.map((item) =>
        item.key === key
          ? service && price
            ? {
                ...item,
                serviceId,
                description: service.name,
                unitPrice: String(price.unitPrice),
                priceOrigin: price.origin,
                proposedPrice: price.unitPrice,
                servicePrice: service.unitPrice,
                savedSource: null,
              }
            : { ...item, serviceId: "" }
          : item
      )
    );
  }

  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== key) : prev));
  }

  /** The form as the API takes it, or the French error to show. */
  function payload(): { error: string } | { body: Record<string, unknown> } {
    if (!clientId) return { error: "Veuillez sélectionner un client." };
    const validItems = items.filter(
      (item) => item.description.trim() && Number(item.quantity) > 0
    );
    if (validItems.length === 0) {
      return { error: "Ajoutez au moins une ligne de prestation valide." };
    }
    return {
      body: {
        clientId,
        dueDate: dueDate || undefined,
        notes,
        taxRate: Number(taxRate) || 0,
        items: validItems.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice) || 0,
          sampleId: item.sampleId ?? null,
          // Lot 4H, H5: said again when the draft is reopened, and on the invoice sheet.
          priceSource: sourceOf(item),
        })),
      },
    };
  }

  /**
   * Saves the draft (issue: false) or issues the invoice (issue: true).
   * A new invoice is created in one call; an edited draft is saved, then
   * issued. Throws the French message on failure.
   */
  async function save(issue: boolean) {
    const built = payload();
    if ("error" in built) throw new Error(built.error);
    if (!draft) {
      const invoice = await sendJson("/api/invoices", "POST", { ...built.body, issue });
      router.push(`${base}/${invoice.id}`);
      router.refresh();
      return;
    }
    await sendJson(`/api/invoices/${draft.id}`, "PATCH", built.body);
    if (issue) {
      try {
        await sendJson(`/api/invoices/${draft.id}/issue`, "POST");
      } catch (e) {
        throw new Error(
          `Le brouillon est enregistré, mais la facture n'a pas pu être émise : ${(e as Error).message}`
        );
      }
    }
    router.push(`${base}/${draft.id}`);
    router.refresh();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await save(false);
    } catch (err) {
      setError(
        err instanceof Error && err.message !== "Failed to fetch"
          ? err.message
          : "Une erreur réseau est survenue."
      );
      setSubmitting(false);
    }
  }

  function askIssue() {
    setError("");
    const built = payload();
    if ("error" in built) {
      setError(built.error);
      return;
    }
    setConfirmIssue(true);
  }

  const listedSamples = items.flatMap((item) => (item.sampleId ? [item.sampleId] : []));

  return (
    <div className="mx-auto max-w-4xl">
      <Link
        href={base}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-brand"
      >
        <ArrowLeft className="h-4 w-4" />
        Retour aux factures
      </Link>

      <PageHeader
        badge="Facturation"
        title={draft ? "Modifier le brouillon" : "Nouvelle facture"}
        subtitle={
          draft
            ? "Le brouillon n'a pas encore de numéro : corrigez-le librement, puis émettez-le"
            : "Sélectionnez un client, ajoutez les prestations, puis enregistrez un brouillon ou émettez la facture"
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card className="p-5 sm:p-6">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {/* Changing the client remounts the billable list (keyed by client). */}
            <ClientPicker
              label="Client"
              labelClassName="section-title mb-2"
              labelIcon={<Building2 className="h-4 w-4" aria-hidden="true" />}
              placeholder="Nom, ICE ou contact (2 caractères minimum)"
              excludeIds={NO_EXCLUDED_CLIENTS}
              selected={client}
              onSelect={setClient}
              disabled={submitting}
            />

            <div>
              <label htmlFor="invoice-due-date" className="section-title mb-2">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Échéance (optionnel)
              </label>
              <input
                id="invoice-due-date"
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
            <div>
              <h3 className="section-title">
                <FileText className="h-4 w-4" />
                Prestations
              </h3>
              {clientId && ownPrices.length > 0 && (
                <Link
                  href={`/comptabilite/clients/${clientId}/prix`}
                  className="mt-1 inline-block rounded text-xs font-medium text-violet-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  {ownPrices.length} prix propre{ownPrices.length > 1 ? "s" : ""} à ce client
                </Link>
              )}
            </div>
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

            {/* Nothing forces the accountant to use this: they may still type
                a line by hand, or edit anything pulled in from an analysis. */}
            <div className="mb-4">
              <BillableSamples
                clientId={clientId}
                draftId={draft?.id}
                listed={listedSamples}
                onAdd={(lines: BillableLine[]) =>
                  setItems((prev) => {
                    const added = lines.map((line) => {
                      lineCounter += 1;
                      return {
                        key: `line-${lineCounter}`,
                        serviceId: "",
                        description: line.description,
                        quantity: String(line.quantity),
                        unitPrice: line.unitPrice ? String(line.unitPrice) : "",
                        sampleId: line.sampleId,
                        priceOrigin: line.priceOrigin ?? null,
                        proposedPrice: line.unitPrice,
                      };
                    });
                    // Drop the single blank line the form starts with.
                    const existing = prev.filter(
                      (item) => item.description.trim() || item.unitPrice.trim()
                    );
                    return [...existing, ...added];
                  })
                }
              />
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
                  <div className="col-span-2 space-y-1.5 sm:col-span-1">
                    {/* The désignation is the line as the client will read it
                        on the invoice, so it is always editable — the client
                        asked for control over how products and reports are
                        named. The catalogue below only prefills it. */}
                    <input
                      type="text"
                      value={item.description}
                      onChange={(e) =>
                        updateItem(item.key, "description", e.target.value)
                      }
                      placeholder="Désignation de la ligne"
                      aria-label="Désignation"
                      className="input-field px-4 py-2.5"
                      required
                    />
                    <select
                      value={item.serviceId}
                      onChange={(e) => selectService(item.key, e.target.value)}
                      aria-label="Reprendre une prestation du catalogue"
                      disabled={!pricesReady}
                      className="input-field px-4 py-2 text-xs text-slate-600 disabled:cursor-wait disabled:opacity-60"
                    >
                      <option value="">
                        {services.length === 0
                          ? "Chargement des prestations…"
                          : !pricesReady
                            ? "Chargement des prix du client…"
                            : "Reprendre une prestation du catalogue…"}
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
                                {clientPricedServices.has(service.id) ? " — prix du client" : ""}
                              </option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                    {(item.priceOrigin || item.savedSource) && <LinePriceNote item={item} />}
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
            <label htmlFor="invoice-notes" className="section-title mb-2">Notes (optionnel)</label>
            <textarea
              id="invoice-notes"
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
                  max="100"
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
          <div role="alert" className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <SecondaryButton
            type="button"
            onClick={() => router.push(draft ? `${base}/${draft.id}` : base)}
            className="px-6 py-3"
          >
            Annuler
          </SecondaryButton>
          <SecondaryButton type="submit" disabled={submitting} className="px-6 py-3">
            {submitting ? "Enregistrement…" : "Enregistrer le brouillon"}
          </SecondaryButton>
          <PrimaryButton type="button" onClick={askIssue} disabled={submitting} className="px-8 py-3">
            <Send className="h-4 w-4" aria-hidden="true" />
            Émettre
          </PrimaryButton>
        </div>
      </form>

      {confirmIssue && (
        <ConfirmDialog
          title="Émettre la facture"
          message={`La facture de ${formatCurrency(total)} TTC recevra le prochain numéro FAC-AAAA-NNNN et ne pourra plus jamais être modifiée. Une erreur se corrige ensuite par un avoir.`}
          confirmLabel="Émettre la facture"
          onConfirm={() => save(true)}
          onClose={() => setConfirmIssue(false)}
        />
      )}
    </div>
  );
}

/**
 * What a line says of its price (lot 4H, H5): the client's own, the
 * catalogue's, none — or « Prix modifié à la main » once the accountant
 * typed another one over the proposal.
 */
function LinePriceNote({ item }: { item: LineItem }) {
  if (!item.priceOrigin) {
    // Reopened from a draft: the origin it was saved with, until the price is retyped.
    if (!item.savedSource) return null;
    const source = sourceOf(item);
    if (!source) return null;
    const client = source === "CLIENT_REPRISE" || source === "CLIENT_SAISIE";
    return (
      <p className={`px-1 text-[11px] ${client ? "font-medium text-violet-700" : "text-slate-500"}`}>
        {source === "MAIN" && item.savedSource !== "MAIN" ? "Prix modifié à la main" : INVOICE_LINE_PRICE_SOURCE_LABELS[source]}
      </p>
    );
  }
  const label = linePriceOriginLabel(item.priceOrigin);
  if (priceEditedByHand(item.proposedPrice, item.unitPrice)) {
    return (
      <p className="px-1 text-[11px] text-slate-500">
        Prix modifié à la main — proposé : {formatCurrency(item.proposedPrice ?? 0)} ({label.charAt(0).toLowerCase() + label.slice(1)})
      </p>
    );
  }
  const tone =
    item.priceOrigin.source === "CLIENT"
      ? "font-medium text-violet-700"
      : item.priceOrigin.source === "NONE"
        ? "font-medium text-amber-700"
        : "text-slate-500";
  return <p className={`px-1 text-[11px] ${tone}`}>{label}</p>;
}
