"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Building2, Check, KeyRound, Plus, RotateCcw, Search, UserCog, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ASSIGNABLE_ROLES, PORTAL_ROLE, ROLE_LABELS, type Role } from "@/lib/roles";

/** The client of a « Client (portail) » account (PORTAIL.md §1). */
export type UserClient = {
  id: string;
  name: string;
  archived: boolean;
  mergedIntoId: string | null;
};

export type UserRow = {
  id: string;
  name: string;
  username: string | null;
  role: string | null;
  banned: boolean | null;
  /** Optional: read from GET /api/admin/users when the page does not pass it. */
  clientId?: string | null;
  client?: UserClient | null;
};

type PickedClient = { id: string; name: string };

/**
 * The portal clients of the accounts, by user id. /admin/utilisateurs selects
 * them with the users; a caller that does not (no `client` key on its rows)
 * gets them from GET /api/admin/users, read again whenever the list changes
 * (after a creation or a role change, `router.refresh()`).
 */
function useAccountClients(users: UserRow[]): Record<string, UserClient | null> {
  const [clients, setClients] = useState<Record<string, UserClient | null>>({});
  const signature = users.map((user) => `${user.id}:${user.role}`).join("|");
  const provided = users.every((user) => user.client !== undefined);

  useEffect(() => {
    if (provided) return;
    let cancelled = false;
    fetch("/api/admin/users", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((rows: UserRow[] | null) => {
        if (cancelled || !Array.isArray(rows)) return;
        setClients(Object.fromEntries(rows.map((row) => [row.id, row.client ?? null])));
      })
      .catch(() => {
        // The list still works without the client names.
      });
    return () => {
      cancelled = true;
    };
  }, [signature, provided]);

  return clients;
}

/**
 * The laboratory's accounts.
 *
 * The admin provisions everyone — there is no self-service sign-up. Disabling
 * an account also revokes its sessions, so a departure is effective at once.
 */
export function UsersManager({
  users,
  selfId,
}: {
  users: UserRow[];
  selfId: string;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [resetFor, setResetFor] = useState<string | null>(null);
  // The account whose client is being chosen: on the way to « Client
  // (portail) », or to move a portal account to another client.
  const [clientFor, setClientFor] = useState<string | null>(null);
  const accountClients = useAccountClients(users);

  async function patch(id: string, body: Record<string, unknown>, tag: string) {
    if (busy) return;
    setBusy(tag);
    setError("");
    try {
      const response = await fetch(`/api/admin/users/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Action impossible.");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {users.length} compte{users.length > 1 ? "s" : ""} · les comptes sont
          créés ici, jamais en libre-service.
        </p>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Nouveau compte
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      {creating && (
        <CreateUserForm
          onDone={() => {
            setCreating(false);
            router.refresh();
          }}
          onError={setError}
        />
      )}

      <Card className="overflow-hidden">
        <ul className="divide-y divide-slate-100">
          {users.map((user) => {
            const isSelf = user.id === selfId;
            const isPortal = user.role === PORTAL_ROLE;
            const client = user.client ?? accountClients[user.id] ?? null;
            const clientClosed = !!client && (client.archived || client.mergedIntoId !== null);
            return (
              <li key={user.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 font-medium text-slate-800">
                      {user.name}
                      <span className="font-mono text-xs text-slate-500">
                        {user.username}
                      </span>
                      {user.banned && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 ring-1 ring-rose-200">
                          désactivé
                        </span>
                      )}
                      {isSelf && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                          vous
                        </span>
                      )}
                    </p>
                    {isPortal && (
                      <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                        <Building2 className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                        {client ? (
                          <>
                            Portail de <span className="font-medium text-slate-700">{client.name}</span>
                            {clientClosed && (
                              <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                                {client.mergedIntoId ? "client fusionné" : "client archivé"} — portail fermé
                              </span>
                            )}
                          </>
                        ) : user.id in accountClients ? (
                          <span className="font-medium text-rose-600">Aucun client rattaché — portail fermé</span>
                        ) : (
                          <span>Client (portail)</span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${user.id}`}>
                      Rôle de {user.name}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      value={user.role ?? ""}
                      disabled={isSelf || !!busy}
                      onChange={(event) => {
                        const next = event.target.value;
                        // A portal account needs its client first (PORTAIL.md §1).
                        if (next === PORTAL_ROLE) {
                          setClientFor(user.id);
                          return;
                        }
                        setClientFor(null);
                        patch(user.id, { role: next }, `role-${user.id}`);
                      }}
                      className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {ASSIGNABLE_ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role as Role]}
                        </option>
                      ))}
                    </select>

                    {isPortal && (
                      <button
                        type="button"
                        disabled={isSelf || !!busy}
                        onClick={() => setClientFor(clientFor === user.id ? null : user.id)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
                      >
                        <Building2 className="h-3.5 w-3.5" aria-hidden="true" />
                        Client
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isSelf || !!busy}
                      onClick={() => setResetFor(resetFor === user.id ? null : user.id)}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40"
                    >
                      <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                      Mot de passe
                    </button>

                    <button
                      type="button"
                      disabled={isSelf || !!busy}
                      onClick={() =>
                        patch(user.id, { banned: !user.banned }, `ban-${user.id}`)
                      }
                      className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-40 ${
                        user.banned
                          ? "text-emerald-700 hover:bg-emerald-50"
                          : "text-rose-600 hover:bg-rose-50"
                      }`}
                    >
                      {user.banned ? (
                        <>
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          Réactiver
                        </>
                      ) : (
                        <>
                          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
                          Désactiver
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {clientFor === user.id && (
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="mb-2 text-xs text-slate-600">
                      {isPortal
                        ? "Choisissez le client dont ce compte consultera les échantillons et les rapports. Ses sessions seront déconnectées."
                        : "Un compte « Client (portail) » consulte les échantillons et les rapports d'un seul client : choisissez lequel. Ses sessions seront déconnectées."}
                    </p>
                    <ClientPicker
                      id={`client-${user.id}`}
                      value={null}
                      onChange={async (picked) => {
                        if (!picked) return;
                        const ok = await patch(
                          user.id,
                          isPortal ? { clientId: picked.id } : { role: PORTAL_ROLE, clientId: picked.id },
                          `client-${user.id}`
                        );
                        if (ok) setClientFor(null);
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setClientFor(null)}
                      className="mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      Annuler
                    </button>
                  </div>
                )}

                {resetFor === user.id && (
                  <ResetPasswordForm
                    onSubmit={async (password) => {
                      const ok = await patch(user.id, { password }, `pw-${user.id}`);
                      if (ok) setResetFor(null);
                    }}
                    onCancel={() => setResetFor(null)}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function CreateUserForm({
  onDone,
  onError,
}: {
  onDone: () => void;
  onError: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<string>("PRELEVEUR");
  const [client, setClient] = useState<PickedClient | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    if (role === PORTAL_ROLE && !client) {
      onError("Choisissez le client de ce compte portail.");
      return;
    }
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          username,
          password,
          role,
          ...(role === PORTAL_ROLE && client ? { clientId: client.id } : {}),
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        onError(data.error ?? "Création impossible.");
        return;
      }
      onDone();
    } catch {
      onError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-4 border-l-4 border-l-brand p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        <UserCog className="h-4 w-4 text-brand" aria-hidden="true" />
        Nouveau compte
      </h2>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="u-name" label="Nom complet" value={name} onChange={setName} />
        <Field
          id="u-username"
          label="Identifiant"
          value={username}
          onChange={(v) => setUsername(v.toLowerCase())}
          hint="3–30 caractères, sans espace"
        />
        <Field
          id="u-password"
          label="Mot de passe initial"
          type="password"
          value={password}
          onChange={setPassword}
          hint="Au moins 8 caractères"
        />
        <div>
          <label htmlFor="u-role" className="block text-xs font-medium text-slate-600">
            Rôle
          </label>
          <select
            id="u-role"
            value={role}
            onChange={(event) => setRole(event.target.value)}
            className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r as Role]}
              </option>
            ))}
          </select>
        </div>
      </div>
      {role === PORTAL_ROLE && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-medium text-slate-600">
            Client <span className="text-rose-600">*</span>
          </p>
          <ClientPicker id="u-client" value={client} onChange={setClient} />
          <p className="mt-1 text-[11px] text-slate-500">
            Le compte ne verra que les échantillons et les rapports de ce client.
          </p>
        </div>
      )}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Création…" : "Créer le compte"}
        </button>
      </div>
    </Card>
  );
}

function ResetPasswordForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");

  return (
    <div className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-slate-50 p-3">
      <div className="min-w-[220px] flex-1">
        <Field
          id="reset-password"
          label="Nouveau mot de passe"
          type="password"
          value={password}
          onChange={setPassword}
          hint="Au moins 8 caractères — ses sessions seront déconnectées"
        />
      </div>
      <button
        type="button"
        onClick={() => onSubmit(password)}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-brand px-3.5 text-sm font-semibold text-white transition hover:bg-brand-dark"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        Réinitialiser
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Annuler
      </button>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-medium text-slate-600">
        {label}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete="new-password"
        className="mt-1 min-h-[38px] w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      {hint && <p className="mt-0.5 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

/**
 * Picks the client of a portal account: a search on the active clients
 * (an archived or merged one never opens the portal), 20 results at most.
 */
function ClientPicker({
  id,
  value,
  onChange,
}: {
  id: string;
  value: PickedClient | null;
  onChange: (client: PickedClient | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; ice: string | null }[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (value) return;
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/admin/users/clients?q=${encodeURIComponent(query.trim())}`, {
          cache: "no-store",
        });
        const data = response.ok ? await response.json() : null;
        if (!cancelled) {
          setResults(Array.isArray(data) ? data : []);
          setFailed(!response.ok);
        }
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, value]);

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
        <Building2 className="h-4 w-4 text-brand" aria-hidden="true" />
        <span className="font-medium text-slate-800">{value.name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="ml-auto text-xs font-medium text-brand hover:underline"
        >
          Changer
        </button>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Rechercher un client
      </label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden="true"
        />
        <input
          id={id}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un client (nom ou ICE)…"
          autoComplete="off"
          className="min-h-[38px] w-full rounded-lg border border-slate-300 bg-white pl-8 pr-2.5 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
        />
      </div>
      <div className="mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white" aria-live="polite">
        {failed ? (
          <p className="px-3 py-2 text-xs text-rose-600">La liste des clients n&apos;a pas pu être chargée.</p>
        ) : loading && results.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Recherche…</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-2 text-xs text-slate-500">Aucun client actif ne correspond.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {results.map((result) => (
              <li key={result.id}>
                <button
                  type="button"
                  onClick={() => onChange({ id: result.id, name: result.name })}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 transition hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
                >
                  <span className="truncate">{result.name}</span>
                  {result.ice && <span className="shrink-0 font-mono text-[11px] text-slate-400">ICE {result.ice}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
