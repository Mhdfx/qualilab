"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, MapPin, Plus, Receipt, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ClientPicker, type PickedClient } from "./ClientPicker";

export type BillingEntityRow = {
  id: string;
  name: string;
  archived: boolean;
  /** This client's sites whose samples are billed to it. */
  sites: { id: string; name: string }[];
};

export type BilledSiteRow = {
  id: string;
  name: string;
  client: { id: string; name: string };
};

type Picking = "billing" | "principal" | null;

/**
 * « Clients facturés » (CLIENTS-FUSION.md §4, GESTIONNAIRE and ADMIN).
 *
 * On a principal client: its billing clients (a franchisee, a holding, a
 * management company) with the sites billed to each. On a billing client:
 * the principal it is billed for and the sites billed to it. A client that
 * is neither may become either. The rules (no chains, no self-link) are the
 * server's; its refusal is shown as is.
 */
export function BillingClientsCard({
  clientId,
  clientName,
  canEdit,
  billedFor,
  billingClients,
  billedSites,
}: {
  clientId: string;
  clientName: string;
  canEdit: boolean;
  billedFor: { id: string; name: string } | null;
  billingClients: BillingEntityRow[];
  billedSites: BilledSiteRow[];
}) {
  const router = useRouter();
  const [picking, setPicking] = useState<Picking>(null);
  const [picked, setPicked] = useState<PickedClient | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const isBillingEntity = billedFor !== null;
  const isPrincipal = billingClients.length > 0;

  /** F becomes (parentId) or stops being (null) a billing client. */
  async function link(childId: string, parentId: string | null) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/clients/${childId}/billed-for`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentId }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setPicking(null);
      setPicked(null);
      setConfirming(null);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  function startPicking(next: Picking) {
    setPicking(next);
    setPicked(null);
    setConfirming(null);
    setError("");
  }

  const smallButton =
    "inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50";

  const removeControl = (childId: string, label: string) =>
    confirming === childId ? (
      <span className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => link(childId, null)}
          disabled={busy}
          className={`${smallButton} bg-rose-600 text-white hover:bg-rose-700`}
        >
          Confirmer
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          disabled={busy}
          className={`${smallButton} text-slate-600 hover:bg-slate-100`}
        >
          Annuler
        </button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => {
          setConfirming(childId);
          setError("");
        }}
        disabled={busy}
        className={`${smallButton} text-slate-600 hover:bg-rose-50 hover:text-rose-700`}
      >
        <Link2Off className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
    );

  // Nothing to show on an archived fiche without links.
  if (!canEdit && !isBillingEntity && !isPrincipal) return null;

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Receipt className="h-4 w-4" aria-hidden="true" />
          Clients facturés
        </h2>
        {canEdit && !isBillingEntity && picking === null && (
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              onClick={() => startPicking("billing")}
              className={`${smallButton} text-brand hover:bg-brand-light`}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Lier un client facturé
            </button>
            {!isPrincipal && (
              <button
                type="button"
                onClick={() => startPicking("principal")}
                className={`${smallButton} text-brand hover:bg-brand-light`}
              >
                <Link2 className="h-4 w-4" aria-hidden="true" />
                Lier à un client principal
              </button>
            )}
          </div>
        )}
      </div>
      <p className="mb-3 text-sm text-slate-500">
        Un client facturé reçoit les factures des sites qui lui sont attribués
        (« Facturé à » dans les sites). Les rapports ne changent pas.
      </p>

      {error && (
        <p role="alert" className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {picking && (
        <div className="mb-3 space-y-3 rounded-xl border border-brand/20 bg-brand-light/30 p-3">
          <ClientPicker
            label={
              picking === "billing"
                ? `Client qui recevra les factures de « ${clientName} »`
                : `Client principal dont « ${clientName} » recevra les factures`
            }
            excludeIds={[clientId, ...billingClients.map((row) => row.id)]}
            selected={picked}
            disabled={busy}
            onSelect={(client) => {
              setPicked(client);
              setError("");
            }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!picked || busy}
              onClick={() => {
                if (!picked) return;
                if (picking === "billing") link(picked.id, clientId);
                else link(clientId, picked.id);
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" aria-hidden="true" />
              {busy ? "Enregistrement…" : "Lier"}
            </button>
            <button
              type="button"
              onClick={() => startPicking(null)}
              disabled={busy}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Annuler
            </button>
          </div>
        </div>
      )}

      {isBillingEntity && billedFor && (
        <div className="rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-slate-700">
              Client facturé de{" "}
              <Link
                href={`/commercial/${billedFor.id}`}
                className="rounded font-semibold text-brand underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                {billedFor.name}
              </Link>
            </p>
            {canEdit && removeControl(clientId, "Retirer le lien")}
          </div>
          <SiteList
            sites={billedSites.map((site) => ({ id: site.id, name: site.client.id === billedFor.id ? site.name : `${site.name} (${site.client.name})` }))}
            empty={`Aucun site de « ${billedFor.name} » n'est encore facturé à ce client : choisissez « Facturé à » dans ses sites.`}
          />
        </div>
      )}

      {!isBillingEntity && (
        isPrincipal ? (
          <ul className="divide-y divide-slate-100">
            {billingClients.map((row) => (
              <li key={row.id} className="py-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <Link
                      href={`/commercial/${row.id}`}
                      className="rounded font-semibold text-slate-800 underline-offset-2 hover:text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      {row.name}
                    </Link>
                    {row.archived && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">archivé</span>
                    )}
                  </p>
                  {canEdit && removeControl(row.id, "Retirer")}
                </div>
                <SiteList sites={row.sites} empty="Aucun site facturé à ce client pour l'instant." />
              </li>
            ))}
          </ul>
        ) : (
          picking === null && (
            <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-500">
              Ce client est facturé directement : aucun client facturé lié.
            </p>
          )
        )
      )}
    </Card>
  );
}

function SiteList({ sites, empty }: { sites: { id: string; name: string }[]; empty: string }) {
  if (sites.length === 0) return <p className="mt-1 text-xs text-slate-500">{empty}</p>;
  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Sites facturés">
      {sites.map((site) => (
        <li
          key={site.id}
          className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-600 ring-1 ring-slate-200"
        >
          <MapPin className="h-3 w-3 text-slate-400" aria-hidden="true" />
          {site.name}
        </li>
      ))}
    </ul>
  );
}
