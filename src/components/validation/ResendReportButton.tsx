"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Info, Send } from "lucide-react";
import { resendOutcome, type ResendOutcome } from "@/lib/report-actions";
import { ReportDialog } from "./ReportDialog";

/**
 * « Renvoyer au client » (finalversion.md:116): asks first, then shows what
 * actually happened — the recipients, a send only simulated while no mail
 * provider is configured, and any contamination alert that rode along or
 * failed. The route decides again (role, status, amendment); this button is
 * only offered where `canResendReport` allows it.
 */
export function ResendReportButton({
  sampleId,
  number,
  sent = true,
  compact = false,
}: {
  sampleId: string;
  /** The printed number of the version in force (« RAP-2026-00001-A1 »). */
  number: string;
  /** False while the report has never left: the action reads « Envoyer ». */
  sent?: boolean;
  /** One small link, for a table row or a list line. */
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<ResendOutcome | null>(null);
  // The dialog keeps the verb it opened with: the refresh after a first send
  // turns `sent` true while the outcome is still on screen.
  const [dialogVerb, setDialogVerb] = useState<"Renvoyer" | "Envoyer">("Renvoyer");
  const verb = sent ? "Renvoyer" : "Envoyer";

  function close() {
    // The send is under way: keep the dialog until its answer is shown.
    if (busy) return;
    setOpen(false);
    setError("");
    setOutcome(null);
  }

  async function send() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/samples/${sampleId}/report/send`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(typeof data.error === "string" ? data.error : "Le rapport n'a pas pu être envoyé.");
        return;
      }
      setOutcome(resendOutcome(data));
      // « Rapport envoyé », the last recipients and the send journal follow.
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setDialogVerb(verb);
          setOpen(true);
        }}
        className={
          compact
            ? "inline-flex items-center gap-1 rounded text-xs font-medium text-brand hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            : "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        }
      >
        <Send className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
        {verb} au client
        {compact && <span className="sr-only"> — rapport {number}</span>}
      </button>

      {open && (
        <ReportDialog title={`${dialogVerb} le rapport ${number} au client ?`} onClose={close}>
          {outcome ? (
            <div role="status">
              <p
                className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-sm ring-1 ${
                  outcome.simulated ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200"
                }`}
              >
                {outcome.simulated ? (
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{outcome.headline}</span>
              </p>
              {outcome.recipients.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Destinataires</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-800">
                    {outcome.recipients.map((address) => (
                      <li key={address} className="break-all">{address}</li>
                    ))}
                  </ul>
                </div>
              )}
              {outcome.alerts && <p className="mt-3 text-sm text-slate-700">{outcome.alerts}</p>}
              {outcome.alertsError && (
                <p className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Le rapport est parti, pas les alertes : {outcome.alertsError}</span>
                </p>
              )}
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
          ) : (
            <>
              <p className="text-sm text-slate-600">
                Le rapport {number} part en PDF aux adresses « Rapports » de la fiche client, et l&apos;envoi est inscrit au
                journal des envois. Les alertes de contamination restées en attente partent avec lui ; celles déjà
                envoyées ne sont pas répétées.
              </p>
              {error && (
                <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {error}
                </p>
              )}
              <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
                <button
                  type="button"
                  onClick={send}
                  disabled={busy}
                  className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-brand px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" aria-hidden="true" />
                  {busy ? "Envoi…" : `${dialogVerb} le rapport`}
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
            </>
          )}
        </ReportDialog>
      )}
    </>
  );
}
