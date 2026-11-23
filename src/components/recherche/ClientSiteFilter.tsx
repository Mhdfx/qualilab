"use client";

import { useRef, useState } from "react";
import { SIEGE } from "@/lib/sample-search";

export type ClientFilterOption = { id: string; name: string };
export type SiteFilterOption = { id: string; clientId: string; name: string; active: boolean };

/**
 * « Client » and « Site » of the search form (RETOUR-LABO-06-10.md §5, V5):
 * the site list follows the chosen client and stays disabled until a client
 * with sites is chosen. Two plain named selects, so the GET form submits
 * them like its other fields (a disabled select is not sent).
 *
 * The page sends the sites of the client in the address only (lot
 * performance P2-2); another client's are asked for when it is chosen
 * (`GET /api/recherche/sites`, the roles of /recherche), each client once.
 */
export function ClientSiteFilter({
  clients,
  sites,
  clientId,
  siteId,
}: {
  clients: ClientFilterOption[];
  /** The sites of `clientId` (inactive ones included); empty without a client. */
  sites: SiteFilterOption[];
  clientId: string | null;
  siteId: string | null;
}) {
  const [client, setClient] = useState(clientId ?? "");
  const [site, setSite] = useState(siteId ?? "");
  // The sites read so far, by client: the page's, then each one asked for.
  const [sitesOf, setSitesOf] = useState<Record<string, SiteFilterOption[]>>(() =>
    clientId ? { [clientId]: sites.filter((s) => s.clientId === clientId) } : {}
  );
  const [failed, setFailed] = useState(false);
  // The client last chosen: a slower answer for an earlier choice is dropped.
  const wanted = useRef(client);

  async function loadSites(id: string) {
    try {
      const response = await fetch(`/api/recherche/sites?client=${encodeURIComponent(id)}`);
      const data: unknown = response.ok ? await response.json() : null;
      if (wanted.current !== id) return;
      if (!Array.isArray(data)) {
        setFailed(true);
        return;
      }
      setSitesOf((current) => ({ ...current, [id]: data as SiteFilterOption[] }));
    } catch {
      if (wanted.current === id) setFailed(true);
    }
  }

  const loaded = client ? sitesOf[client] : undefined;
  const options = loaded ?? [];
  const loading = Boolean(client) && loaded === undefined && !failed;
  const disabled = !client || options.length === 0;

  return (
    <>
      <div>
        <label htmlFor="client" className="block text-sm font-medium text-slate-700">Client</label>
        <select
          id="client"
          name="client"
          value={client}
          onChange={(event) => {
            const next = event.target.value;
            wanted.current = next;
            setClient(next);
            setSite("");
            setFailed(false);
            if (next && sitesOf[next] === undefined) void loadSites(next);
          }}
          className="input-field mt-1.5 px-3"
        >
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="site" className="block text-sm font-medium text-slate-700">Site</label>
        <select
          id="site"
          name="site"
          value={disabled ? "" : site}
          disabled={disabled}
          aria-busy={loading || undefined}
          onChange={(event) => setSite(event.target.value)}
          className="input-field mt-1.5 px-3 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">
            {!client
              ? "Choisissez d'abord un client"
              : loading
                ? "Chargement des sites…"
                : failed
                  ? "Sites indisponibles, choisissez à nouveau le client"
                  : options.length === 0
                    ? "Aucun site pour ce client"
                    : "Tous les sites"}
          </option>
          {!disabled && <option value={SIEGE}>Siège (sans site)</option>}
          {options.map((s) => (
            <option key={s.id} value={s.id}>{s.active ? s.name : `${s.name} (inactif)`}</option>
          ))}
        </select>
      </div>
    </>
  );
}
