"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ALERT_COPY_LABEL_MAX, ALERT_COPY_MESSAGES, copiesKind } from "@/lib/alert-copies";

export type AlertCopyRow = {
  id: string;
  email: string;
  label: string | null;
  allClients: boolean | null;
  active: boolean | null;
  /** L6: null (an address of L5) reads as true. */
  forAlerts: boolean | null;
  /** L6: null reads as false. */
  forReports: boolean | null;
  clients: { client: { id: string; name: string } }[];
};

type Draft = {
  email: string;
  label: string;
  allClients: boolean;
  active: boolean;
  clientIds: string[];
  forAlerts: boolean;
  forReports: boolean;
};

/** A new address receives both (R-16: « + 2 adresses dans tous les envois »). */
const EMPTY: Draft = { email: "", label: "", allClients: true, active: true, clientIds: [], forAlerts: true, forReports: true };

/** « Alertes et rapports », « Alertes », « Rapports » — what an address receives. */
function kindsText(row: Pick<AlertCopyRow, "forAlerts" | "forReports">): string {
  const alerts = copiesKind(row, "alerts");
  const reports = copiesKind(row, "reports");
  return alerts && reports ? "Alertes et rapports" : reports ? "Rapports" : "Alertes";
}

/**
 * « Copies internes (alertes et rapports) » — the laboratory's addresses
 * (direction, qualité…) in copy of what leaves for the client, of every
 * client or of the clients chosen (every site of a chosen client). L5
 * (RETOUR-LABO-28-10.md, Q93) for the contamination alerts; L6
 * (RETOUR-LABO-04-11.md, R-16) for the reports too — each address receives
 * the alerts, the reports or both. The identity's e-mail stays in copy of
 * every alert, as before; a report is copied to the addresses ticked
 * « Rapports » only, at its first send and at every resend.
 */
