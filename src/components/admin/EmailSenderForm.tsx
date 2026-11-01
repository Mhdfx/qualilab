"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Send } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { senderHeaders, type SenderSettings } from "@/lib/email-sender";

const FIELDS: { key: keyof SenderSettings; label: string; type: "email" | "text"; hint: string }[] = [
  {
    key: "emailSenderAddress",
    label: "Adresse d'expédition",
    type: "email",
    hint: "Une vraie boîte du laboratoire, que le client peut joindre — jamais une adresse « no-reply ».",
  },
  { key: "emailSenderName", label: "Nom affiché", type: "text", hint: "Vide : la raison sociale." },
  { key: "emailReplyTo", label: "Adresse de réponse", type: "email", hint: "Vide : l'e-mail de l'identité, s'il diffère de l'expéditeur." },
];

/**
 * « Envoi des e-mails » (RETOUR-LABO-28-10.md L4 — « Nous n'utilisons pas
 * d'adresse no-reply ! »): who the reports, alerts and notices come from,
 * and where the client's answers go. Shows the result (`senderHeaders`)
 * before saving. The provider only sends once the laboratory's domain is
 * verified (NEEDEDINFO item 2): until then every send stays « simulé ».
 */
export function EmailSenderForm({
  initial,
  company,
  envFrom,
}: {
  initial: SenderSettings;
  company: { name: string; email: string };
  envFrom: string | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<SenderSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const preview = senderHeaders({
    settings: {
      emailSenderAddress: values.emailSenderAddress?.trim() || null,
      emailSenderName: values.emailSenderName?.trim() || null,
      emailReplyTo: values.emailReplyTo?.trim() || null,
    },
    envFrom,
    company,
  });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/company/email-sender", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<SenderSettings> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setValues({ emailSenderAddress: data.emailSenderAddress ?? null, emailSenderName: data.emailSenderName ?? null, emailReplyTo: data.emailReplyTo ?? null });
      setSaved(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} noValidate>
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Send className="h-4 w-4 text-brand" aria-hidden="true" />
          Envoi des e-mails
        </h2>
        <p className="mt-1 text-sm text-slate-500">L&apos;expéditeur des rapports, des alertes et des avis envoyés aux clients.</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((field) => (
            <div key={field.key} className={field.key === "emailSenderAddress" ? "sm:col-span-2" : ""}>
              <label htmlFor={`sender-${field.key}`} className="block text-sm font-medium text-slate-700">
                {field.label} <span className="font-normal text-slate-500">(facultatif)</span>
              </label>
              <input
                id={`sender-${field.key}`}
                type={field.type}
                autoComplete="off"
                maxLength={field.type === "email" ? 191 : 120}
                aria-describedby={`sender-${field.key}-hint`}
                value={values[field.key] ?? ""}
                onChange={(e) => setValues((current) => ({ ...current, [field.key]: e.target.value }))}
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
              <p id={`sender-${field.key}-hint`} className="mt-1 text-xs text-slate-500">{field.hint}</p>
            </div>
          ))}
        </div>
        <dl className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="font-medium text-slate-700">De :</dt>
            <dd className="break-all text-slate-800">{preview.from}</dd>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2">
            <dt className="font-medium text-slate-700">Réponse à :</dt>
            <dd className="break-all text-slate-800">{preview.replyTo ?? "l'expéditeur"}</dd>
          </div>
        </dl>
        {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
        {saved && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Expéditeur enregistré — les prochains e-mails l&apos;utilisent.
          </p>
        )}
        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer l'expéditeur"}
        </button>
      </Card>
    </form>
  );
}
