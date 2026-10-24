"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, MinusCircle, Send, ShieldCheck, Stamp, XCircle } from "lucide-react";
import {
  SERIE_BATCH_UNCERTAIN,
  readSerieBatchReply,
  serieAlertNotice,
  serieBatchChunkSize,
  serieBatchChunks,
  serieBatchLabel,
  serieBatchPlanUrl,
  serieBatchRequest,
  serieBatchStopped,
  serieBatchSummary,
  type SerieBatchAction,
  type SerieBatchCounts,
  type SerieBatchLine,
  type SerieBatchReply,
} from "@/lib/serie-validation";
import { ReportDialog } from "./ReportDialog";

/** A line of the plan, as `GET /api/series/[id]/validation` or `/reports` answers it. */
type PlanLine = {
  id: string;
  reference: string;
  line: string;
  designation: string;
  /** The regulation the validation records (null: none needed, or the one recorded). */
  regulation?: string | null;
  regulationId?: string | null;
  /** The conclusion its report will print, as its own page shows it (the signatures only). */
  conclusion?: string;
  /** What the sample's panel warns about (the signatures only). */
  nonConformes?: number;
  anomalies?: number;
  alertables?: number;
  /** This signature sends its contamination alert to the client. */
  alertNow?: boolean;
  /** The report sent (« Envoyer la série »): the number of its version in force. */
  number?: string;
};

type Plan = {
  serie: { serialNumber: string; clientName: string };
  eligible: PlanLine[];
  skipped: (PlanLine & { reason: string })[];
  /** The signatures: LabSettings.alertAfterTechnicalValidation. */
  alertsAtTechnical?: boolean;
  /** False when no mail provider is configured yet — sends are recorded, not delivered. */
  emailLive?: boolean;
};

/**
 * The outcome once the action ran: each sample's line, and — when it did
 * not run to the end — why: an answer that never arrived (`uncertain`:
 * part of it may have been done, nothing is claimed), or a later request
 * refused (`stopped`: the rest was not touched).
 */
type Outcome = { lines: SerieBatchLine[]; uncertain: boolean; stopped: string | null };

const ICONS = { validate: ShieldCheck, approve: Stamp, send: Send } as const;

/** What each outcome icon says to a screen reader. */
const OUTCOME_WORDS: Record<SerieBatchLine["outcome"], string> = { done: "Fait", skipped: "Écarté", failed: "En échec" };

const INTRO: Record<SerieBatchAction, string> = {
  validate:
    "Chaque échantillon ci-dessous reçoit la validation technique, exactement comme depuis sa fiche : mêmes règles, même journal, avec la réglementation indiquée. Les échantillons écartés restent tels quels.",
  approve:
    "« Valider » émet le rapport de chaque échantillon ci-dessous sans l'envoyer : il attend dans « Validés — à envoyer ». « Valider et envoyer » l'envoie aussitôt au client, un e-mail par rapport. Les échantillons écartés restent tels quels.",
  send:
    "Chaque rapport ci-dessous part en PDF aux adresses « Rapports » de la fiche client — un e-mail par rapport — et l'envoi est inscrit au journal des envois ; les alertes de contamination restées en attente partent avec lui. Les échantillons écartés restent tels quels.",
};

const TITLE: Record<SerieBatchAction, string> = {
  validate: "Valider techniquement la série",
  approve: "Validation administrative de la série",
  send: "Envoyer au client les rapports de la série",
};

/**
 * « Toute la série » (re-ask 2.16 — Q92 « avoir les deux options », plan
 * D3 + D4, switch `SERIES_VALIDATION`): the série's buttons — « Valider
 * techniquement la série », « Valider la série » (« Valider » / « Valider et
 * envoyer »), « Envoyer la série au client » — each with how many samples
 * it takes (`serieBatchCounts`; none under `SERIE_BATCH_MIN`). Each opens a
 * dialog that reads the plan first (the samples signed or sent, each with
 * its regulation or report number, and the ones set aside with their
 * reason), then shows each sample's outcome. The routes decide again, per
 * sample, with the per-sample rules.
 */
