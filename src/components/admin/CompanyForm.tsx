"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Check, ImageIcon, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { CompanyInfo } from "@/lib/company";

/** ~300 KB before base64 — matches the server's 400 000-character ceiling. */
const LOGO_MAX_BYTES = 300 * 1024;
const LOGO_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

const LABELS: Record<Exclude<keyof CompanyInfo, "logoData">, string> = {
  name: "Raison sociale",
  tagline: "Activité (sous le logo)",
  address: "Adresse",
  city: "Ville",
  phone: "Téléphone",
  email: "Email",
  website: "Site web",
  ice: "ICE",
  rc: "RC",
  bank: "Banque",
  rib: "RIB",
  iban: "IBAN",
  swift: "SWIFT",
};

/**
 * The identity printed on every report, invoice and email.
 *
 * Saving here is what replaces the placeholder ICE/RC/RIB with the real ones
 * when the laboratory provides them (NEEDEDINFO item 3) — no code involved.
 */
export function CompanyForm({ initial }: { initial: CompanyInfo }) {
  const router = useRouter();
  const [values, setValues] = useState<CompanyInfo>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/admin/company", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setSaving(false);
    }
  }

  function pickLogo(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!LOGO_TYPES.includes(file.type)) {
      setError("Le logo doit être un fichier PNG, JPEG, SVG ou WebP.");
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setError("Le logo dépasse 300 Ko — exportez-le plus léger.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () =>
      setValues((current) => ({
        ...current,
        logoData: typeof reader.result === "string" ? reader.result : null,
      }));
    reader.readAsDataURL(file);
  }

  const fields = Object.keys(LABELS) as Exclude<keyof CompanyInfo, "logoData">[];

  return (
    <form onSubmit={save} noValidate>
      <Card className="p-5">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <Building2 className="h-4 w-4 text-brand" aria-hidden="true" />
          Identité imprimée sur les documents
        </h2>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div
              key={field}
              className={field === "tagline" || field === "address" ? "sm:col-span-2" : ""}
            >
              <label htmlFor={`c-${field}`} className="block text-sm font-medium text-slate-700">
                {LABELS[field]}
              </label>
              <input
                id={`c-${field}`}
                type="text"
                value={values[field]}
                onChange={(event) =>
                  setValues((current) => ({ ...current, [field]: event.target.value }))
                }
                className="mt-1.5 min-h-[42px] w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
            <ImageIcon className="h-4 w-4 text-brand" aria-hidden="true" />
            Logo imprimé sur les documents
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            PNG, JPEG, SVG ou WebP, 300 Ko maximum. Sans logo, les documents
            portent le nom stylisé — déposez ici le fichier haute définition
            du laboratoire dès qu&apos;il est fourni.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {values.logoData ? (
              <span className="inline-flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URI preview, no optimizer involved */}
                <img
                  src={values.logoData}
                  alt="Logo actuel"
                  className="h-12 max-w-[220px] object-contain"
                />
                <button
                  type="button"
                  onClick={() =>
                    setValues((current) => ({ ...current, logoData: null }))
                  }
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Retirer
                </button>
              </span>
            ) : (
              <span className="text-sm italic text-slate-400">
                Aucun logo — le nom stylisé est utilisé.
              </span>
            )}
            <label className="inline-flex min-h-[42px] cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand/30">
              {values.logoData ? "Remplacer le logo" : "Choisir un fichier"}
              <input
                type="file"
                accept={LOGO_TYPES.join(",")}
                onChange={pickLogo}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}
        {saved && (
          <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Identité enregistrée — les prochains documents l&apos;utiliseront.
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-50"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {saving ? "Enregistrement…" : "Enregistrer l'identité"}
        </button>
      </Card>
    </form>
  );
}
