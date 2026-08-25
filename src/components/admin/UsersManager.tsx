"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, KeyRound, Plus, RotateCcw, UserCog, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/roles";

export type UserRow = {
  id: string;
  name: string;
  username: string | null;
  role: string | null;
  banned: boolean | null;
};

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
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`role-${user.id}`}>
                      Rôle de {user.name}
                    </label>
                    <select
                      id={`role-${user.id}`}
                      value={user.role ?? ""}
                      disabled={isSelf || !!busy}
                      onChange={(event) =>
                        patch(user.id, { role: event.target.value }, `role-${user.id}`)
                      }
                      className="min-h-[36px] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-400"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>
                          {ROLE_LABELS[role as Role]}
                        </option>
                      ))}
                    </select>

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
  const [saving, setSaving] = useState(false);

  async function save() {
    if (saving) return;
    setSaving(true);
    onError("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, username, password, role }),
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
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r as Role]}
              </option>
            ))}
          </select>
        </div>
      </div>
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
