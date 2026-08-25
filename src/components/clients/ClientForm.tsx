"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";

export type EmailRow = {
  email: string;
  label: string;
  forReports: boolean;
  forAlerts: boolean;
};

export type ClientFormValues = {
  name: string;
  contact: string;
  email: string;
  phone: string;
  address: string;
  ice: string;
  emails: EmailRow[];
};

type ClientFormProps = {
  /** Absent when creating. */
  clientId?: string;
  initial: ClientFormValues;
  archived?: boolean;
};

const EMPTY_EMAIL: EmailRow = {
  email: "",
  label: "",
  forReports: true,
  forAlerts: true,
};

export function ClientForm({ clientId, initial, archived }: ClientFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<ClientFormValues>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  function set<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setError("");
  }

  function setEmail(index: number, patch: Partial<EmailRow>) {
    setValues((current) => ({
      ...current,
      emails: current.emails.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));
    setError("");
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;

    if (!values.name.trim()) {
      setError("La raison sociale est obligatoire.");
      return;
    }

    setBusy("save");
    setError("");

    try {
      const response = await fetch(
        clientId ? `/api/clients/${clientId}` : "/api/clients",
        {
          method: clientId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...values,
            // Rows the user started and abandoned are not an error.
            emails: values.emails.filter((row) => row.email.trim()),
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }

      router.refresh();
      router.push(clientId ? `/commercial/${clientId}` : `/commercial/${data.id}`);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleArchive() {
    if (!clientId || busy) return;
    setBusy("archive");
    setError("");
    try {
      const response = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !archived }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Action impossible.");
        return;
      }
      router.refresh();
      router.push(`/commercial/${clientId}`);
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Card className="p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Identité
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="name"
            label="Raison sociale"
            required
            value={values.name}
            onChange={(v) => set("name", v)}
            className="sm:col-span-2"
          />
          <Field id="contact" label="Contact" value={values.contact} onChange={(v) => set("contact", v)} />
          <Field
            id="ice"
            label="ICE"
            value={values.ice}
            onChange={(v) => set("ice", v)}
            hint="15 chiffres — figure sur la facture"
            inputMode="numeric"
          />
          <Field id="email" label="Email principal" type="email" value={values.email} onChange={(v) => set("email", v)} />
          <Field id="phone" label="Téléphone" type="tel" value={values.phone} onChange={(v) => set("phone", v)} />
          <Field
            id="address"
            label="Adresse"
            value={values.address}
            onChange={(v) => set("address", v)}
            className="sm:col-span-2"
          />
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            Destinataires des envois
          </h2>
          <p className="text-xs text-slate-500">
            Qui reçoit les rapports et les alertes de contamination
          </p>
        </div>

        {values.emails.length === 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
            Sans adresse, aucun rapport ni alerte ne pourra être envoyé à ce
            client.
          </p>
        )}

        <ul className="mt-3 space-y-3">
          {values.emails.map((row, index) => (
            <li key={index} className="rounded-xl border border-slate-200 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_auto]">
                <Field
                  id={`email-${index}`}
                  label="Adresse"
                  type="email"
                  value={row.email}
                  onChange={(v) => setEmail(index, { email: v })}
                />
                <Field
                  id={`label-${index}`}
                  label="Libellé"
                  value={row.label}
                  onChange={(v) => setEmail(index, { label: v })}
                  placeholder="Ex. : Direction"
                />
                <button
                  type="button"
                  onClick={() =>
                    setValues((c) => ({
                      ...c,
                      emails: c.emails.filter((_, i) => i !== index),
                    }))
                  }
                  aria-label={`Retirer ${row.email || "cette adresse"}`}
                  className="mt-auto flex h-[42px] w-[42px] items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-4">
                <Toggle
                  checked={row.forReports}
                  onChange={(v) => setEmail(index, { forReports: v })}
                  label="Reçoit les rapports"
                />
                <Toggle
                  checked={row.forAlerts}
                  onChange={(v) => setEmail(index, { forAlerts: v })}
                  label="Reçoit les alertes"
                />
              </div>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setValues((c) => ({ ...c, emails: [...c.emails, { ...EMPTY_EMAIL }] }))}
          className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3.5 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter une adresse
        </button>
      </Card>

      {error && (
        <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row-reverse">
        <PrimaryButton type="submit" disabled={!!busy} className="sm:flex-1">
          {busy === "save" ? "Enregistrement…" : clientId ? "Enregistrer" : "Créer le client"}
        </PrimaryButton>
        <SecondaryButton type="button" onClick={() => router.back()} disabled={!!busy}>
          Annuler
        </SecondaryButton>

        {clientId && (
          <button
            type="button"
            onClick={toggleArchive}
            disabled={!!busy}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:mr-auto"
          >
            {archived ? (
              <>
                <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                Réactiver
              </>
            ) : (
              <>
                <Archive className="h-4 w-4" aria-hidden="true" />
                Archiver
              </>
            )}
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  required,
  type = "text",
  hint,
  placeholder,
  className = "",
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  hint?: string;
  placeholder?: string;
  className?: string;
  inputMode?: "numeric" | "text";
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label} {required && <span className="text-rose-600">*</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-brand focus:ring-brand"
      />
      {label}
    </label>
  );
}
