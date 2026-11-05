"use client";

import { useMemo, useState } from "react";
import { Check, History, Pencil, Plus, Search, Tags, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { formatCurrency, formatDate, SAMPLE_TYPE_LABELS } from "@/lib/labels";
import { LAB_SERVICE_CATEGORY_LABELS, type LabServiceOption } from "@/lib/lab-services";
import {
  CLIENT_PRICE_ORIGIN_LABELS,
  matchesClientPriceSearch,
  type ClientPriceRow,
} from "@/lib/client-prices";
import type { SampleType } from "@/generated/prisma/client";

/**
 * « Prix propres au client » (lot 4H, H5 — RETOUR-LABO-04-11.md §5): the
 * prices this client pays instead of the catalogue's, on its fiche — for the
 * roles that see prices only (the pages that render it are guarded by
 * `BILLING_ROLES`, price-access.ts). Each one says where it comes from (taken
 * over from the old software, or typed here) beside the catalogue's price.
 * A price set or corrected here is never overwritten by a later reprise;
 * a price removed lets the catalogue's apply again. The invoice proposes
 * these prices, always editable.
 */

type ParameterOption = { id: string; name: string; category: SampleType };

type Adding = { kind: "ANALYSE" | "PRESTATION"; itemId: string; search: string; price: string };

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

export function ClientPricesCard({
  clientId,
  initialRows,
  archived,
}: {
  clientId: string;
  initialRows: ClientPriceRow[];
  /** An archived fiche lists its prices, read-only. */
  archived: boolean;
}) {
  const [rows, setRows] = useState(initialRows);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ id: string; price: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [adding, setAdding] = useState<Adding | null>(null);
  const [parameters, setParameters] = useState<ParameterOption[] | null>(null);
  const [services, setServices] = useState<LabServiceOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const shown = useMemo(() => (search.trim() ? rows.filter((row) => matchesClientPriceSearch(row, search)) : rows), [rows, search]);
  const reprise = rows.filter((row) => row.origin === "REPRISE").length;

  /** Sends one change; the answer is the client's whole list, as the server now holds it. */
  async function send(method: "PUT" | "DELETE", body?: Record<string, unknown>, priceId?: string): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError("");
    try {
      const query = priceId ? `?prix=${encodeURIComponent(priceId)}` : "";
      const response = await fetch(`/api/clients/${clientId}/prices${query}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError((data && typeof data.error === "string" && data.error) || "Enregistrement impossible.");
        return false;
      }
      if (Array.isArray(data)) setRows(data);
      return true;
    } catch {
      setError("Une erreur réseau est survenue.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  function openAdding() {
    setAdding({ kind: "ANALYSE", itemId: "", search: "", price: "" });
    setError("");
    if (parameters === null) {
      fetch("/api/parameters")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setParameters(Array.isArray(data) ? data.map((p) => ({ id: p.id, name: p.name, category: p.category })) : []))
        .catch(() => setParameters([]));
    }
    if (services === null) {
      fetch("/api/lab-services")
        .then((r) => (r.ok ? r.json() : []))
        .then((data) => setServices(Array.isArray(data) ? data : []))
        .catch(() => setServices([]));
    }
  }

  const taken = useMemo(() => new Set(rows.map((row) => row.parameterId ?? row.labServiceId)), [rows]);
  const options = useMemo(() => {
    if (!adding) return [];
    if (adding.kind === "PRESTATION") {
      return (services ?? []).map((s) => ({
        id: s.id,
        label: s.name,
        domain: LAB_SERVICE_CATEGORY_LABELS[s.category] ?? s.category,
      }));
    }
    const all = (parameters ?? []).map((p) => ({ id: p.id, label: p.name, domain: SAMPLE_TYPE_LABELS[p.category] }));
    const matching = adding.search.trim() ? all.filter((o) => matchesClientPriceSearch(o, adding.search)) : all;
    return matching.slice(0, 60);
  }, [adding, parameters, services]);

  async function saveAdding() {
    if (!adding) return;
    if (!adding.itemId) {
      setError(adding.kind === "ANALYSE" ? "Choisissez l'analyse." : "Choisissez la prestation.");
      return;
    }
    const ok = await send("PUT", {
      ...(adding.kind === "ANALYSE" ? { parameterId: adding.itemId } : { labServiceId: adding.itemId }),
      unitPrice: adding.price,
    });
    if (ok) setAdding(null);
  }

  async function saveEdit(row: ClientPriceRow) {
    if (!editing) return;
    const ok = await send("PUT", {
      ...(row.parameterId ? { parameterId: row.parameterId } : { labServiceId: row.labServiceId }),
      unitPrice: editing.price,
    });
    if (ok) setEditing(null);
  }

  return (
    <section id="prix-client" aria-label="Prix propres au client" className="scroll-mt-24">
      <Card className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
              <Tags className="h-4 w-4 text-brand" aria-hidden="true" />
              Prix propres au client
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {rows.length === 0
                ? "Aucun prix propre : la facture propose les prix du catalogue."
                : `${plural(rows.length, "prix propre", "prix propres")}${reprise > 0 ? `, dont ${reprise} repris de l'ancien logiciel` : ""}. La facture les propose à la place du catalogue ; le comptable peut toujours les modifier sur la ligne.`}
            </p>
          </div>
          {!archived && !adding && (
            <button
              type="button"
              onClick={openAdding}
              className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-brand/20 bg-brand-light/50 px-3 text-sm font-semibold text-brand transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Ajouter un prix
            </button>
          )}
        </div>

        {archived && rows.length > 0 && (
          <p className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Client archivé : ses prix se lisent ici et se corrigent sur la fiche du client conservé.
          </p>
        )}

        {adding && (
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Le prix porte sur">
              {(["ANALYSE", "PRESTATION"] as const).map((kind) => (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={adding.kind === kind}
                  onClick={() => setAdding({ ...adding, kind, itemId: "", search: "" })}
                  className={`min-h-[36px] rounded-full px-3 text-sm font-medium ring-1 transition ${
                    adding.kind === kind ? "bg-brand text-white ring-brand" : "bg-white text-slate-700 ring-slate-300 hover:bg-slate-50"
                  }`}
                >
                  {kind === "ANALYSE" ? "Une analyse" : "Une prestation du catalogue"}
                </button>
              ))}
            </div>
            {adding.kind === "ANALYSE" && (
              <label className="mt-3 block">
                <span className="text-xs font-medium text-slate-600">Rechercher l&apos;analyse</span>
                <span className="relative mt-1 block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input
                    type="search"
                    value={adding.search}
                    onChange={(e) => setAdding({ ...adding, search: e.target.value, itemId: "" })}
                    placeholder="Nom de l'analyse, domaine (« eau », « ambiance »…)"
                    className="input-field py-2 pl-9 pr-3"
                  />
                </span>
              </label>
            )}
            <label className="mt-3 block">
              <span className="text-xs font-medium text-slate-600">{adding.kind === "ANALYSE" ? "Analyse" : "Prestation"}</span>
              <select
                value={adding.itemId}
                onChange={(e) => setAdding({ ...adding, itemId: e.target.value })}
                className="input-field mt-1 px-3 py-2"
              >
                <option value="">
                  {(adding.kind === "ANALYSE" ? parameters : services) === null
                    ? "Chargement…"
                    : options.length === 0
                      ? "Aucun résultat"
                      : adding.kind === "ANALYSE"
                        ? `Choisir parmi ${plural(options.length, "analyse", "analyses")}${options.length === 60 ? " (précisez la recherche)" : ""}`
                        : "Choisir la prestation"}
                </option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label} — {option.domain}
                    {taken.has(option.id) ? " (prix déjà saisi : il sera remplacé)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="mt-3 block max-w-[14rem]">
              <span className="text-xs font-medium text-slate-600">Prix unitaire HT (DH)</span>
              <input
                type="text"
                inputMode="decimal"
                value={adding.price}
                onChange={(e) => setAdding({ ...adding, price: e.target.value })}
                placeholder="250,00"
                className="input-field mt-1 px-3 py-2 text-right tabular-nums"
              />
            </label>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setAdding(null);
                  setError("");
                }}
                disabled={busy}
                className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={saveAdding}
                disabled={busy}
                className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                {busy ? "Enregistrement…" : "Enregistrer le prix"}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        {rows.length > 8 && (
          <label className="relative mt-4 block max-w-sm">
            <span className="sr-only">Filtrer les prix</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrer : analyse, domaine…"
              className="input-field py-2 pl-9 pr-3"
            />
          </label>
        )}

        {rows.length > 0 && (
          <div className="mt-4 max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-white">
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th scope="col" className="pb-2 pr-3 font-medium">Analyse ou prestation</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Prix du client HT</th>
                  <th scope="col" className="pb-2 pr-3 text-right font-medium">Catalogue</th>
                  <th scope="col" className="pb-2 pr-3 font-medium">Origine</th>
                  {!archived && <th scope="col" className="pb-2 font-medium"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((row) => {
                  const isEditing = editing?.id === row.id;
                  return (
                    <tr key={row.id} className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-2 pr-3">
                        <span className="block text-slate-900">{row.label}</span>
                        <span className="text-xs text-slate-500">
                          {row.kind === "PRESTATION" ? "Prestation · " : ""}
                          {row.domain}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right">
                        {isEditing ? (
                          <input
                            type="text"
                            inputMode="decimal"
                            autoFocus
                            aria-label={`Prix du client pour ${row.label}`}
                            value={editing.price}
                            onChange={(e) => setEditing({ id: row.id, price: e.target.value })}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") saveEdit(row);
                              if (e.key === "Escape") setEditing(null);
                            }}
                            className="input-field w-28 px-2 py-1 text-right tabular-nums"
                          />
                        ) : (
                          <span className="font-semibold tabular-nums text-slate-900">{formatCurrency(row.unitPrice)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums text-slate-500">
                        {row.cataloguePrice === null ? "—" : formatCurrency(row.cataloguePrice)}
                      </td>
                      <td className="py-2 pr-3 text-xs text-slate-600">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold ring-1 ${
                            row.origin === "REPRISE" ? "bg-violet-50 text-violet-800 ring-violet-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          }`}
                        >
                          {row.origin === "REPRISE" && <History className="h-3 w-3" aria-hidden="true" />}
                          {CLIENT_PRICE_ORIGIN_LABELS[row.origin]}
                        </span>
                        <span className="mt-0.5 block text-slate-500">
                          {row.origin === "REPRISE"
                            ? row.legacyModifiedAt
                              ? `modifié dans l'ancien logiciel le ${formatDate(row.legacyModifiedAt)}`
                              : `repris le ${formatDate(row.updatedAt)}`
                            : `le ${formatDate(row.updatedAt)}${row.updatedBy ? ` par ${row.updatedBy}` : ""}`}
                        </span>
                      </td>
                      {!archived && (
                        <td className="py-2 text-right">
                          {isEditing ? (
                            <span className="inline-flex gap-1">
                              <IconButton label="Enregistrer le prix" onClick={() => saveEdit(row)} disabled={busy}>
                                <Check className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                              <IconButton label="Annuler la correction" onClick={() => setEditing(null)} disabled={busy}>
                                <X className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                            </span>
                          ) : removing === row.id ? (
                            <span className="inline-flex flex-wrap items-center justify-end gap-1 text-xs">
                              <span className="text-slate-600">Revenir au catalogue ?</span>
                              <button
                                type="button"
                                onClick={async () => {
                                  if (await send("DELETE", undefined, row.id)) setRemoving(null);
                                }}
                                disabled={busy}
                                className="rounded-lg bg-rose-600 px-2 py-1 font-semibold text-white transition hover:bg-rose-700 disabled:opacity-50"
                              >
                                Retirer
                              </button>
                              <button
                                type="button"
                                onClick={() => setRemoving(null)}
                                className="rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100"
                              >
                                Garder
                              </button>
                            </span>
                          ) : (
                            <span className="inline-flex gap-1">
                              <IconButton
                                label={`Corriger le prix de ${row.label}`}
                                onClick={() => {
                                  setRemoving(null);
                                  setEditing({ id: row.id, price: row.unitPrice.toFixed(2).replace(".", ",") });
                                }}
                                disabled={busy}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                              <IconButton
                                label={`Retirer le prix de ${row.label}`}
                                onClick={() => {
                                  setEditing(null);
                                  setRemoving(row.id);
                                }}
                                disabled={busy}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={archived ? 4 : 5} className="py-3 text-center text-sm text-slate-500">
                      Aucun prix ne correspond au filtre.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
    >
      {children}
    </button>
  );
}
