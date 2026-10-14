"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Building2, RefreshCw, Search, X } from "lucide-react";
import { pickerRows, type PickerRow } from "@/lib/client-search";

/** A client as the picker returns it (from `GET /api/clients?q=`). */
export type PickedClient = {
  id: string;
  name: string;
  ice: string | null;
  /** Its active sites (the list route includes them). */
  sites: { id: string; name: string }[];
  /**
   * With `siteRows` only: the site of the row chosen (« Client — Site »),
   * one of `sites`, for the form to preselect. Absent: no site in particular.
   */
  siteId?: string;
};

const MAX_RESULTS = 8;

const DEFAULT_PLACEHOLDER = "Nom, ICE ou contact (2 caractères minimum)";
const SITE_ROWS_PLACEHOLDER = "Client, site, ICE ou contact (2 caractères minimum)";
const DEFAULT_LABEL_CLASS = "block text-sm font-medium text-slate-700";

/**
 * Searchable client picker for the fiche actions (merge, attach, billing
 * clients), the préleveur's visit, the reception's deposit and the invoice
 * draft — the client base is searched on the server, never loaded whole.
 * Active clients only — the list route never answers an archived one —
 * minus `excludeIds` (the fiche itself, clients already linked).
 *
 * The search also finds a client by one of its sites, or by an archived
 * fiche now part of it (src/lib/client-search.ts): such a row reads
 * « Client — Site ». With `siteRows` (the visit and the deposit) there is
 * one row per client and site, and the choice carries the site
 * (`PickedClient.siteId`) for the form to preselect. Without it (billing,
 * merge, attach, invoice) one row per client, and the choice is the client
 * alone, as before.
 *
 * Optional look: `labelClassName` / `labelIcon` (a form's « section-title »
 * heading), `placeholder`.
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
  siteRows = false,
  placeholder = siteRows ? SITE_ROWS_PLACEHOLDER : DEFAULT_PLACEHOLDER,
  labelClassName = DEFAULT_LABEL_CLASS,
  labelIcon,
}: {
  label: string;
  excludeIds: string[];
  selected: PickedClient | null;
  onSelect: (client: PickedClient | null) => void;
  disabled?: boolean;
  /** One row per client and site, the choice carrying the site (the sampling forms). */
  siteRows?: boolean;
  placeholder?: string;
  labelClassName?: string;
  /** Shown before the label (decorative). */
  labelIcon?: React.ReactNode;
}) {
  const inputId = useId();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerRow[]>([]);
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
          setResults(pickerRows(data, { excluded, siteRows, max: MAX_RESULTS }));
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
  }, [query, excludeKey, siteRows]);

  const showResults = query.trim().length >= 2;
  const found = siteRows
    ? `${results.length} résultat${results.length > 1 ? "s" : ""}`
    : `${results.length} client${results.length > 1 ? "s" : ""} trouvé${results.length > 1 ? "s" : ""}`;

  function focusOption(index: number) {
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-option]");
    if (!buttons || buttons.length === 0) return;
    const clamped = Math.max(0, Math.min(index, buttons.length - 1));
    buttons[clamped].focus();
  }

  function choose(row: PickerRow) {
    onSelect({
      id: row.id,
      name: row.name,
      ice: row.ice,
      sites: row.sites,
      ...(siteRows && row.siteId ? { siteId: row.siteId } : {}),
    });
    setQuery("");
    setResults([]);
  }

  if (selected) {
    return (
      <div>
        <p className={labelClassName}>
          {labelIcon}
          {label}
        </p>
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
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
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
      <label htmlFor={inputId} className={labelClassName}>
        {labelIcon}
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
          placeholder={placeholder}
          aria-controls={showResults ? listId : undefined}
          aria-describedby={`${listId}-status`}
          className="input-field pl-9 pr-3"
        />
      </div>

      <p id={`${listId}-status`} aria-live="polite" className="sr-only">
        {showResults && !loading
          ? results.length === 0
            ? siteRows
              ? "Aucun client ni site trouvé."
              : "Aucun client trouvé."
            : `${found}. Flèche bas pour parcourir.`
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
            <p className="px-1 py-2 text-sm text-slate-500">
              {siteRows ? "Aucun client ni site actif ne correspond." : "Aucun client actif ne correspond."}
            </p>
          ) : (
            <ul
              ref={listRef}
              id={listId}
              aria-label={`Résultats : ${label}`}
              className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5"
            >
              {results.map((row, index) => (
                <li key={row.key}>
                  <button
                    type="button"
                    data-option
                    onClick={() => choose(row)}
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
                    className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition hover:bg-brand-light/50 focus:bg-brand-light/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    {row.label ? (
                      // Found through a site or an archived fiche: « Client — Site », wrapped on a phone rather than cut.
                      <span className="min-w-0 break-words font-medium text-slate-800">
                        {row.name}
                        <span className="font-normal text-slate-600">{` — ${row.label}`}</span>
                      </span>
                    ) : (
                      <>
                        <span className="min-w-0 truncate font-medium text-slate-800">{row.name}</span>
                        <span className="shrink-0 text-xs text-slate-500">
                          {row.sites.length > 0
                            ? `${row.sites.length} site${row.sites.length > 1 ? "s" : ""}`
                            : row.ice
                              ? `ICE ${row.ice}`
                              : ""}
                        </span>
                      </>
                    )}
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
