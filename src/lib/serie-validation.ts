import type { Interpretation, SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "./roles";
import { INTERPRETATION_LABELS, nothingJudged, sampleVerdict } from "./interpretation";
import {
  canApprove,
  canValidateTechnically,
  signsAdministratively,
  signsTechnically,
  statusLabel,
} from "./sample-status";
import { needsRegulation } from "./regulation";
import { raisesContaminationAlert, type AlertCandidate } from "./contamination-alert";
import { RESEND_REPORT_ROLES, reportVersionSent } from "./report-actions";
import { amendedNumber } from "./report-amendment";
import { labReference } from "./sample-select";
import { sampleRef } from "./reception-input";

/**
 * « Toute la série » at the validation desk (re-ask 2.16 — Q92 « avoir les
 * deux options », plan D3 + D4, switch `SERIES_VALIDATION`): the technical
 * validation, the administrative validation (« Valider » / « Valider et
 * envoyer ») and the send to the client of every eligible sample of a série
 * in one action, IN ADDITION to sample by sample.
 *
 * Pure — the plan the confirmation dialog shows, the request the routes
 * read, the words of each line's outcome. Who may sign what stays
 * `canValidateTechnically` / `canApprove` (sample-status.ts): a série is
 * never a way round the per-sample rules, it applies them to each sample
 * (`validation-server.ts`). A sample the plan sets aside is listed with its
 * reason and left untouched.
 */

/** The série's two signatures, as `POST /api/series/[id]/validation` reads them. */
export type SerieValidationAction = "validate" | "approve";

/** The série's three actions: the two signatures, and the send (D3). */
export type SerieBatchAction = SerieValidationAction | "send";

/**
 * A série action is offered from this many samples at the same step: below,
 * the sample's own panel does the same in one click.
 */
export const SERIE_BATCH_MIN = 2;

/** At most this many samples in one request — far above any série received. */
export const SERIE_BATCH_MAX = 500;

/** What names a sample of the série — its line on the screen. */
export type SerieLineSource = {
  id: string;
  code: string;
  controlCode: string | null;
  lineNumber: number;
  /** « Planche verte — surface nettoyée », as the queue words it. */
  designation: string;
};

/** A line of the dialog: the blind reference, the line in the série (« 2 », « 2M »), the designation. */
export type SerieLine = { id: string; reference: string; line: string; designation: string };

export function serieLine(sample: SerieLineSource): SerieLine {
  return {
    id: sample.id,
    reference: labReference(sample),
    line: sampleRef(sample.lineNumber, sample.code),
    designation: sample.designation,
  };
}

/** Whether this role may run the action at all (403 otherwise) — the per-sample guards' words. */
export function serieActionRefusal(action: SerieBatchAction, role: Role): string | null {
  if (action === "validate") return signsTechnically(role) ? null : "Votre profil n'est pas autorisé à valider.";
  if (action === "approve") {
    return signsAdministratively(role)
      ? null
      : "Seule la direction ou un administrateur peut donner la validation administrative.";
  }
  return (RESEND_REPORT_ROLES as readonly string[]).includes(role)
    ? null
    : "Votre profil n'est pas autorisé à envoyer les rapports.";
}

/** A sample at the step of a signature, as the queue and the plan read it. */
export type SerieStepSample = {
  status: SampleStatus;
  validatedById: string | null;
  amendmentPending: boolean;
};

/**
 * Why this sample is not signed with the rest of its série, or null when it
 * is: its step first (in plain words), then the per-sample rule itself —
 * `canValidateTechnically` / `canApprove`, word for word (the signature
 * already recorded, step 1 still missing, the same signer for both steps) —
 * then a pending amendment: its approval issues « -A1 », which replaces a
 * report the client may hold, so it is signed from its own page, which
 * shows the version replaced and the reason.
 */
export function serieStepRefusal(
  sample: SerieStepSample,
  action: SerieValidationAction,
  signer: { id: string; role: Role }
): string | null {
  if (sample.status === "ANNULE") return "Échantillon annulé.";
  if (sample.status === "VALIDE" || sample.status === "RAPPORT_ENVOYE") return "Déjà validé.";
  if (sample.status !== "RESULTATS_SAISIS") {
    return `Résultats pas encore soumis (« ${statusLabel(sample.status)} »).`;
  }
  const check =
    action === "validate" ? canValidateTechnically(sample, signer.role) : canApprove(sample, signer.role, signer.id);
  if (!check.ok) return check.error;
  if (sample.amendmentPending) {
    return "Amendement du rapport en cours : à valider depuis sa fiche, qui montre le rapport remplacé.";
  }
  return null;
}

/**
 * What the sample's own panel warns about before a signature, and the queue
 * shows as badges: its non-conform results, its anomalies, and the results
 * that raise a contamination alert (`raisesContaminationAlert`, the
 * dispatch's own rule).
 */
export type SerieResultCounts = { nonConformes: number; anomalies: number; alertables: number };

/** A result as the counts read it. */
export type SerieCountedResult = AlertCandidate & { workStatus: string };

export function serieResultCounts(results: readonly SerieCountedResult[]): SerieResultCounts {
  return {
    nonConformes: results.filter((result) => result.conform === false).length,
    anomalies: results.filter((result) => result.workStatus === "ANOMALIE").length,
    alertables: results.filter(raisesContaminationAlert).length,
  };
}

/** A result as the conclusion reads it. */
export type SerieJudgedResult = {
  interpretation: Interpretation | null;
  conform: boolean | null;
  informalInterpretation?: Interpretation | null;
};

/**
 * The conclusion the report will print, as the sample's own page shows it
 * before the signature: the official verdict (`sampleVerdict`); none when a
 * germ was taken on too few units (the page's « Sans interprétation
 * officielle », `NO_OFFICIAL_VERDICT` on the report); none when nothing has a
 * criterion; else the old reading of the limits — the e-mail's words.
 */
export function serieConclusion(results: readonly SerieJudgedResult[]): string {
  const verdict = sampleVerdict([...results]);
  if (verdict) return INTERPRETATION_LABELS[verdict];
  if (results.some((result) => result.interpretation === null && result.informalInterpretation)) {
    return "Sans interprétation officielle (trop peu d'unités)";
  }
  if (results.length === 0 || nothingJudged([...results])) return "Sans interprétation";
  return "Conforme";
}

/**
 * Whether this signature is the one that sends the contamination alerts
 * (LabSettings.alertAfterTechnicalValidation): the technical validation when
 * the laboratory wants them out at step 1, else the administrative one. At
 * step 2 with the alerts out at step 1, the approval only retries one that
 * failed (`approveSample`).
 */
export function alertsLeaveAt(action: SerieValidationAction, alertsAtTechnical: boolean): boolean {
  return action === "validate" ? alertsAtTechnical : !alertsAtTechnical;
}

/**
 * The sentence above the dialog's list when samples of it raise an alert —
 * the sample's panel's words, for this step: whether the alerts leave now.
 */
export function serieAlertNotice(action: SerieValidationAction, alertsAtTechnical: boolean, alerting: number): string {
  const samples = `${alerting} échantillon${alerting > 1 ? "s" : ""} ci-dessous`;
  if (alertsLeaveAt(action, alertsAtTechnical)) {
    return alertsAtTechnical
      ? `Une alerte de contamination est envoyée au client dès la validation technique : ${samples} en déclenche${alerting > 1 ? "nt" : ""} une à cette validation.`
      : `Une alerte de contamination est envoyée au client à la validation administrative : ${samples} en déclenche${alerting > 1 ? "nt" : ""} une à cette validation.`;
  }
  return action === "validate"
    ? `Une alerte de contamination sera envoyée au client après la validation administrative (${samples}) : rien ne part à cette étape.`
    : `Les alertes de contamination partent dès la validation technique (${samples}) : celle-ci ne renvoie que celles qui auraient échoué.`;
}

/** A sample of the série as its validation plan reads it. */
export type SerieValidationCandidate = SerieLineSource &
  SerieStepSample &
  SerieResultCounts & {
    /** The conclusion its report will print (`serieConclusion`). */
    conclusion: string;
    productTypeId: string | null;
    /** What its own panel would preselect (`proposeRegulation`, active regulations only). */
    proposedRegulation: { id: string; title: string } | null;
    /** The one already recorded on the sample — possibly archived. */
    recordedRegulation: string | null;
  };

export type SerieValidationPlan = {
  action: SerieValidationAction;
  /** LabSettings.alertAfterTechnicalValidation: the alerts leave at step 1, not step 2. */
  alertsAtTechnical: boolean;
  /**
   * Signed by the action, each with the regulation it records
   * (`regulationId`: posted; null keeps the recorded one), the conclusion
   * its report will print, what its panel would warn about, and whether
   * this signature sends its alert (`alertNow`).
   */
  eligible: (SerieLine &
    SerieResultCounts & {
      regulationId: string | null;
      regulation: string | null;
      conclusion: string;
      alertNow: boolean;
    })[];
  /** Left untouched, each with its reason. */
  skipped: (SerieLine & { reason: string })[];
};

/**
 * The plan of « Valider la série »: every sample of the série, eligible or
 * set aside with its reason. A sample judged against criteria needs its
 * « Réglementation en vigueur »: the active one its own panel would
 * preselect is recorded (and shown in the dialog); without one — none
 * anywhere, or only an archived one recorded, which its panel does not
 * offer either — the sample is validated from its page, where it is chosen.
 */
export function serieValidationPlan(
  samples: readonly SerieValidationCandidate[],
  action: SerieValidationAction,
  signer: { id: string; role: Role },
  settings: { alertsAtTechnical: boolean }
): SerieValidationPlan {
  const plan: SerieValidationPlan = { action, alertsAtTechnical: settings.alertsAtTechnical, eligible: [], skipped: [] };
  for (const sample of samples) {
    const line = serieLine(sample);
    const refusal = serieStepRefusal(sample, action, signer);
    if (refusal) {
      plan.skipped.push({ ...line, reason: refusal });
      continue;
    }
    if (needsRegulation(sample) && !sample.proposedRegulation) {
      plan.skipped.push({ ...line, reason: "Réglementation en vigueur à choisir : à valider depuis sa fiche." });
      continue;
    }
    plan.eligible.push({
      ...line,
      nonConformes: sample.nonConformes,
      anomalies: sample.anomalies,
      alertables: sample.alertables,
      conclusion: sample.conclusion,
      alertNow: sample.alertables > 0 && alertsLeaveAt(action, settings.alertsAtTechnical),
      regulationId: sample.proposedRegulation?.id ?? null,
      // Without a proposal (a sample judged without criteria), posting null
      // keeps the one recorded, if any: said so rather than « sans ».
      regulation: sample.proposedRegulation?.title ?? sample.recordedRegulation,
    });
  }
  return plan;
}

/** A sample of the série as « Envoyer la série au client » reads it. */
export type SerieSendCandidate = SerieLineSource & {
  status: SampleStatus;
  report: { number: string; version: number; sentAt: Date | null; amendedAt: Date | null; amendmentPending: boolean } | null;
};

/**
 * Why this sample's report is not sent with the rest (plan D3), or null
 * when it is: validated (both signatures), its report issued, no amendment
 * pending, this version never sent. A report already sent is resent from
 * its own page (« Renvoyer au client »), never in bulk.
 */
export function serieSendRefusal(sample: Pick<SerieSendCandidate, "status" | "report">): string | null {
  if (sample.status === "ANNULE") return "Échantillon annulé.";
  if (sample.status === "RAPPORT_ENVOYE") return "Rapport déjà envoyé : « Renvoyer au client » depuis sa fiche.";
  if (sample.status !== "VALIDE") return `Pas encore validé (« ${statusLabel(sample.status)} »).`;
  if (!sample.report) return "Rapport pas encore émis : à envoyer depuis sa fiche, qui l'émet.";
  if (sample.report.amendmentPending) return "Amendement du rapport en cours : à émettre et envoyer depuis sa fiche.";
  if (reportVersionSent(sample.report)) return "Cette version du rapport est déjà partie : « Renvoyer au client » depuis sa fiche.";
  return null;
}

export type SerieSendPlan = {
  action: "send";
  /** One e-mail per report, each with the number printed on the version in force. */
  eligible: (SerieLine & { number: string })[];
  skipped: (SerieLine & { reason: string })[];
};

export function serieSendPlan(samples: readonly SerieSendCandidate[]): SerieSendPlan {
  const plan: SerieSendPlan = { action: "send", eligible: [], skipped: [] };
  for (const sample of samples) {
    const line = serieLine(sample);
    const refusal = serieSendRefusal(sample);
    if (refusal || !sample.report) plan.skipped.push({ ...line, reason: refusal ?? "Rapport pas encore émis." });
    else plan.eligible.push({ ...line, number: amendedNumber(sample.report.number, sample.report.version) });
  }
  return plan;
}

/** A line of the queue, for the série buttons' counts. */
export type SerieQueueItem = {
  status?: SampleStatus;
  validatedById: string | null;
  serie: { id: string; serialNumber: string };
  report?: SerieSendCandidate["report"] | { amendmentPending: boolean } | null;
};

/** The série buttons of one group of /validation: how many samples each would take. */
export type SerieBatchCounts = { serieId: string; validate: number; approve: number; send: number };

const ALL_SERIE_ACTIONS: readonly SerieBatchAction[] = ["validate", "approve", "send"];

/**
 * The série actions a view of /validation offers — the step its lines are
 * at (a tile is a sort: the view narrows the actions as it narrows the
 * list). No view is the queue, the two signatures; the sample's own page,
 * which has no view, offers all three.
 */
export function serieViewActions(view: "a_valider" | "attente_admin" | "a_envoyer" | null): readonly SerieBatchAction[] {
  if (view === "a_valider") return ["validate"];
  if (view === "attente_admin") return ["approve"];
  if (view === "a_envoyer") return ["send"];
  return ["validate", "approve"];
}

/**
 * Per série (keyed by its number, as the queue groups), the samples each
 * action would take for this person — by the plans' own rules, over every
 * sample of the série (the caller reads them all, as the dialog's plan
 * does: never a page of them); the regulation, which the queue does not
 * read, is checked by the dialog's plan. A count under `SERIE_BATCH_MIN`,
 * an action the role never runs, or one not `offered`, is 0: no button.
 */
export function serieBatchCounts(
  items: readonly SerieQueueItem[],
  signer: { id: string; role: Role },
  offered: readonly SerieBatchAction[] = ALL_SERIE_ACTIONS
): Map<string, SerieBatchCounts> {
  const counts = new Map<string, SerieBatchCounts>();
  for (const item of items) {
    const key = item.serie.serialNumber;
    const entry = counts.get(key) ?? { serieId: item.serie.id, validate: 0, approve: 0, send: 0 };
    counts.set(key, entry);
    if (!item.status) continue;
    const step = { status: item.status, validatedById: item.validatedById, amendmentPending: item.report?.amendmentPending ?? false };
    if (!serieActionRefusal("validate", signer.role) && !serieStepRefusal(step, "validate", signer)) entry.validate += 1;
    if (!serieActionRefusal("approve", signer.role) && !serieStepRefusal(step, "approve", signer)) entry.approve += 1;
    const report = item.report && "number" in item.report ? item.report : null;
    if (!serieActionRefusal("send", signer.role) && !serieSendRefusal({ status: item.status, report })) entry.send += 1;
  }
  for (const entry of counts.values()) {
    for (const action of ALL_SERIE_ACTIONS) {
      if (entry[action] < SERIE_BATCH_MIN || !offered.includes(action)) entry[action] = 0;
    }
  }
  return counts;
}

/** What the dialog posts: the samples it showed as eligible, each with the regulation it showed. */
export type SerieValidationRequest = {
  action: SerieValidationAction;
  samples: { id: string; regulationId: string | null }[];
};

const ID_MAX = 64;

export function readSerieValidationAction(raw: unknown): SerieValidationAction | null {
  return raw === "validate" || raw === "approve" ? raw : null;
}

/** Reads the body of `POST /api/series/[id]/validation` (`send` is `approvalDispatch`'s). */
export function readSerieValidationRequest(
  body: unknown
): { ok: true; value: SerieValidationRequest } | { ok: false; error: string } {
  const input = (body && typeof body === "object" ? body : {}) as { action?: unknown; samples?: unknown };
  const action = readSerieValidationAction(input.action);
  if (!action) return { ok: false, error: "Action inconnue." };
  if (!Array.isArray(input.samples) || input.samples.length === 0) {
    return { ok: false, error: "Aucun échantillon à valider." };
  }
  if (input.samples.length > SERIE_BATCH_MAX) {
    return { ok: false, error: `Au plus ${SERIE_BATCH_MAX} échantillons par validation.` };
  }
  const samples: SerieValidationRequest["samples"] = [];
  const seen = new Set<string>();
  for (const raw of input.samples) {
    const entry = (raw && typeof raw === "object" ? raw : {}) as { id?: unknown; regulationId?: unknown };
    if (typeof entry.id !== "string" || !entry.id || entry.id.length > ID_MAX) {
      return { ok: false, error: "Requête invalide : échantillon inconnu." };
    }
    if (seen.has(entry.id)) return { ok: false, error: "Requête invalide : un échantillon figure deux fois." };
    if (entry.regulationId !== undefined && entry.regulationId !== null && typeof entry.regulationId !== "string") {
      return { ok: false, error: "Requête invalide : réglementation." };
    }
    seen.add(entry.id);
    samples.push({ id: entry.id, regulationId: typeof entry.regulationId === "string" && entry.regulationId ? entry.regulationId : null });
  }
  return { ok: true, value: { action, samples } };
}

/** Reads the body of `POST /api/series/[id]/reports/send`: the samples whose report the dialog showed. */
export function readSerieSendRequest(body: unknown): { ok: true; sampleIds: string[] } | { ok: false; error: string } {
  const raw = body && typeof body === "object" ? (body as { sampleIds?: unknown }).sampleIds : undefined;
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Aucun rapport à envoyer." };
  if (raw.length > SERIE_BATCH_MAX) return { ok: false, error: `Au plus ${SERIE_BATCH_MAX} rapports par envoi.` };
  const ids: string[] = [];
  for (const id of raw) {
    if (typeof id !== "string" || !id || id.length > ID_MAX) return { ok: false, error: "Requête invalide : échantillon inconnu." };
    if (ids.includes(id)) return { ok: false, error: "Requête invalide : un échantillon figure deux fois." };
    ids.push(id);
  }
  return { ok: true, sampleIds: ids };
}

/** The label of a série button: the per-sample buttons' verbs, with how many samples it takes. */
export function serieBatchLabel(action: SerieBatchAction, count: number): string {
  if (action === "validate") return `Valider techniquement la série (${count})`;
  if (action === "approve") return `Valider la série (${count})`;
  return `Envoyer la série au client (${count})`;
}

/** Where the dialog reads its plan (GET). */
export function serieBatchPlanUrl(serieId: string, action: SerieBatchAction): string {
  const serie = encodeURIComponent(serieId);
  return action === "send" ? `/api/series/${serie}/reports` : `/api/series/${serie}/validation?action=${action}`;
}

/**
 * What the dialog posts once confirmed: exactly the samples it listed as
 * eligible — each with the regulation it showed — and, on the
 * administrative validation, whether « Valider et envoyer » was used.
 */
export function serieBatchRequest(
  serieId: string,
  action: SerieBatchAction,
  eligible: readonly { id: string; regulationId?: string | null }[],
  send: boolean
): { url: string; body: unknown } {
  const serie = encodeURIComponent(serieId);
  if (action === "send") {
    return { url: `/api/series/${serie}/reports/send`, body: { sampleIds: eligible.map((line) => line.id) } };
  }
  return {
    url: `/api/series/${serie}/validation`,
    body: {
      action,
      ...(action === "approve" ? { send } : {}),
      samples: eligible.map((line) => ({ id: line.id, regulationId: line.regulationId ?? null })),
    },
  };
}

/**
 * The dialog posts the eligible samples in several short requests rather
 * than one: each « Valider et envoyer » or send renders a PDF (1 to 3 s, up
 * to 20 s under load), and the proxy cuts a request off at 60 s
 * (deploy/nginx.conf.example) — a whole série in one request could outlast
 * it while the server carries on. Fewer per request when each sends a PDF:
 * two, so that even two PDFs at their slowest (2 × 20 s) stay under 60 s —
 * the load is exactly when the lab sends a big série.
 */
export const SERIE_BATCH_CHUNK = 10;
export const SERIE_SEND_CHUNK = 2;

/** One PDF's render at its slowest, under load (seconds) — what `SERIE_SEND_CHUNK` is sized on. */
export const PDF_RENDER_WORST_S = 20;

/** The proxy's `proxy_read_timeout` (deploy/nginx.conf.example), seconds. */
export const PROXY_READ_TIMEOUT_S = 60;

export function serieBatchChunkSize(action: SerieBatchAction, withSend: boolean): number {
  return action === "send" || (action === "approve" && withSend) ? SERIE_SEND_CHUNK : SERIE_BATCH_CHUNK;
}

/** The eligible lines in the order shown, `size` per request. */
export function serieBatchChunks<T>(eligible: readonly T[], size: number): T[][] {
  const step = Math.max(1, Math.floor(size));
  const chunks: T[][] = [];
  for (let start = 0; start < eligible.length; start += step) chunks.push(eligible.slice(start, start + step));
  return chunks;
}

/**
 * How the dialog reads the answer to one request: each sample's outcome; a
 * refusal the route gave before writing anything (a 4xx with its message:
 * session, role, request, série); anything else — a 502/504 page from the
 * proxy, a 500, no answer at all — is uncertain: the server may well have
 * signed or sent part of it, so nothing is claimed either way.
 */
export type SerieBatchReply =
  | { kind: "lines"; lines: SerieBatchLine[] }
  | { kind: "refused"; error: string }
  | { kind: "uncertain" };

export function readSerieBatchReply(status: number, data: unknown): SerieBatchReply {
  const body = (data && typeof data === "object" ? data : {}) as { lines?: unknown; error?: unknown };
  if (status >= 200 && status < 300 && Array.isArray(body.lines)) return { kind: "lines", lines: body.lines as SerieBatchLine[] };
  if (status >= 400 && status < 500 && typeof body.error === "string" && body.error.trim()) {
    return { kind: "refused", error: body.error.trim() };
  }
  return { kind: "uncertain" };
}

/** What the dialog says when an answer did not arrive. */
export const SERIE_BATCH_UNCERTAIN =
  "La réponse n'est pas arrivée : une partie de la série a peut-être été traitée. Fermez cette fenêtre pour voir ce qui a été enregistré.";

/** What the dialog says when a later request was refused: the rest was not touched. */
export function serieBatchStopped(error: string, untouched: number): string {
  return `Arrêté avant la fin : ${error} ${untouched > 1 ? `Les ${untouched} échantillons suivants n'ont pas été traités.` : "L'échantillon suivant n'a pas été traité."}`;
}

/** One sample's outcome in the dialog, after the action. */
export type SerieBatchLine = SerieLine & {
  /** Signed / sent; set aside (not eligible any more, or refused by its rule); an unexpected error. */
  outcome: "done" | "skipped" | "failed";
  detail: string;
  /** Done, but something that followed did not (a send, an alert). */
  warning?: string;
  /** Its report « sent » only in simulation (no mail provider yet): recorded, not delivered. */
  simulated?: boolean;
};

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/**
 * What a sample's line says once signed or sent — from the per-sample
 * answer (`validateTechnically`, `approveSample`, `sendReportWithAlerts`).
 * A send only simulated (no mail provider yet) is said so, never « envoyé »,
 * and its alerts are « enregistrées », not « parties » (`resendOutcome`'s
 * words): the report's own send says which; an alert at the technical
 * validation, which has none, goes by `emailLive`.
 */
export function signatureDetail(
  action: SerieBatchAction,
  send: boolean,
  body: {
    report?: { number: string } | null;
    dispatch?: { report?: string; alerts?: number; error?: string };
  },
  emailLive = true
): { detail: string; warning?: string; simulated?: true } {
  const dispatch = body.dispatch ?? {};
  const simulated = dispatch.report === "SIMULE";
  const alertsSimulated = dispatch.report ? simulated : !emailLive;
  const alerts =
    dispatch.alerts && dispatch.alerts > 0
      ? ` ${
          alertsSimulated
            ? plural(dispatch.alerts, "alerte de contamination enregistrée", "alertes de contamination enregistrées")
            : plural(dispatch.alerts, "alerte de contamination partie", "alertes de contamination parties")
        }.`
      : "";
  const warning = dispatch.error?.trim() ? dispatch.error.trim() : undefined;
  const sentWords = simulated ? "envoi simulé (aucun service d'envoi n'est encore configuré)" : "envoyé au client";

  let detail: string;
  if (action === "validate") {
    detail = "Validation technique enregistrée.";
  } else if (action === "send") {
    detail = `Rapport ${body.report?.number ?? "—"} : ${sentWords}.`;
  } else if (!body.report) {
    detail = "Validé.";
  } else if (send && dispatch.report) {
    detail = `Validé — rapport ${body.report.number} émis, ${sentWords}.`;
  } else if (send) {
    detail = `Validé — rapport ${body.report.number} émis, pas envoyé.`;
  } else {
    detail = `Validé — rapport ${body.report.number} émis, à envoyer.`;
  }
  return { detail: detail + alerts, ...(warning ? { warning } : {}), ...(simulated ? { simulated: true as const } : {}) };
}

/**
 * The dialog's headline once the action ran: « 3 validés · 1 écarté · 1 en
 * échec ». A send only simulated is counted as such — « 2 rapports envoyés
 * · 1 envoi simulé », « 3 envois simulés » — never as a report sent.
 */
export function serieBatchSummary(
  action: SerieBatchAction,
  lines: readonly Pick<SerieBatchLine, "outcome" | "simulated">[]
): string {
  const doneLines = lines.filter((line) => line.outcome === "done");
  const skipped = lines.filter((line) => line.outcome === "skipped").length;
  const failed = lines.filter((line) => line.outcome === "failed").length;
  let doneWords: string[];
  if (doneLines.length === 0) {
    doneWords = [
      action === "send"
        ? "Aucun rapport envoyé"
        : action === "validate"
          ? "Aucun échantillon validé techniquement"
          : "Aucun échantillon validé",
    ];
  } else if (action === "send") {
    const simulated = doneLines.filter((line) => line.simulated).length;
    const sent = doneLines.length - simulated;
    doneWords = [
      sent > 0 ? plural(sent, "rapport envoyé", "rapports envoyés") : "",
      simulated > 0 ? plural(simulated, "envoi simulé", "envois simulés") : "",
    ];
  } else {
    doneWords = [
      action === "validate"
        ? plural(doneLines.length, "validé techniquement", "validés techniquement")
        : plural(doneLines.length, "validé", "validés"),
    ];
  }
  return [...doneWords, skipped > 0 ? plural(skipped, "écarté", "écartés") : null, failed > 0 ? `${failed} en échec` : null]
    .filter(Boolean)
    .join(" · ");
}
