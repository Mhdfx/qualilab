"use client";

import { useMemo, useState } from "react";
import { SIEGE } from "@/lib/sample-search";

export type ClientFilterOption = { id: string; name: string };
export type SiteFilterOption = { id: string; clientId: string; name: string; active: boolean };

/**
 * « Client » and « Site » of the search form (RETOUR-LABO-06-10.md §5, V5):
 * the site list follows the chosen client and stays disabled until a client
 * with sites is chosen. Two plain named selects, so the GET form submits
 * them like its other fields (a disabled select is not sent).
 */
export function ClientSiteFilter({
  clients,
  sites,
  clientId,
  siteId,
}: {
  clients: ClientFilterOption[];
  sites: SiteFilterOption[];
  clientId: string | null;
  siteId: string | null;
}) {
  const [client, setClient] = useState(clientId ?? "");
  const [site, setSite] = useState(siteId ?? "");
  const options = useMemo(() => sites.filter((s) => s.clientId === client), [sites, client]);
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
            setClient(event.target.value);
            setSite("");
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
          onChange={(event) => setSite(event.target.value)}
          className="input-field mt-1.5 px-3 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
        >
          <option value="">{!client ? "Choisissez d'abord un client" : options.length === 0 ? "Aucun site pour ce client" : "Tous les sites"}</option>
          {!disabled && <option value={SIEGE}>Siège (sans site)</option>}
          {options.map((s) => (
            <option key={s.id} value={s.id}>{s.active ? s.name : `${s.name} (inactif)`}</option>
          ))}
        </select>
      </div>
    </>
  );
}