export function AlertCopiesManager({ initial, clients }: { initial: AlertCopyRow[]; clients: { id: string; name: string }[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<AlertCopyRow[]>(initial);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [clientQuery, setClientQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const names = new Map(clients.map((c) => [c.id, c.name]));
  rows.forEach((row) => row.clients.forEach(({ client }) => names.set(client.id, client.name)));

  function edit(row: AlertCopyRow | null) {
    setError("");
    setClientQuery("");
    setEditing(row ? row.id : "new");
    setDraft(
      row
        ? {
            email: row.email,
            label: row.label ?? "",
            allClients: row.allClients !== false,
            active: row.active !== false,
            clientIds: row.clients.map((c) => c.client.id),
            forAlerts: copiesKind(row, "alerts"),
            forReports: copiesKind(row, "reports"),
          }
        : EMPTY
    );
  }

  async function submit() {
    if (busy) return;
    if (!draft.forAlerts && !draft.forReports) {
      setError(ALERT_COPY_MESSAGES.kind);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const isNew = editing === "new";
      const response = await fetch(isNew ? "/api/admin/alert-copies" : `/api/admin/alert-copies/${editing}`, {
        method: isNew ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = (await response.json().catch(() => ({}))) as AlertCopyRow & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setRows((current) => (isNew ? [...current, data] : current.map((row) => (row.id === data.id ? data : row))));
      setEditing(null);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: AlertCopyRow) {
    if (busy || !window.confirm(`Retirer ${row.email} des copies internes (alertes et rapports) ?`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/alert-copies/${row.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Suppression impossible.");
        return;
      }
      setRows((current) => current.filter((r) => r.id !== row.id));
      if (editing === row.id) setEditing(null);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const needle = clientQuery.trim().toLowerCase();
  const matches = needle ? clients.filter((c) => c.name.toLowerCase().includes(needle) && !draft.clientIds.includes(c.id)).slice(0, 8) : [];

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <BellRing className="h-4 w-4 text-brand" aria-hidden="true" />
        Copies internes (alertes et rapports)
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Les adresses du laboratoire (direction, qualité…) mises en copie des alertes de contamination, des rapports ou des
        deux, pour tous les clients ou pour les clients choisis (tous leurs sites). Un rapport est copié à son premier envoi
        comme à chaque renvoi, jamais en double avec les adresses du client. L&apos;e-mail de l&apos;identité reste en copie de
        chaque alerte.
      </p>

      {rows.length === 0 ? (
        <p className="mt-4 text-sm italic text-slate-400">Aucune adresse — seul l&apos;e-mail de l&apos;identité est en copie.</p>
      ) : (
        <ul className="mt-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm">
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-900">{row.email}</span>
                {row.label && <span className="ml-2 text-slate-500">{row.label}</span>}
                <span className="block text-xs text-slate-500">
                  {row.active === false ? "Désactivée · " : ""}
                  {kindsText(row)} ·{" "}
                  {row.allClients !== false ? "tous les clients" : `clients choisis : ${row.clients.map((c) => c.client.name).join(", ")}`}
                </span>
              </span>
              <button type="button" onClick={() => edit(row)} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 font-medium text-brand hover:bg-brand/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Modifier
              </button>
              <button type="button" onClick={() => remove(row)} disabled={busy} className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 font-medium text-rose-600 hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50">
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <div className="mt-4 rounded-xl border border-slate-200 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="copy-email" className="block text-sm font-medium text-slate-700">Adresse e-mail</label>
              <input id="copy-email" type="email" autoComplete="off" maxLength={191} value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="input-field mt-1.5 px-3" />
            </div>
            <div>
              <label htmlFor="copy-label" className="block text-sm font-medium text-slate-700">
                Libellé <span className="font-normal text-slate-500">(facultatif)</span>
              </label>
              <input id="copy-label" type="text" maxLength={ALERT_COPY_LABEL_MAX} placeholder="Direction, Qualité…" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className="input-field mt-1.5 px-3" />
            </div>
          </div>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-slate-700">Reçoit en copie</legend>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.forAlerts}
                  onChange={(e) => setDraft({ ...draft, forAlerts: e.target.checked })}
                  className="h-4 w-4 accent-brand"
                />
                Alertes de contamination
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.forReports}
                  onChange={(e) => setDraft({ ...draft, forReports: e.target.checked })}
                  className="h-4 w-4 accent-brand"
                />
                Rapports (premier envoi et renvois)
              </label>
            </div>
          </fieldset>
          <fieldset className="mt-4">
            <legend className="text-sm font-medium text-slate-700">Pour</legend>
            <div className="mt-1.5 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="copy-scope" checked={draft.allClients} onChange={() => setDraft({ ...draft, allClients: true })} className="h-4 w-4 accent-brand" />
                Tous les clients
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="copy-scope" checked={!draft.allClients} onChange={() => setDraft({ ...draft, allClients: false })} className="h-4 w-4 accent-brand" />
                Clients choisis
              </label>
            </div>
          </fieldset>
          {!draft.allClients && (
            <div className="mt-3">
              <label htmlFor="copy-client" className="block text-sm font-medium text-slate-700">Ajouter un client</label>
              <input id="copy-client" type="search" autoComplete="off" value={clientQuery} onChange={(e) => setClientQuery(e.target.value)} placeholder="Nom du client" className="input-field mt-1.5 px-3" />
              {matches.length > 0 && (
                <ul className="mt-1 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white text-sm shadow-sm">
                  {matches.map((client) => (
                    <li key={client.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({ ...draft, clientIds: [...draft.clientIds, client.id] });
                          setClientQuery("");
                        }}
                        className="flex min-h-[40px] w-full items-center gap-2 px-3 text-left hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                      >
                        <Plus className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {client.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <ul className="mt-2 flex flex-wrap gap-2">
                {draft.clientIds.map((id) => (
                  <li key={id} className="inline-flex items-center gap-1 rounded-full bg-slate-100 py-1 pl-3 pr-1 text-sm text-slate-700">
                    {names.get(id) ?? "Client"}
                    <button
                      type="button"
                      onClick={() => setDraft({ ...draft, clientIds: draft.clientIds.filter((c) => c !== id) })}
                      aria-label={`Retirer ${names.get(id) ?? "ce client"}`}
                      className="rounded-full p-1 text-slate-500 hover:bg-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} className="h-4 w-4 accent-brand" />
            Active
          </label>
          {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={submit} disabled={busy} className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50">
              <Check className="h-4 w-4" aria-hidden="true" />
              {busy ? "Enregistrement…" : "Enregistrer l'adresse"}
            </button>
            <button type="button" onClick={() => setEditing(null)} disabled={busy} className="min-h-[44px] rounded-xl px-4 text-sm font-medium text-slate-600 hover:bg-slate-100">
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <>
          {error && <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          <button type="button" onClick={() => edit(null)} className="mt-4 inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand">
            <Plus className="h-4 w-4" aria-hidden="true" />
            Ajouter une adresse
          </button>
        </>
      )}
    </Card>
  );
}
