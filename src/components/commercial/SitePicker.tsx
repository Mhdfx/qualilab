"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import { normalizeSiteName } from "@/lib/sites-import";
import type { PickedClient } from "./ClientPicker";

/** The option of the select that opens the creation of a site. */
const NEW_SITE = "__new__";
/** VARCHAR(191), as `validateSite` checks it. */
const SITE_NAME_MAX = 191;

/** The picked client with a site just created for it — unchanged when the client is another one. */
export function withNewSite(client: PickedClient | null, clientId: string, site: { id: string; name: string }): PickedClient | null {
  return client && client.id === clientId ? { ...client, sites: [...client.sites, site] } : client;
}

/**
 * A new site being typed, for the client it was typed for — its name (the
 * only required field) and, since 16/10 (RETOUR-LABO-16-10.md E2, R3), its
 * address, city, contact and phone, which `POST /api/clients/[id]/sites`
 * already accepts.
 */
export type SiteDraft = {
  clientId: string;
  name: string;
  address?: string;
  city?: string;
  contact?: string;
  phone?: string;
};

/** The optional fields of the sub-form. */
const SITE_DETAIL_FIELDS = ["address", "city", "phone", "contact"] as const;

/** The draft typed for the client on screen; null: the select shows (nothing typed, or typed for another client). */
export function siteDraftFor(draft: SiteDraft | null, clientId: string): SiteDraft | null {
  return clientId !== "" && draft !== null && draft.clientId === clientId ? draft : null;
}

/** The name being typed for the client on screen; null: the select shows (nothing typed, or typed for another client). */
export function siteDraftName(draft: SiteDraft | null, clientId: string): string | null {
  return siteDraftFor(draft, clientId)?.name ?? null;
}

/** A new site's name typed and not created yet: the form must not move on without it (relecture du lot 1). */
export function siteDraftPending(draftName: string | null): boolean {
  return draftName !== null && draftName.trim() !== "";
}

/**
 * Anything typed in the sub-form and not created yet — a name, or an
 * address waiting for its name: the form must not move on and lose it.
 */
export function siteDraftTyped(draft: SiteDraft | null): boolean {
  if (!draft) return false;
  return siteDraftPending(draft.name) || SITE_DETAIL_FIELDS.some((field) => (draft[field] ?? "").trim() !== "");
}

/** The body of `POST /api/clients/[id]/sites`: every field trimmed (the server stores "" as none). */
export function siteDraftBody(draft: SiteDraft): { name: string; address: string; city: string; contact: string; phone: string } {
  return {
    name: draft.name.trim(),
    address: (draft.address ?? "").trim(),
    city: (draft.city ?? "").trim(),
    contact: (draft.contact ?? "").trim(),
    phone: (draft.phone ?? "").trim(),
  };
}

/**
 * « Site de prélèvement » — the site of the picked client a série is
 * recorded on, shared by the préleveur's visit and the reception's deposit
 * (retour du 14/10, R1: « Ajouter les sites au client (Afficher) »). Always
 * shown, disabled until a client is picked: « Siège (adresse du client) »,
 * the client's active sites, then « + Nouveau site… », which opens the
 * site's sub-form — name (required), address, city, phone, contact
 * (RETOUR-LABO-16-10.md E2) — creates the site under the client
 * (`POST /api/clients/[id]/sites`, open to both roles; always active for
 * them) and selects it. The message of a refused creation stays under the
 * field.
 *
 * A name already in the list (case, accents and punctuation aside, the rule
 * of the sites import) selects that site instead of creating a second one.
 *
 * The site being typed stays here; `onDraftChange` tells the form whether
 * one is waiting to be created, so its « Continuer » refuses rather than
 * moving on with the siège (relecture du lot 1).
 */