export function SerieBatchActions({
  serieId,
  serialNumber,
  counts,
  layout = "inline",
}: {
  serieId: string;
  serialNumber: string;
  counts: Pick<SerieBatchCounts, SerieBatchAction>;
  /** `inline`: small buttons in a queue group's header; `stack`: full-width, in a card. */
  layout?: "inline" | "stack";
}) {
  const [action, setAction] = useState<SerieBatchAction | null>(null);
  const actions = (["validate", "approve", "send"] as const).filter((entry) => counts[entry] > 0);
  // The dialog stays mounted while it shows an outcome: the page refreshes on its close.
  if (actions.length === 0 && action === null) return null;

  return (
    <>
      <div className={layout === "stack" ? "space-y-2" : "flex flex-wrap gap-2"}>
        {actions.map((entry) => {
          const Icon = ICONS[entry];
          return (
            <button
              key={entry}
              type="button"
              onClick={() => setAction(entry)}
              className={
                layout === "stack"
                  ? "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
                  : "inline-flex min-h-[40px] items-center gap-1.5 rounded-full border border-brand/30 bg-white px-3 text-xs font-semibold text-brand shadow-sm transition hover:bg-brand-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
              }
            >
              <Icon className={layout === "stack" ? "h-4 w-4" : "h-3.5 w-3.5"} aria-hidden="true" />
              {serieBatchLabel(entry, counts[entry])}
              {layout === "inline" && <span className="sr-only"> — série {serialNumber}</span>}
            </button>
          );
        })}
      </div>
      {action && (
        <SerieBatchDialog serieId={serieId} serialNumber={serialNumber} action={action} onClose={() => setAction(null)} />
      )}
    </>
  );
}

