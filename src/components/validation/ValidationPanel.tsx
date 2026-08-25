"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Stamp,
  Undo2,
  CheckCircle2,
  Clock,
  Lock,
  FileDown,
  Send,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { PrimaryButton, SecondaryButton } from "@/components/PrimaryButton";
import type { ApprovalState } from "@/lib/sample-status";
import type { Role } from "@/lib/roles";

type ValidationPanelProps = {
  sampleId: string;
  role: Role;
  state: ApprovalState;
  validatedBy: string | null;
  validatedAt: string | null;
  nonConformes: number;
  reportNumber: string | null;
  sentTo: string | null;
  /** False when no mail provider is configured yet — sends are recorded, not delivered. */
  emailLive: boolean;
};

/**
 * The two-approval control.
 *
 * Both signatures are required on every sample, so the panel always shows both
 * steps and where the sample currently stands — a validateur can see that the
 * admin still has to approve, and the admin can see who validated technically.
 */
export function ValidationPanel({
  sampleId,
  role,
  state,
  validatedBy,
  validatedAt,
  nonConformes,
  reportNumber,
  sentTo,
  emailLive,
}: ValidationPanelProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  async function send(action: "validate" | "approve" | "reject") {
    if (busy) return;
    if (action === "reject" && !reason.trim()) {
      setError("Un motif est obligatoire pour renvoyer l'échantillon.");
      return;
    }

    setBusy(action);
    setError("");
    try {
      const response = await fetch(`/api/samples/${sampleId}/validation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason: reason.trim() }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "L'action n'a pas pu être enregistrée.");
        return;
      }
      router.refresh();
      if (action !== "validate") router.push("/validation");
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  async function resend() {
    if (busy) return;
    setBusy("resend");
    setError("");
    try {
      const response = await fetch(`/api/samples/${sampleId}/report/send`, {
        method: "POST",
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Envoi impossible.");
        return;
      }
      router.refresh();
    } catch {
      setError("Une erreur réseau est survenue. Réessayez.");
    } finally {
      setBusy(null);
    }
  }

  const canValidate = state === "AWAITING_TECHNICAL" && (role === "VALIDATEUR" || role === "ADMIN");
  const canApprove = state === "AWAITING_ADMIN" && role === "ADMIN";
  const canReject = state !== "APPROVED" && (role === "VALIDATEUR" || role === "ADMIN");

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        Validation en deux étapes
      </h2>

      <ol className="mt-4 space-y-2.5">
        <Step
          index={1}
          title="Validation technique"
          who="Validateur"
          done={state !== "AWAITING_TECHNICAL"}
          current={state === "AWAITING_TECHNICAL"}
          detail={
            validatedBy && validatedAt
              ? `${validatedBy} · ${validatedAt}`
              : "Contrôle des résultats face aux seuils"
          }
        />
        <Step
          index={2}
          title="Approbation finale"
          who="Administrateur"
          done={state === "APPROVED"}
          current={state === "AWAITING_ADMIN"}
          detail="Déclenche le rapport et l'envoi au client"
        />
      </ol>

      {nonConformes > 0 && state !== "APPROVED" && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          <b>{nonConformes} résultat{nonConformes > 1 ? "s" : ""} non conforme
          {nonConformes > 1 ? "s" : ""}.</b> Une alerte de contamination sera
          envoyée au client après approbation.
        </p>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          {error}
        </p>
      )}

      {rejecting && (
        <div className="mt-4">
          <label
            htmlFor="rejectReason"
            className="block text-sm font-medium text-slate-700"
          >
            Motif du renvoi au technicien <span className="text-rose-600">*</span>
          </label>
          <textarea
            id="rejectReason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setError("");
            }}
            rows={3}
            required
            placeholder="Ex. : valeur E. coli incohérente avec le témoin, refaire l'analyse."
            className="mt-1.5 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 shadow-sm transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          />
        </div>
      )}

      {state === "APPROVED" ? (
        <div className="mt-5">
          <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Échantillon <b>validé</b>
              {reportNumber && (
                <>
                  {" "}— rapport <b>{reportNumber}</b>
                </>
              )}
              .
            </span>
          </p>

          {sentTo && (
            <p className="mt-2 text-xs text-slate-500">
              Dernier envoi à : {sentTo}
            </p>
          )}

          {!emailLive && (
            <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <b>Mode démonstration :</b> les emails sont enregistrés dans le
              journal mais pas encore réellement envoyés — en attente de la
              configuration du domaine.
            </p>
          )}

          {reportNumber && (
            <div className="mt-4 space-y-3">
              <a
                href={`/api/samples/${sampleId}/report`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              >
                <FileDown className="h-4 w-4" aria-hidden="true" />
                Télécharger le rapport
              </a>
              <SecondaryButton
                type="button"
                onClick={() => resend()}
                disabled={!!busy}
                className="w-full"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {busy === "resend"
                  ? "Envoi…"
                  : sentTo
                    ? "Renvoyer au client"
                    : "Envoyer au client"}
              </SecondaryButton>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {canValidate && (
            <PrimaryButton
              type="button"
              onClick={() => send("validate")}
              disabled={!!busy || rejecting}
              className="w-full"
            >
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              {busy === "validate" ? "Validation…" : "Valider techniquement"}
            </PrimaryButton>
          )}

          {canApprove && (
            <PrimaryButton
              type="button"
              onClick={() => send("approve")}
              disabled={!!busy || rejecting}
              className="w-full"
            >
              <Stamp className="h-4 w-4" aria-hidden="true" />
              {busy === "approve" ? "Approbation…" : "Approuver définitivement"}
            </PrimaryButton>
          )}

          {state === "AWAITING_ADMIN" && role !== "ADMIN" && (
            <p className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              <Lock className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              Validé techniquement. L&apos;approbation finale revient à
              l&apos;administrateur.
            </p>
          )}

          {canReject &&
            (rejecting ? (
              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <PrimaryButton
                  type="button"
                  onClick={() => send("reject")}
                  disabled={!!busy}
                  className="sm:flex-1"
                >
                  <Undo2 className="h-4 w-4" aria-hidden="true" />
                  {busy === "reject" ? "Renvoi…" : "Confirmer le renvoi"}
                </PrimaryButton>
                <SecondaryButton
                  type="button"
                  onClick={() => {
                    setRejecting(false);
                    setReason("");
                    setError("");
                  }}
                  disabled={!!busy}
                >
                  Annuler
                </SecondaryButton>
              </div>
            ) : (
              <SecondaryButton
                type="button"
                onClick={() => setRejecting(true)}
                disabled={!!busy}
                className="w-full"
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Renvoyer au technicien
              </SecondaryButton>
            ))}
        </div>
      )}
    </Card>
  );
}

function Step({
  index,
  title,
  who,
  done,
  current,
  detail,
}: {
  index: number;
  title: string;
  who: string;
  done: boolean;
  current: boolean;
  detail: string;
}) {
  return (
    <li
      className={`flex items-start gap-3 rounded-xl border p-3 ${
        done
          ? "border-emerald-200 bg-emerald-50/60"
          : current
            ? "border-brand/30 bg-brand-light/40"
            : "border-slate-200 bg-white"
      }`}
    >
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done
            ? "bg-emerald-600 text-white"
            : current
              ? "bg-brand text-white"
              : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : index}
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-slate-800">
          {title}
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-500 ring-1 ring-slate-200">
            {who}
          </span>
          {current && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand">
              <Clock className="h-3 w-3" aria-hidden="true" />
              en attente
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-xs text-slate-500">{detail}</span>
      </span>
    </li>
  );
}
