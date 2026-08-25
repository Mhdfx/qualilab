"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Building2, ArrowRight, Archive, Plus, Mail } from "lucide-react";
import { Card } from "@/components/ui/Card";

export type ClientRow = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  ice: string | null;
  archived: boolean;
  _count: { samples: number; invoices: number };
  emails: { id: string }[];
};

/**
 * The client base.
 *
 * Filtering happens in the browser because the list is small (a laboratory has
 * clients, not users) and instant feedback beats a round-trip. If it ever grows
 * past a few hundred, move the search to the API — it already accepts `?q=`.
 */
export function ClientList({ clients }: { clients: ClientRow[] }) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (client.archived && !showArchived) return false;
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        client.contact?.toLowerCase().includes(needle) ||
        client.ice?.includes(needle) ||
        client.email?.toLowerCase().includes(needle)
      );
    });
  }, [clients, query, showArchived]);

  const archivedCount = clients.filter((client) => client.archived).length;

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Rechercher par raison sociale, contact ou ICE…"
            aria-label="Rechercher un client"
            className="min-h-[44px] w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>

        {archivedCount > 0 && (
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
            />
            Archivés ({archivedCount})
          </label>
        )}

        <Link
          href="/commercial/nouveau"
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau client
        </Link>
      </div>

      {visible.length === 0 ? (
        <Card className="p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Building2 className="h-6 w-6 text-slate-400" aria-hidden="true" />
          </div>
          <p className="mt-3 font-semibold text-slate-700">
            {query ? "Aucun client ne correspond" : "Aucun client"}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            {query
              ? "Essayez une autre recherche."
              : "Créez votre premier client pour commencer."}
          </p>
        </Card>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((client) => (
            <li key={client.id}>
              <Link
                href={`/commercial/${client.id}`}
                className="group block rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                      {client.name}
                      {client.archived && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          <Archive className="h-3 w-3" aria-hidden="true" />
                          Archivé
                        </span>
                      )}
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                      {client.contact && <span>{client.contact}</span>}
                      {client.ice && (
                        <span className="font-mono text-xs">ICE {client.ice}</span>
                      )}
                      {client.emails.length > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                          {client.emails.length} adresse
                          {client.emails.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-xs text-slate-400">
                      {client._count.samples} échantillon
                      {client._count.samples > 1 ? "s" : ""} ·{" "}
                      {client._count.invoices} facture
                      {client._count.invoices > 1 ? "s" : ""}
                    </p>
                  </div>

                  <ArrowRight
                    className="mt-1 h-4 w-4 shrink-0 self-center text-slate-300 transition group-hover:text-brand"
                    aria-hidden="true"
                  />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