function SerieBatchDialog({
  serieId,
  serialNumber,
  action,
  onClose,
}: {
  serieId: string;
  serialNumber: string;
  action: SerieBatchAction;
  onClose: () => void;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState<"run" | "run-send" | null>(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // How many samples have their outcome so far, while the requests follow one another.
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let live = true;
    fetch(serieBatchPlanUrl(serieId, action))
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!live) return;
        if (response.ok && Array.isArray(data.eligible) && Array.isArray(data.skipped)) setPlan(data as Plan);
        else setLoadError(typeof data.error === "string" ? data.error : "La série n'a pas pu être lue.");
      })
      .catch(() => {
        if (live) setLoadError("Une erreur réseau est survenue. Réessayez.");
      });
    return () => {
      live = false;
    };
  }, [serieId, action]);

  const close = useCallback(() => {
    // Under way: the dialog stays until each sample's outcome is shown.
    if (busy) return;
    // The queue, the counts and the sample's panel follow once it is closed
    // (refreshing earlier could unmount the group — and this outcome).
    if (outcome) router.refresh();
    onClose();
  }, [busy, outcome, onClose, router]);

  /**
   * Posts the eligible samples a few at a time (`serieBatchChunks`: each
   * request stays well under the proxy's 60 s), one request after the other.
   * A refusal of the first request changed nothing: it is shown and the
   * plan stays. Anything else that stops the run shows what was confirmed so
   * far, and the run buttons go away — the page is refreshed on close.
   */
  async function run(withSend: boolean) {
    if (busy || !plan || plan.eligible.length === 0) return;
    setBusy(withSend ? "run-send" : "run");
    setError("");
    setProgress(0);
    const chunks = serieBatchChunks(plan.eligible, serieBatchChunkSize(action, withSend));
    const lines: SerieBatchLine[] = [];
    let uncertain = false;
    let stopped: string | null = null;
    try {
      for (const [index, chunk] of chunks.entries()) {
        let reply: SerieBatchReply;
        try {
          const { url, body } = serieBatchRequest(serieId, action, chunk, withSend);
          const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          reply = readSerieBatchReply(response.status, await response.json().catch(() => null));
        } catch {
          // No answer at all (network, connection cut): the server may have carried on.
          reply = { kind: "uncertain" };
        }
        if (reply.kind === "lines") {
          lines.push(...reply.lines);
          setProgress(lines.length);
          continue;
        }
        if (reply.kind === "refused" && index === 0) {
          setError(reply.error);
          return;
        }
        if (reply.kind === "refused") {
          stopped = serieBatchStopped(reply.error, chunks.slice(index).reduce((total, rest) => total + rest.length, 0));
        } else {
          uncertain = true;
        }
        break;
      }
      setOutcome({ lines, uncertain, stopped });
    } finally {
      setBusy(null);
    }
  }

  const count = plan?.eligible.length ?? 0;
  // The sentence above the list: how many samples alert, and whether at this step.
  const alerting = plan?.eligible.filter((line) => (line.alertables ?? 0) > 0).length ?? 0;
  const alertNotice =
    action !== "send" && alerting > 0 ? serieAlertNotice(action, plan?.alertsAtTechnical ?? true, alerting) : null;
  // The panel's « Mode démonstration »: shown whenever this action e-mails the client.
  const sendsMail = action !== "validate" || (plan?.eligible.some((line) => line.alertNow) ?? false);
  const demoNotice = plan !== null && plan.emailLive === false && sendsMail && count > 0;

  return (
    <ReportDialog title={`${TITLE[action]} ${serialNumber}`} onClose={close}>
      {outcome ? (
        <div>
          {outcome.uncertain && (
            <p role="alert" className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900 ring-1 ring-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {SERIE_BATCH_UNCERTAIN}
            </p>
          )}
          {/* Uncertain with nothing confirmed: no headline — « Aucun… » would be a guess. */}
          {(outcome.lines.length > 0 || !outcome.uncertain) && (
            <p role="status" className="rounded-xl bg-slate-50 px-3 py-2.5 text-sm font-semibold text-slate-800 ring-1 ring-slate-200">
              {outcome.uncertain ? "Confirmé avant l'interruption : " : ""}
              {serieBatchSummary(action, outcome.lines)}
            </p>
          )}
          {outcome.stopped && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {outcome.stopped}
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {outcome.lines.map((line) => (
              <li key={line.id} className="flex items-start gap-2 text-sm">
                {line.outcome === "done" ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                ) : line.outcome === "skipped" ? (
                  <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="sr-only">{OUTCOME_WORDS[line.outcome]} : </span>
                  <SampleName line={line} />
                  <span className={`block text-xs ${line.outcome === "failed" ? "text-rose-700" : "text-slate-600"}`}>{line.detail}</span>
                  {line.warning && (
                    <span className="mt-0.5 flex items-start gap-1 text-xs text-amber-800">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      {line.warning}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
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
      ) : loadError ? (
        <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {loadError}
        </p>
      ) : !plan ? (
        <p role="status" className="text-sm text-slate-500">
          Lecture de la série…
        </p>
      ) : (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{plan.serie.clientName}</p>
          <p className="mt-1 text-sm text-slate-600">{INTRO[action]}</p>

          {alertNotice && (
            <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{alertNotice}</p>
          )}
          {demoNotice && (
            <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
              <b>Mode démonstration :</b> les emails sont enregistrés dans le journal mais pas encore réellement envoyés — en
              attente de la configuration du domaine.
            </p>
          )}

          {count > 0 ? (
            <section aria-labelledby="serie-batch-eligible" className="mt-4">
              <h3 id="serie-batch-eligible" className="text-sm font-semibold text-slate-800">
                {action === "send"
                  ? `${count} rapport${count > 1 ? "s" : ""} à envoyer`
                  : `${count} échantillon${count > 1 ? "s" : ""} à valider`}
              </h3>
              <ul className="mt-2 space-y-1.5">
                {plan.eligible.map((line) => {
                  const flags = resultFlags(line);
                  return (
                    <li key={line.id} className="rounded-lg bg-slate-50 px-3 py-2 text-sm ring-1 ring-slate-200">
                      <SampleName line={line} />
                      <span className="block text-xs text-slate-600">
                        {action === "send"
                          ? `Rapport ${line.number ?? "—"}`
                          : line.regulation
                            ? `Réglementation : ${line.regulation}`
                            : "Sans réglementation (jugé sans critère)"}
                      </span>
                      {line.conclusion && (
                        <span className="block text-xs text-slate-600">
                          Conclusion : <b className="font-semibold text-slate-800">{line.conclusion}</b>
                        </span>
                      )}
                      {flags && <span className="block text-xs font-medium text-rose-700">{flags}</span>}
                      {line.alertNow && (
                        <span className="mt-0.5 flex items-start gap-1 text-xs font-medium text-rose-800">
                          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                          Alerte de contamination envoyée au client à cette validation
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : (
            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2.5 text-sm text-slate-600">
              {action === "send"
                ? "Aucun rapport de cette série n'est à envoyer maintenant."
                : "Aucun échantillon de cette série n'est à valider maintenant."}
            </p>
          )}

          {plan.skipped.length > 0 && (
            <section aria-labelledby="serie-batch-skipped" className="mt-4">
              <h3 id="serie-batch-skipped" className="text-sm font-semibold text-slate-800">
                Écarté{plan.skipped.length > 1 ? "s" : ""} — laissé{plan.skipped.length > 1 ? "s" : ""} tel
                {plan.skipped.length > 1 ? "s" : ""} quel{plan.skipped.length > 1 ? "s" : ""} ({plan.skipped.length})
              </h3>
              <ul className="mt-2 space-y-1.5">
                {plan.skipped.map((line) => (
                  <li key={line.id} className="text-sm">
                    <SampleName line={line} />
                    <span className="block text-xs text-slate-500">{line.reason}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {error}
            </p>
          )}
          {busy && (
            <p role="status" className="mt-3 text-xs text-slate-500">
              {`${progress} sur ${count} traité${progress > 1 ? "s" : ""} — chaque échantillon est traité l'un après l'autre : gardez cette fenêtre ouverte jusqu'au résultat.`}
            </p>
          )}

          <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse sm:flex-wrap">
            {count > 0 && (
              <button
                type="button"
                onClick={() => run(false)}
                disabled={!!busy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:opacity-60"
              >
                {action === "send" ? (
                  <Send className="h-4 w-4" aria-hidden="true" />
                ) : action === "approve" ? (
                  <Stamp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {busy === "run"
                  ? action === "send"
                    ? "Envoi…"
                    : "Validation…"
                  : action === "send"
                    ? `Envoyer ${count > 1 ? `les ${count} rapports` : "le rapport"}`
                    : action === "approve"
                      ? `Valider (${count})`
                      : `Valider techniquement (${count})`}
              </button>
            )}
            {/* « Valider et envoyer », as on the sample's own panel (16/10, Q92). */}
            {count > 0 && action === "approve" && (
              <button
                type="button"
                onClick={() => run(true)}
                disabled={!!busy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
              >
                <Send className="h-4 w-4" aria-hidden="true" />
                {busy === "run-send" ? "Validation et envoi…" : `Valider et envoyer (${count})`}
              </button>
            )}
            <button
              type="button"
              onClick={close}
              disabled={!!busy}
              className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60"
            >
              {/* Never « Annuler » here: in this application it cancels a sample. */}
              Fermer
            </button>
          </div>
        </div>
      )}
    </ReportDialog>
  );
}

/** « 2 non conformes · 1 anomalie », as the queue's badges; empty when neither. */
function resultFlags(line: Pick<PlanLine, "nonConformes" | "anomalies">): string {
  const nonConformes = line.nonConformes ?? 0;
  const anomalies = line.anomalies ?? 0;
  return [
    nonConformes > 0 ? `${nonConformes} non conforme${nonConformes > 1 ? "s" : ""}` : "",
    anomalies > 0 ? `${anomalies} anomalie${anomalies > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** « C-0001 · échantillon 2M — Planche verte ». */
function SampleName({ line }: { line: Pick<PlanLine, "reference" | "line" | "designation"> }) {
  return (
    <span className="block font-medium text-slate-800">
      <span className="font-mono">{line.reference}</span>
      <span className="font-normal text-slate-500">
        {" "}· échantillon {line.line}
        {line.designation && line.designation !== "—" ? ` — ${line.designation}` : ""}
      </span>
    </span>
  );
}