export function SitePicker({
  id,
  client,
  value,
  onChange,
  onCreated,
  onDraftChange,
  labelClassName = "section-title mb-2",
}: {
  /** The field's id: the label points at the select, or at the name being typed. */
  id: string;
  client: PickedClient | null;
  /** The chosen site's id; "" = the siège. */
  value: string;
  onChange: (siteId: string) => void;
  /** A site was created for `clientId`: it joins the client's list and is selected (`withNewSite`). */
  onCreated: (site: { id: string; name: string }, clientId: string) => void;
  /**
   * True while a new site is typed for the client on screen (its name, or
   * any of its other fields) and not created yet; false once it is created,
   * cancelled, emptied, the client changed, or the picker removed.
   */
  onDraftChange?: (pending: boolean) => void;
  labelClassName?: string;
}) {
  const clientId = client?.id ?? "";
  const sites = client?.sites ?? [];
  // Both belong to the client they were typed for: another client picked, they no longer show.
  const [draft, setDraft] = useState<SiteDraft | null>(null);
  const [message, setMessage] = useState<{ clientId: string; tone: "error" | "info"; text: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // The client on screen when an answer comes back: a creation for the previous one is not applied.
  const currentClient = useRef(clientId);
  useEffect(() => {
    currentClient.current = clientId;
  }, [clientId]);

  /** The site being typed for the client on screen; null: the select shows. */
  const shownDraft = siteDraftFor(draft, clientId);
  const draftName = shownDraft?.name ?? null;
  const pending = siteDraftTyped(shownDraft);
  useEffect(() => {
    if (!onDraftChange) return;
    onDraftChange(pending);
    // Removed (or handed another callback) while a name waits: the form is not left blocked.
    return pending ? () => onDraftChange(false) : undefined;
  }, [pending, onDraftChange]);
  const shown = message && message.clientId === clientId ? message : null;
  const hintId = `${id}-hint`;
  const messageId = `${id}-message`;

  /** Back to the select once it is rendered again. */
  function closeDraft() {
    setDraft(null);
    setTimeout(() => selectRef.current?.focus(), 0);
  }

  /** One field of the sub-form typed; a refusal shown goes once the user types again. */
  function setField(field: "name" | (typeof SITE_DETAIL_FIELDS)[number], value: string) {
    setDraft((current) => ({ ...(current && current.clientId === clientId ? current : { name: "" }), clientId, [field]: value }));
    if (shown?.tone === "error") setMessage(null);
  }

  async function create() {
    if (shownDraft === null || creating) return;
    const forClient = clientId;
    const body = siteDraftBody(shownDraft);
    const name = body.name;
    if (!name) {
      setMessage({ clientId: forClient, tone: "error", text: "Indiquez le nom du site." });
      inputRef.current?.focus();
      return;
    }
    const key = normalizeSiteName(name);
    const existing = key ? sites.find((site) => normalizeSiteName(site.name) === key) : undefined;
    if (existing) {
      onChange(existing.id);
      setMessage({ clientId: forClient, tone: "info", text: `« ${existing.name} » existe déjà : il est sélectionné.` });
      closeDraft();
      return;
    }

    setCreating(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/clients/${forClient}/sites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => ({}))) as { id?: unknown; name?: unknown; error?: unknown };
      if (currentClient.current !== forClient) return;
      if (!response.ok || typeof data.id !== "string" || typeof data.name !== "string") {
        const refusal = typeof data.error === "string" ? data.error : "Impossible de créer le site.";
        setMessage({
          clientId: forClient,
          tone: "error",
          // The list holds the active sites only: a deactivated one keeps its name.
          text:
            response.status === 409
              ? `${refusal} S'il n'apparaît pas dans la liste, il est désactivé : demandez au gestionnaire commercial de le réactiver.`
              : refusal,
        });
        inputRef.current?.focus();
        return;
      }
      onCreated({ id: data.id, name: data.name }, forClient);
      closeDraft();
    } catch {
      if (currentClient.current === forClient) {
        setMessage({ clientId: forClient, tone: "error", text: "Une erreur réseau est survenue. Réessayez." });
      }
    } finally {
      setCreating(false);
    }
  }

  const describedBy = [!client ? hintId : null, shown ? messageId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div>
      {/* While the « Nouveau site » sub-form is open its name field has its
          own label: the heading is no label then, so that field is not named
          twice. */}
      {draftName !== null ? (
        <p className={labelClassName}>
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Site de prélèvement
        </p>
      ) : (
        <label htmlFor={id} className={labelClassName}>
          <MapPin className="h-4 w-4" aria-hidden="true" />
          Site de prélèvement
        </label>
      )}
      {draftName !== null ? (
        <div
          role="group"
          aria-label="Nouveau site"
          className="space-y-2 rounded-xl border border-slate-200 p-3"
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
              event.preventDefault();
              void create();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setMessage(null);
              closeDraft();
            }
          }}
        >
          <div>
            <label htmlFor={id} className="block text-xs font-medium text-slate-600">
              Nom du nouveau site <span aria-hidden="true" className="text-rose-600">*</span>
              <span className="sr-only">(obligatoire)</span>
            </label>
            <input
              ref={inputRef}
              id={id}
              type="text"
              aria-required="true"
              value={draftName}
              maxLength={SITE_NAME_MAX}
              onChange={(event) => setField("name", event.target.value)}
              placeholder="Ex. : Cuisine centrale"
              aria-invalid={shown?.tone === "error" ? true : undefined}
              aria-describedby={describedBy}
              className="input-field mt-1 px-3"
              autoFocus
            />
          </div>
          <SiteDetail id={`${id}-address`} label="Adresse" value={shownDraft?.address ?? ""} onChange={(v) => setField("address", v)} />
          <div className="grid grid-cols-2 gap-2">
            <SiteDetail id={`${id}-city`} label="Ville" value={shownDraft?.city ?? ""} onChange={(v) => setField("city", v)} />
            <SiteDetail
              id={`${id}-phone`}
              label="Téléphone"
              type="tel"
              value={shownDraft?.phone ?? ""}
              onChange={(v) => setField("phone", v)}
            />
          </div>
          <SiteDetail
            id={`${id}-contact`}
            label="Contact sur place"
            value={shownDraft?.contact ?? ""}
            onChange={(v) => setField("contact", v)}
          />
          <div className="flex flex-wrap gap-2 pt-1">
            <button
              type="button"
              onClick={() => void create()}
              disabled={creating}
              aria-busy={creating || undefined}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              {creating ? "Création…" : "Créer le site"}
            </button>
            <button
              type="button"
              onClick={() => {
                setMessage(null);
                closeDraft();
              }}
              disabled={creating}
              className="inline-flex min-h-[44px] shrink-0 items-center rounded-xl border border-slate-300 px-3 text-sm text-slate-600 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <select
          ref={selectRef}
          id={id}
          value={value}
          disabled={!client}
          onChange={(event) => {
            setMessage(null);
            if (event.target.value === NEW_SITE) {
              setDraft({ clientId, name: "" });
            } else {
              onChange(event.target.value);
            }
          }}
          aria-describedby={describedBy}
          className="input-field px-4"
        >
          <option value="">Siège (adresse du client)</option>
          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
          <option value={NEW_SITE}>+ Nouveau site…</option>
        </select>
      )}
      {!client && (
        <p id={hintId} className="mt-1 text-xs text-slate-500">
          Choisissez d&apos;abord le client.
        </p>
      )}
      {shown && (
        <p
          id={messageId}
          role={shown.tone === "error" ? "alert" : "status"}
          className={`mt-1 text-xs ${shown.tone === "error" ? "font-medium text-rose-700" : "text-slate-600"}`}
        >
          {shown.text}
        </p>
      )}
    </div>
  );
}

/** One optional field of the site's sub-form. */
function SiteDetail({
  id,
  label,
  value,
  onChange,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "tel";
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type={type}
        inputMode={type === "tel" ? "tel" : undefined}
        value={value}
        maxLength={SITE_NAME_MAX}
        onChange={(event) => onChange(event.target.value)}
        className="input-field mt-1 px-3"
      />
    </div>
  );
}
