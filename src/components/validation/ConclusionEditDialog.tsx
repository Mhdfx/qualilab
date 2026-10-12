"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCircle2, EyeOff } from "lucide-react";
import { CONCLUSION_MAX_LENGTH } from "@/lib/report-actions";
import { ReportDialog } from "./ReportDialog";

/**
 * « Modifier la conclusion » — the administrator's silent correction of an
 * issued report (client's decision, 28/07 and 18/08: ADMIN only, no journal).
 * Prefilled from `GET /api/reports/[id]/admin-edit`, saved by its PATCH.
 * Removing the feature is deleting this file, its button in ReportActions
 * and the route.
 */
export function ConclusionEditDialog({ reportId, onClose }: { reportId: string; onClose: () => void }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<{ number: string; conclusion: string } | null>(null);
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/reports/${reportId}/admin-edit`)
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!live) return;
        if (!response.ok) {
          setLoadError(typeof data.error === "string" ? data.error : "La conclusion n'a pas pu être chargée.");
          return;
        }
        if (data.amendmentPending) {
          setLoadError("Un amendement de ce rapport est en cours : sa conclusion sera recalculée à la validation administrative.");
          return;
        }
        const conclusion = typeof data.conclusion === "string" ? data.conclusion : "";
        setLoaded({ number: typeof data.number === "string" ? data.number : "", conclusion });
        setText(conclusion);
      })
      .catch(() => live && setLoadError("Une erreur réseau est survenue. Réessayez."));
    return () => {
      live = false;
    };
  }, [reportId]);

  function close() {
    if (busy) return;
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const conclusion = text.trim();
    if (!conclusion) {
      setError("La conclusion ne peut pas être vide.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/reports/${reportId}/admin-edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conclusion }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "La conclusion n'a pas pu être enregistrée.");
        return;
      }
      setSaved(true);
      // The duplicata and the downloads print the new text from now on.
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  const unchanged = loaded !== null && text.trim() === loaded.conclusion.trim();

  return (
    <ReportDialog title={loaded?.number ? `Modifier la conclusion — ${loaded.number}` : "Modifier la conclusion"} onClose={close}>
      {loadError && (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      )}
      {!loadError && !loaded && <p className="text-sm text-slate-500">Chargement…</p>}
      {saved && (
        <div role="status">
          <p className="flex items-start gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 ring-1 ring-emerald-200">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Conclusion enregistrée : elle s&apos;imprime désormais sur les téléchargements et les duplicatas.</span>
          </p>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={close}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Fermer
            </button>
          </div>
        </div>
      )}
      {loaded && !saved && (
        <form onSubmit={submit} noValidate>
          <p className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-700 ring-1 ring-slate-200">
            <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <span>
              La conclusion corrigée s&apos;imprime sur chaque téléchargement et chaque duplicata de ce rapport. Le rapport
              déjà envoyé n&apos;est pas renvoyé au client. Cette correction n&apos;est pas inscrite au journal (décision du
              laboratoire).
            </span>
          </p>
          <label htmlFor="adminConclusion" className="mt-3 block text-sm font-medium text-slate-700">
            Conclusion <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="adminConclusion"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setError("");
            }}
            rows={6}
            required
            maxLength={CONCLUSION_MAX_LENGTH}
            aria-describedby="adminConclusionCount"
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
          <p id="adminConclusionCount" className="mt-1 text-right text-xs tabular-nums text-slate-500">
            {text.length.toLocaleString("fr-FR")} / {CONCLUSION_MAX_LENGTH.toLocaleString("fr-FR")} caractères
          </p>
          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="submit"
              disabled={busy || unchanged}
              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {busy ? "Enregistrement…" : "Enregistrer la conclusion"}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-5 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              Annuler
            </button>
          </div>
        </form>
      )}
    </ReportDialog>
  );
}
