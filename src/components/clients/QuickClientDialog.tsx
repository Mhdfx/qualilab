"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, ChevronDown, MapPin, Plus, RefreshCw, Users, X } from "lucide-react";
import type { SimilarClient } from "@/lib/client-identity";
import { isIce } from "@/lib/client-validation";
import {
  MAX_NEW_PLACES,
  quickClientBody,
  withPlace,
  type CreationOrigin,
  type OfferedClient,
  type QuickClientForm,
} from "@/lib/quick-client";
import { SIMILAR_DEBOUNCE_MS, shouldCheckSimilar, similarQuery } from "@/components/commercial/client-actions-logic";
import type { PickedClient } from "@/components/commercial/ClientPicker";

/** VARCHAR(191), as the server checks it. */
const FIELD_MAX = 191;

/** What Tab may reach inside the dialog (the focus trap). */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** What the server answered with a 409. */
type Conflict =
  | { kind: "similar"; message: string; clients: SimilarClient[] }
  | { kind: "exact"; message: string; offer: OfferedClient | null; siteId: string | null };

const EMPTY_FORM: QuickClientForm = {
  name: "",
  address: "",
  site: "",
  places: [],
  placeDraft: "",
  contact: "",
  phone: "",
  ice: "",
};

function sitesOf(value: unknown): { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((site) => {
    const row = (site ?? {}) as { id?: unknown; name?: unknown; active?: unknown };
    // The client base's keepers read every site; a form picks an active one only.
    return typeof row.id === "string" && typeof row.name === "string" && row.active !== false ? [{ id: row.id, name: row.name }] : [];
  });
}

function offerOf(value: unknown): OfferedClient | null {
  const row = (value ?? {}) as { id?: unknown; name?: unknown; ice?: unknown; sites?: unknown };
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  return { id: row.id, name: row.name, ice: typeof row.ice === "string" ? row.ice : null, sites: sitesOf(row.sites) };
}

/**
 * « Nouveau client » at the deposit and the visit (RETOUR-LABO-16-10.md E1;
 * the laboratory's answer of 16/10, Q116). One required field, « Nom du
 * client (société ou particulier) »; the postal address, a site (else the
 * siège), the usual sampling places, and — folded under « Autres
 * informations » — the contact, phone and ICE. No e-mail: the report
 * recipients are the gestionnaire commercial's to add (the server drops
 * them for these roles, src/lib/quick-client.ts).
 *
 * Near-duplicates show while the name is typed, each with « Utiliser ce
 * client » — never a link to /commercial, a space the reception and the
 * préleveur cannot open. The server's 409 does the same: near-duplicates to
 * confirm (« Ce n'est pas le même client »), a client of that very name, or
 * an archived fiche now part of another client (N1: that client, and its
 * site). Created or chosen, the client is handed back at once, with its
 * site.
 *
 * Full screen on a phone (the préleveur in the field), a centred dialog
 * from `sm`; targets of 44 px at least, the phone and ICE keyboards
 * numeric, 16 px text on a phone so the page does not zoom. Rendered in
 * `document.body`, its submit never reaches a form around the picker.
 */
