"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Building2, RefreshCw, Search, X } from "lucide-react";

/** A client as the picker returns it (from `GET /api/clients?q=`). */
export type PickedClient = {
  id: string;
  name: string;
  ice: string | null;
  /** Its active sites (the list route includes them). */
  sites: { id: string; name: string }[];
};

const MAX_RESULTS = 8;

/**
 * Searchable client picker for the fiche actions (merge, attach, billing
 * clients). Active clients only — the list route hides archived ones —
 * minus `excludeIds` (the fiche itself, clients already linked).
 *
 * Keyboard: type, ↓ into the results, ↑/↓ between them, Entrée to choose,
 * Échap back to the search field.
 */
export function ClientPicker({
  label,
  excludeIds,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  excludeIds: string[];
  selected: PickedClient | null;
  onSelect: (client: PickedClient | null) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const excludeKey = excludeIds.join("|");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      setFailed(false);
      fetch(`/api/clients?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error("liste"))))
        .then((data: unknown) => {
          const excluded = new Set(excludeKey.split("|"));
          const rows = Array.isArray(data) ? (data as PickedClient[]) : [];
          setResults(
            rows
              .filter((row) => !excluded.has(row.id))
              .slice(0, MAX_RESULTS)
              .map((row) => ({ id: row.id, name: row.name, ice: row.ice ?? null, sites: row.sites ?? [] }))
          );
        })
        .catch((error: unknown) => {
          if ((error as { name?: string })?.name === "AbortError") return;
          setResults([]);
          setFailed(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, excludeKey]);

  const showResults = query.trim().length >= 2;

  function focusOption(index: number) {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]");
    if (!buttons || buttons.length === 0) return;
    const clamped = Math.max(0, Math.min(index, buttons.length - 1));
    buttons[clamped].focus();
  }

  function choose(client: PickedClient) {
    onSelect(client);
    setQuery("");
    setResults([]);
  }

  if (selected) {
    return (
      <div>
        <p className="block text-sm font-medium text-slate-700">{label}</p>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand/30 bg-brand-light/40 px-3 py-2.5">
          <span className="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900">
            <Building2 className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
            <span className="truncate">{selected.name}</span>
            {selected.ice && <span className="font-mono text-xs font-normal text-slate-500">ICE {selected.ice}</span>}
          </span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              onSelect(null);
              // Back to the search field once it is rendered again.
              setTimeout(() => inputRef.current?.focus(), 0);
            }}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Changer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <div className="relative mt-1.5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input
          ref={inputRef}
          id={inputId}
          type="search"
          autoComplete="off"
          value={query}
          disabled={disabled}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusOption(0);
            }
          }}
          placeholder="Nom, ICE ou contact (2 caractères minimum)"
          aria-controls={showResults ? listId : undefined}
          aria-describedby={`${listId}-status`}
          className="input-field pl-9 pr-3"
        />
      </div>

      <p id={`${listId}-status`} aria-live="polite" className="sr-only">
        {showResults && !loading
          ? results.length === 0
            ? "Aucun client trouvé."
            : `${results.length} client${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""}. Flèche bas pour parcourir.`
          : ""}
      </p>

      {showResults && (
        <div className="mt-2">
          {loading ? (
            <p className="flex items-center gap-2 px-1 py-2 text-sm text-slate-500">
              <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
              Recherche…
            </p>
          ) : failed ? (
            <p role="alert" className="px-1 py-2 text-sm text-rose-700">
              La recherche a échoué. Réessayez.
            </p>
          ) : results.length === 0 ? (
            <p className="px-1 py-2 text-sm text-slate-500">Aucun client actif ne correspond.</p>
          ) : (
            <ul
              ref={listRef}
              id={listId}
              aria-label={`Résultats : ${label}`}
              className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5"
            >
              {results.map((client, index) => (
                <li key={client.id}>
                  <button
                    type="button"
                    data-option
                    onClick={() => choose(client)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        focusOption(index + 1);
                      } else if (event.key === "ArrowUp") {
                        event.preventDefault();
                        if (index === 0) inputRef.current?.focus();
                        else focusOption(index - 1);
                      } else if (event.key === "Escape") {
                        event.preventDefault();
                        inputRef.current?.focus();
                      }
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-brand-light/50 focus:bg-brand-light/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="min-w-0 truncate font-medium text-slate-800">{client.name}</span>
                    <span className="shrink-0 text-xs text-slate-500">
                      {client.sites.length > 0
                        ? `${client.sites.length} site${client.sites.length > 1 ? "s" : ""}`
                        : client.ice
                          ? `ICE ${client.ice}`
                          : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
