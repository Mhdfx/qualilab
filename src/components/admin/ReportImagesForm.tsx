"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Check, Stamp, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { IMAGE_MAX_BYTES, IMAGE_TYPES } from "@/lib/image-upload";

type Images = { accreditationLogoData: string | null; stampData: string | null };

const SLOTS: { key: keyof Images; title: string; icon: typeof Stamp; hint: string; empty: string }[] = [
  {
    key: "accreditationLogoData",
    title: "Logo d'accréditation",
    icon: BadgeCheck,
    hint: "Imprimé dans le cartouche du rapport, à côté du logo du laboratoire, quand le rapport porte au moins une analyse accréditée (« Paramètres d'analyse » → « Accréditation des paramètres »).",
    empty: "Aucun fichier — aucun rapport ne porte le logo d'accréditation.",
  },
  {
    key: "stampData",
    title: "Cachet du laboratoire",
    icon: Stamp,
    hint: "Imprimé sous « Direction » sur chaque rapport émis après son dépôt.",
    empty: "Aucun fichier — aucun cachet n'est imprimé.",
  },
];

/**
 * The accreditation logo and the stamp (RETOUR-LABO-28-10.md K4, Q14): the
 * slots for the files the laboratory is to send. Each one saves on its own
 * (`PUT /api/admin/company/images`); the reports issued afterwards print it,
 * those already issued keep their print.
 */
export function ReportImagesForm({ initial }: { initial: Images }) {
  const router = useRouter();
  const [images, setImages] = useState<Images>(initial);
  const [busy, setBusy] = useState<keyof Images | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function save(key: keyof Images, value: string | null) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/admin/company/images", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      const data = (await response.json().catch(() => ({}))) as Partial<Images> & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Enregistrement impossible.");
        return;
      }
      setImages({ accreditationLogoData: data.accreditationLogoData ?? null, stampData: data.stampData ?? null });
      setNotice(value ? "Fichier enregistré — les prochains rapports émis l'impriment." : "Fichier retiré — les prochains rapports émis ne l'impriment plus.");
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  function pick(key: keyof Images, event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      setError("Le fichier doit être une image PNG, JPEG, SVG ou WebP.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setError("Le fichier dépasse 300 Ko — exportez-le plus léger.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") void save(key, reader.result);
    };
    reader.readAsDataURL(file);
  }

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
        <BadgeCheck className="h-4 w-4 text-brand" aria-hidden="true" />
        Accréditation et cachet (rapport d&apos;essai)
      </h2>
      <p className="mt-1 text-sm text-slate-500">PNG, JPEG, SVG ou WebP, 300 Ko maximum. Tant qu&apos;un fichier manque, rien n&apos;est imprimé à sa place.</p>
      <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
        {SLOTS.map((slot) => {
          const Icon = slot.icon;
          const value = images[slot.key];
          return (
            <section key={slot.key} aria-labelledby={`img-${slot.key}`} className="rounded-xl border border-slate-200 p-4">
              <h3 id={`img-${slot.key}`} className="flex items-center gap-2 font-medium text-slate-800">
                <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                {slot.title}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{slot.hint}</p>
              <div className="mt-3 flex min-h-[56px] items-center">
                {value ? (
                  // eslint-disable-next-line @next/next/no-img-element -- data URI preview, no optimizer involved
                  <img src={value} alt={`${slot.title} actuel`} className="h-14 max-w-[200px] object-contain" />
                ) : (
                  <span className="text-sm italic text-slate-400">{slot.empty}</span>
                )}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <label className={`inline-flex min-h-[42px] cursor-pointer items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 focus-within:ring-2 focus-within:ring-brand/30 ${busy ? "pointer-events-none opacity-50" : ""}`}>
                  {busy === slot.key ? "Enregistrement…" : value ? "Remplacer le fichier" : "Déposer le fichier"}
                  <input type="file" accept={IMAGE_TYPES.join(",")} onChange={(e) => pick(slot.key, e)} className="sr-only" disabled={busy !== null} />
                </label>
                {value && (
                  <button
                    type="button"
                    onClick={() => save(slot.key, null)}
                    disabled={busy !== null}
                    className="inline-flex min-h-[42px] items-center gap-1 rounded-xl px-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:opacity-50"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                    Retirer
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {notice && !error && (
        <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Check className="h-4 w-4" aria-hidden="true" />
          {notice}
        </p>
      )}
    </Card>
  );
}
