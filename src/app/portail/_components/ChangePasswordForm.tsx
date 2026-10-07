"use client";

import { useState } from "react";
import { Check } from "lucide-react";

/**
 * « Mon compte » — the password change, sent to /api/portail/compte/mot-de-passe
 * (Better Auth checks the current password; the other sessions are closed).
 */
export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setDone(false);
    if (newPassword !== confirmPassword) {
      setError("Les deux saisies du nouveau mot de passe ne correspondent pas.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/portail/compte/mot-de-passe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Le mot de passe n'a pas pu être modifié. Réessayez.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setDone(true);
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

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Votre mot de passe a été modifié. Vos autres sessions ont été déconnectées.
        </p>
      )}

      <button
        type="submit"
        disabled={saving || !currentPassword || !newPassword || !confirmPassword}
        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark disabled:opacity-50"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {saving ? "Enregistrement…" : "Changer le mot de passe"}
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
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
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
        className="input-field mt-1.5 px-3"
      />
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}
