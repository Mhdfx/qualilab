"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { PASSWORD_STILL_REQUIRED_MESSAGE, passwordChangeNext } from "@/lib/password-change";

/** The portal's route; the laboratory's « Mon compte » (/compte) passes its own. */
const PORTAL_PASSWORD_ENDPOINT = "/api/portail/compte/mot-de-passe";

/**
 * « Mon compte » — the password change, sent to `endpoint` (the portal's
 * route by default, `/api/compte/mot-de-passe` for the laboratory's staff).
 * Better Auth checks the current password; the other sessions are closed.
 *
 * `required` (Q81, « Mot de passe à changer »): the administrator created
 * the account or reset its password — the form takes the focus, and once
 * the route has cleared the flag it answers `redirectTo` (the dashboard),
 * where the page goes. Should the flag fail to clear it answers
 * `stillRequired`: the password is changed all the same, so the form says
 * the new one is now the current one (the administrator's no longer works).
 */
export function ChangePasswordForm({
  endpoint = PORTAL_PASSWORD_ENDPOINT,
  required = false,
}: {
  endpoint?: string;
  required?: boolean;
}) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<"STAY" | "LEAVING" | null>(null);
  // Kept across the next attempts: the current password is the one chosen.
  const [stillRequired, setStillRequired] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving || done === "LEAVING") return;
    setError("");
    setDone(null);
    if (newPassword !== confirmPassword) {
      setError("Les deux saisies du nouveau mot de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirectTo?: unknown;
        stillRequired?: unknown;
      };
      if (!response.ok) {
        setError(data.error ?? "Le mot de passe n'a pas pu être modifié. Réessayez.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      const next = passwordChangeNext(data);
      setStillRequired(next.kind === "STILL_REQUIRED");
      if (next.kind === "STILL_REQUIRED") {
        // Changed, but « Mon compte » still asks: the page re-reads the account.
        router.refresh();
        return;
      }
      if (next.kind === "OPEN") {
        // The password is chosen: the account's own space opens.
        setDone("LEAVING");
        router.replace(next.path);
        router.refresh();
        return;
      }
      setDone("STAY");
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3">
      <PasswordField
        id="current-password"
        label="Mot de passe actuel"
        value={currentPassword}
        onChange={setCurrentPassword}
        autoComplete="current-password"
        hint={
          stillRequired
            ? "Celui que vous venez d'enregistrer"
            : required
              ? "Celui qui vous a été communiqué"
              : undefined
        }
        autoFocus={required}
      />
      <PasswordField
        id="new-password"
        label="Nouveau mot de passe"
        value={newPassword}
        onChange={setNewPassword}
        autoComplete="new-password"
        hint="Au moins 8 caractères"
      />
      <PasswordField
        id="confirm-password"
        label="Confirmer le nouveau mot de passe"
        value={confirmPassword}
        onChange={setConfirmPassword}
        autoComplete="new-password"
      />

      {stillRequired && (
        <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {PASSWORD_STILL_REQUIRED_MESSAGE}
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {done === "LEAVING"
            ? "Votre mot de passe est enregistré. Ouverture de votre espace…"
            : "Votre mot de passe a été modifié. Vos autres sessions ont été déconnectées."}
        </p>
      )}

      <button
        type="submit"
        disabled={saving || done === "LEAVING" || !currentPassword || !newPassword || !confirmPassword}
        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {saving ? "Enregistrement…" : required ? "Choisir ce mot de passe" : "Changer le mot de passe"}
      </button>
    </form>
  );
}

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="password"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="input-field mt-1.5 px-3"
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-0.5 text-xs text-slate-500">
          {hint}
        </p>
      )}
    </div>
  );
}