export function QuickClientDialog({
  initialName,
  origin,
  onClose,
  onPicked,
}: {
  /** The text typed in the search: the name, prefilled. */
  initialName: string;
  origin: CreationOrigin;
  onClose: () => void;
  /** The client created, or the existing one chosen instead. */
  onPicked: (client: PickedClient) => void;
}) {
  const id = useId();
  const titleId = `${id}-title`;
  const introId = `${id}-intro`;
  const formId = `${id}-form`;
  const [form, setForm] = useState<QuickClientForm>({ ...EMPTY_FORM, name: initialName.slice(0, FIELD_MAX) });
  const [moreOpen, setMoreOpen] = useState(false);
  const [nearby, setNearby] = useState<SimilarClient[]>([]);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [notSame, setNotSame] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [nameError, setNameError] = useState("");
  const [placeMessage, setPlaceMessage] = useState("");
  const [error, setError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);
  const iceRef = useRef<HTMLInputElement>(null);
  const placeRef = useRef<HTMLInputElement>(null);
  const conflictRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // Read by the Échap handler, which is set up once.
  const busyRef = useRef(false);
  useEffect(() => {
    busyRef.current = busy !== null;
  }, [busy]);

  // The page behind does not scroll under a full-screen dialog; Échap closes
  // it; Tab and Shift+Tab stay inside it (aria-modal: the page behind is out
  // of reach, the keyboard too).
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      // Rendered ones only (a folded section is not in the way).
      const focusables = [...dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.getClientRects().length > 0
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // CLIENTS-FUSION.md §5: the close clients while typing.
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      if (!shouldCheckSimilar(form.name, null, form.ice, null)) {
        setNearby([]);
        return;
      }
      fetch(`/api/clients/similar?${similarQuery(form.name, form.ice)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { similar: [] }))
        .then((data: unknown) => {
          const list = (data as { similar?: unknown } | null)?.similar;
          setNearby(Array.isArray(list) ? (list as SimilarClient[]) : []);
        })
        // A failed suggestion is not an error: the server checks again on save.
        .catch(() => undefined);
    }, SIMILAR_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [form.name, form.ice]);

  function set<K extends keyof QuickClientForm>(key: K, value: QuickClientForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setError("");
    if (key === "name") setNameError("");
    if (key === "name" || key === "ice") {
      // Another name or ICE: the previous answer no longer holds.
      setConflict(null);
      setNotSame(false);
    }
  }

  function addPlace() {
    const next = withPlace(form.places, form.placeDraft);
    if (next.refusal) {
      setPlaceMessage(next.refusal);
      placeRef.current?.focus();
      return;
    }
    setForm((current) => ({ ...current, places: next.places, placeDraft: "" }));
    setPlaceMessage("");
    placeRef.current?.focus();
  }

  function removePlace(index: number) {
    setForm((current) => ({ ...current, places: current.places.filter((_, i) => i !== index) }));
    setPlaceMessage("");
    placeRef.current?.focus();
  }

  /** An existing client chosen instead of creating one: its active sites come with it. */
  async function pickExisting(client: { id: string; name: string }, offer?: OfferedClient | null, siteId?: string | null) {
    if (busy) return;
    if (offer) {
      onPicked({
        id: offer.id,
        name: offer.name,
        ice: offer.ice,
        sites: offer.sites,
        ...(siteId && offer.sites.some((site) => site.id === siteId) ? { siteId } : {}),
      });
      return;
    }
    setBusy(`use:${client.id}`);
    setError("");
    try {
      const response = await fetch(`/api/clients/${client.id}/sites`);
      if (!response.ok) throw new Error("sites");
      onPicked({ id: client.id, name: client.name, ice: null, sites: sitesOf(await response.json()) });
    } catch {
      setError("Impossible de charger ce client. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    // Rendered in a portal: the submit must not reach a form around the picker.
    event.stopPropagation();
    if (busy) return;
    if (!form.name.trim()) {
      setNameError("Le nom du client est obligatoire.");
      nameRef.current?.focus();
      return;
    }
    if (form.ice.trim() && !isIce(form.ice)) {
      setMoreOpen(true);
      setError("L'ICE doit comporter 15 chiffres.");
      setTimeout(() => iceRef.current?.focus(), 0);
      return;
    }
    setBusy("save");
    setError("");
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(quickClientBody(form, origin, conflict?.kind === "similar" && notSame)),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      const message = typeof data.error === "string" ? data.error : "";
      if (response.status === 409 && Array.isArray(data.similar) && data.similar.length > 0) {
        setConflict({ kind: "similar", message, clients: data.similar as SimilarClient[] });
        setNotSame(false);
        setTimeout(() => conflictRef.current?.focus(), 0);
        return;
      }
      // N1: the exact name of a client, live or archived — never a transient 409.
      if (response.status === 409 && data.exactName === true) {
        setConflict({
          kind: "exact",
          message: message || "Un client porte déjà ce nom.",
          offer: offerOf(data.existing ?? data.mergedInto),
          siteId: typeof data.siteId === "string" ? data.siteId : null,
        });
        setTimeout(() => conflictRef.current?.focus(), 0);
        return;
      }
      if (!response.ok) {
        setError(message || "Création impossible.");
        return;
      }
      const created = offerOf(data);
      if (!created) {
        setError("Création impossible.");
        return;
      }
      // Created with a site: that site is the one sampled.
      onPicked({ ...created, ...(created.sites[0] ? { siteId: created.sites[0].id } : {}) });
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const exactSite =
    conflict?.kind === "exact" && conflict.offer && conflict.siteId
      ? conflict.offer.sites.find((site) => site.id === conflict.siteId) ?? null
      : null;
  const blocked = conflict?.kind === "similar" ? !notSame : conflict?.kind === "exact";
  const fieldClass = "input-field mt-1.5 px-3 text-base sm:text-sm";
  const labelClass = "block text-sm font-medium text-slate-700";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/40 sm:items-center sm:p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={introId}
        className="flex h-full w-full flex-col bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-1.5 pl-4 pr-2 sm:pl-5">
          <h2 id={titleId} className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Building2 className="h-4 w-4 text-brand" aria-hidden="true" />
            Nouveau client
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            aria-label="Fermer"
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <form id={formId} onSubmit={submit} noValidate className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
          <p id={introId} className="text-sm text-slate-600">
            Seul le nom est obligatoire. Les adresses e-mail qui recevront les rapports ne se saisissent pas ici : le
            gestionnaire commercial les ajoute sur la fiche du client.
          </p>

          <div>
            <label htmlFor={`${id}-name`} className={labelClass}>
              Nom du client (société ou particulier) <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only">(obligatoire)</span>
            </label>
            <input
              ref={nameRef}
              id={`${id}-name`}
              type="text"
              aria-required="true"
              value={form.name}
              maxLength={FIELD_MAX}
              autoComplete="off"
              autoFocus
              onChange={(event) => set("name", event.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={`${id}-name-hint${nameError ? ` ${id}-name-error` : ""}`}
              className={fieldClass}
            />
            <p id={`${id}-name-hint`} className="mt-1 text-xs text-slate-500">
              Pour un particulier : son nom et son prénom.
            </p>
            {nameError && (
              <p id={`${id}-name-error`} role="alert" className="mt-1 text-xs font-medium text-rose-700">
                {nameError}
              </p>
            )}
            {/* Mounted from the start, so the count is announced when it changes. */}
            <p aria-live="polite" className="sr-only">
              {!conflict && nearby.length > 0
                ? `${nearby.length} client${nearby.length > 1 ? "s" : ""} proche${nearby.length > 1 ? "s" : ""} de ce nom.`
                : ""}
            </p>
            {!conflict && nearby.length > 0 && (
              <div className="mt-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-amber-800">
                  <Users className="h-3.5 w-3.5" aria-hidden="true" />
                  Clients proches — est-ce l&apos;un d&apos;eux ?
                </p>
                <OfferList clients={nearby} busy={busy} onUse={(client) => void pickExisting(client)} />
              </div>
            )}
          </div>

          <div>
            <label htmlFor={`${id}-address`} className={labelClass}>
              Adresse
            </label>
            <input
              id={`${id}-address`}
              type="text"
              value={form.address}
              maxLength={FIELD_MAX}
              autoComplete="street-address"
              onChange={(event) => set("address", event.target.value)}
              aria-describedby={`${id}-address-hint`}
              className={fieldClass}
            />
            <p id={`${id}-address-hint`} className="mt-1 text-xs text-slate-500">
              Adresse postale, imprimée sur le rapport.
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-site`} className={labelClass}>
              Site (si besoin)
            </label>
            <input
              id={`${id}-site`}
              type="text"
              value={form.site}
              maxLength={FIELD_MAX}
              autoComplete="off"
              onChange={(event) => set("site", event.target.value)}
              placeholder="Ex. : Cuisine centrale"
              aria-describedby={`${id}-site-hint`}
              className={fieldClass}
            />
            <p id={`${id}-site-hint`} className="mt-1 text-xs text-slate-500">
              Vide : le siège (l&apos;adresse du client).
            </p>
          </div>

          <div>
            <label htmlFor={`${id}-place`} className={labelClass}>
              Lieux de prélèvement habituels
            </label>
            {form.places.length > 0 && (
              <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Lieux ajoutés">
                {form.places.map((place, index) => (
                  <li
                    key={place}
                    className="inline-flex min-h-[44px] items-center gap-1 rounded-full bg-slate-100 pl-3 text-sm text-slate-800"
                  >
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    <span className="break-words">{place}</span>
                    <button
                      type="button"
                      onClick={() => removePlace(index)}
                      aria-label={`Retirer ${place}`}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-200 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-1.5 flex gap-2">
              <input
                ref={placeRef}
                id={`${id}-place`}
                type="text"
                value={form.placeDraft}
                maxLength={FIELD_MAX}
                autoComplete="off"
                disabled={form.places.length >= MAX_NEW_PLACES}
                onChange={(event) => {
                  set("placeDraft", event.target.value);
                  setPlaceMessage("");
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPlace();
                  }
                }}
                placeholder="Ex. : Chambre froide 1"
                aria-describedby={`${id}-place-hint${placeMessage ? ` ${id}-place-message` : ""}`}
                className="input-field min-w-0 flex-1 px-3 text-base sm:text-sm"
              />
              <button
                type="button"
                onClick={addPlace}
                disabled={form.places.length >= MAX_NEW_PLACES}
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter
              </button>
            </div>
            <p id={`${id}-place-hint`} className="mt-1 text-xs text-slate-500">
              Proposés ensuite sur chaque échantillon de ce client ({MAX_NEW_PLACES} au plus).
            </p>
            {placeMessage && (
              <p id={`${id}-place-message`} role="alert" className="mt-1 text-xs font-medium text-rose-700">
                {placeMessage}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              aria-expanded={moreOpen}
              aria-controls={`${id}-more`}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-xl px-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Autres informations (facultatif)
              <ChevronDown className={`h-4 w-4 shrink-0 transition ${moreOpen ? "rotate-180" : ""}`} aria-hidden="true" />
            </button>
            {moreOpen && (
              <div id={`${id}-more`} className="space-y-3 border-t border-slate-200 px-3 pb-3 pt-2">
                <div>
                  <label htmlFor={`${id}-contact`} className={labelClass}>
                    Contact
                  </label>
                  <input
                    id={`${id}-contact`}
                    type="text"
                    value={form.contact}
                    maxLength={FIELD_MAX}
                    autoComplete="off"
                    onChange={(event) => set("contact", event.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-phone`} className={labelClass}>
                    Téléphone
                  </label>
                  <input
                    id={`${id}-phone`}
                    type="tel"
                    inputMode="tel"
                    value={form.phone}
                    maxLength={FIELD_MAX}
                    autoComplete="off"
                    onChange={(event) => set("phone", event.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label htmlFor={`${id}-ice`} className={labelClass}>
                    ICE
                  </label>
                  <input
                    ref={iceRef}
                    id={`${id}-ice`}
                    type="text"
                    inputMode="numeric"
                    value={form.ice}
                    maxLength={20}
                    autoComplete="off"
                    onChange={(event) => set("ice", event.target.value)}
                    aria-describedby={`${id}-ice-hint`}
                    className={fieldClass}
                  />
                  <p id={`${id}-ice-hint`} className="mt-1 text-xs text-slate-500">
                    15 chiffres — figure sur la facture.
                  </p>
                </div>
              </div>
            )}
          </div>

          {conflict && (
            <div
              ref={conflictRef}
              tabIndex={-1}
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
            >
              <p className="text-sm font-semibold text-amber-900">{conflict.message}</p>
              {conflict.kind === "similar" ? (
                <>
                  <OfferList clients={conflict.clients} busy={busy} onUse={(client) => void pickExisting(client)} />
                  <label className="mt-3 flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-medium text-amber-900">
                    <input
                      type="checkbox"
                      checked={notSame}
                      onChange={(event) => setNotSame(event.target.checked)}
                      className="h-5 w-5 rounded border-amber-400 text-brand focus:ring-brand"
                    />
                    Ce n&apos;est pas le même client
                  </label>
                </>
              ) : (
                conflict.offer && (
                  <button
                    type="button"
                    onClick={() => void pickExisting(conflict.offer!, conflict.offer, conflict.siteId)}
                    disabled={busy !== null}
                    className="mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    <Building2 className="h-4 w-4" aria-hidden="true" />
                    {exactSite
                      ? `Utiliser « ${conflict.offer.name} » — ${exactSite.name}`
                      : `Utiliser « ${conflict.offer.name} »`}
                  </button>
                )
              )}
            </div>
          )}

          {error && (
            <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
        </form>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:flex-row sm:justify-end sm:px-5">
          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            Annuler
          </button>
          <button
            type="submit"
            form={formId}
            disabled={busy !== null || blocked}
            aria-busy={busy === "save" || undefined}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
          >
            {busy === "save" && <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {busy === "save"
              ? "Création…"
              : conflict?.kind === "similar" && notSame
                ? "Créer quand même"
                : "Créer le client"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/** Close clients, each with « Utiliser ce client » (no link to the client base). */
function OfferList({
  clients,
  busy,
  onUse,
}: {
  clients: SimilarClient[];
  busy: string | null;
  onUse: (client: SimilarClient) => void;
}) {
  return (
    <ul className="mt-1.5 space-y-1.5">
      {clients.map((client) => (
        <li
          key={client.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-1.5 ring-1 ring-amber-200"
        >
          <span className="min-w-0 break-words text-sm font-medium text-slate-800">
            {client.name}{" "}
            <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
              {client.reason}
            </span>
          </span>
          <button
            type="button"
            onClick={() => onUse(client)}
            disabled={busy !== null}
            aria-label={`Utiliser ce client : ${client.name}`}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-semibold text-brand transition hover:bg-brand-light/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
          >
            {busy === `use:${client.id}` && <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Utiliser ce client
          </button>
        </li>
      ))}
    </ul>
  );
}
