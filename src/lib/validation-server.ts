import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { lineDesignation } from "@/components/preleveur/visit-types";
import { logAudit } from "./audit";
import { prisma } from "./prisma";
import { canApprove, canValidateTechnically, signsAdministratively } from "./sample-status";
import { issueReportFor, sendReport, sendContaminationAlerts, type IssuedReport } from "./report-dispatch";
import { getLabSettings, type LabSettings } from "./lab-settings";
import { needsRegulation, proposeRegulation } from "./regulation";
import type { Role } from "./roles";
import { amendedNumber } from "./report-amendment";
import {
  serieConclusion,
  serieLine,
  serieResultCounts,
  serieSendPlan,
  serieSendRefusal,
  serieValidationPlan,
  signatureDetail,
  type SerieBatchLine,
  type SerieSendCandidate,
  type SerieValidationAction,
  type SerieValidationCandidate,
  type SerieValidationRequest,
} from "./serie-validation";

/**
 * The two signatures of one sample — the technical validation and the
 * administrative validation (« Valider » / « Valider et envoyer ») — as
 * `POST /api/samples/[id]/validation` applies them, extracted so that the
 * validation of a whole série (re-ask 2.16, plan D4, `SERIES_VALIDATION`)
 * runs exactly the same rules, writes and journal on each of its samples:
 * nothing here is written twice.
 *
 * Each signature is its own atomic claim (`updateMany` re-checks the guard
 * in the UPDATE and counts the rows it changed — guarded-writes.test.ts),
 * so a série is a sequence of independent per-sample signatures: one that
 * fails never undoes the others.
 */

/** The sample as the two signatures and the send-back read it. */
export const VALIDATION_SAMPLE_SELECT = {
  id: true,
  code: true,
  status: true,
  validatedById: true,
  approvedById: true,
  productTypeId: true,
  productId: true,
  regulationId: true,
  regulation: { select: { title: true } },
  report: { select: { amendmentPending: true } },
  // Who a send-back returns it to: the holder, and the technicians a
  // legacy programme handed parameters to (only those rows are read).
  technicianId: true,
  technician: { select: { name: true } },
  parameters: {
    where: { technicianId: { not: null } },
    select: { technician: { select: { name: true } } },
  },
} satisfies Prisma.SampleSelect;

export type ValidationSample = Prisma.SampleGetPayload<{ select: typeof VALIDATION_SAMPLE_SELECT }>;

/** Who signs: the signed-in account (`requireApiRole`). */
export type Signer = { id: string; role: Role };

export type ChosenRegulation = { id: string; title: string };

/** What a signature answers: the route's 200 body, or its refusal. */
export type SignatureOutcome<T> = { ok: true; body: T } | { ok: false; status: 400 | 403 | 409; error: string };

/** Where a signature comes from: the sample's own panel, or the série's action (journalled `viaSerie`). */
export type SignatureContext = {
  /** The série's number when signed through « toute la série » (2.16). */
  viaSerie?: string;
  /** Read once for a whole série instead of once per sample. */
  settings?: LabSettings;
};

/**
 * The regulation of this sample: the one sent, else the one already chosen.
 * A sample judged against criteria cannot be validated without one
 * (RETOUR-LABO-30-09.md, slice I).
 */
export async function regulationFor(
  sample: Pick<ValidationSample, "productTypeId" | "regulationId" | "regulation">,
  rawRegulation: unknown
): Promise<{ ok: true; regulation: ChosenRegulation | null } | { ok: false; status: 400; error: string }> {
  let regulation: ChosenRegulation | null =
    sample.regulationId && sample.regulation ? { id: sample.regulationId, title: sample.regulation.title } : null;
  if (typeof rawRegulation === "string" && rawRegulation) {
    const found = await prisma.regulation.findFirst({ where: { id: rawRegulation, active: true }, select: { id: true, title: true } });
    if (!found) return { ok: false, status: 400, error: "Réglementation inconnue ou archivée." };
    regulation = found;
  }
  if (needsRegulation(sample) && !regulation) {
    return { ok: false, status: 400, error: "Choisissez la réglementation en vigueur pour cet échantillon." };
  }
  return { ok: true, regulation };
}

/** Recorded on the sample and remembered for the client's product. */
async function recordRegulation(
  sample: ValidationSample,
  regulation: ChosenRegulation | null,
  actorId: string,
  context: SignatureContext
) {
  if (!regulation || regulation.id === sample.regulationId) return;
  if (sample.productId) {
    await prisma.clientProduct.update({ where: { id: sample.productId }, data: { regulationId: regulation.id } });
  }
  await logAudit({
    actorId,
    action: "SAMPLE_REGULATION_SET",
    entity: "Sample",
    entityId: sample.id,
    metadata: {
      code: sample.code,
      before: sample.regulation?.title ?? null,
      after: regulation.title,
      ...(context.viaSerie ? { viaSerie: context.viaSerie } : {}),
    },
  });
}

export type TechnicalValidationBody = {
  id: string;
  validatedAt: Date;
  awaiting: "ADMIN";
  dispatch?: { alerts?: number; error?: string };
};

/** Step 1, « Valider techniquement » — VALIDATEUR, DIRECTION or ADMIN. */
export async function validateTechnically(
  sample: ValidationSample,
  session: Signer,
  regulation: ChosenRegulation | null,
  context: SignatureContext = {}
): Promise<SignatureOutcome<TechnicalValidationBody>> {
  const check = canValidateTechnically(sample, session.role);
  if (!check.ok) return { ok: false, status: 409, error: check.error };

  const now = new Date();
  // Guard against two validateurs signing the same sample at once:
  // `updateMany` re-checks the guard in the UPDATE itself and counts the
  // rows it changed (`update` reads first, then writes by id — two
  // signatures racing both "succeeded" and both were journalled).
  const claimed = await prisma.sample.updateMany({
    where: { id: sample.id, status: "RESULTATS_SAISIS", validatedById: null },
    data: { validatedById: session.id, validatedAt: now, ...(regulation ? { regulationId: regulation.id } : {}) },
  });
  if (claimed.count === 0) {
    return { ok: false, status: 409, error: "Cet échantillon vient d'être validé par un autre validateur." };
  }

  await logAudit({
    actorId: session.id,
    action: "SAMPLE_VALIDATED_TECHNICAL",
    entity: "Sample",
    entityId: sample.id,
    metadata: {
      code: sample.code,
      step: "1/2",
      regulation: regulation?.title ?? null,
      ...(context.viaSerie ? { viaSerie: context.viaSerie } : {}),
    },
  });
  await recordRegulation(sample, regulation, session.id, context);

  // Pending client decision n°11 (LabSettings): when the lab wants the
  // contamination alerts out as soon as the technical validation lands,
  // they leave here — the admin approval later finds alertsSentAt set and
  // does not send them again. Never blocks the validation itself.
  let dispatch: { alerts?: number; error?: string } | undefined;
  const settings = context.settings ?? (await getLabSettings());
  if (settings.alertAfterTechnicalValidation) {
    const alerts = await sendContaminationAlerts(sample.id, session.id, context).catch((error) => {
      console.error("[validation] alert send failed", { error });
      return { ok: false as const, error: "Envoi des alertes impossible." };
    });
    dispatch = alerts.ok ? { alerts: alerts.sent } : { error: alerts.error };
  }

  return { ok: true, body: { id: sample.id, validatedAt: now, awaiting: "ADMIN", dispatch } };
}

export type ApprovalBody = {
  id: string;
  code: string;
  status: "VALIDE";
  approvedAt: Date;
  report: IssuedReport | null;
  dispatch: { report?: string; alerts?: number; error?: string };
};

/**
 * Step 2, the administrative validation — DIRECTION or ADMIN, never the
 * person who signed step 1 (12/10) — which sets the status to VALIDE and
 * issues the report; `plan` (`approvalDispatch`, read by the caller before
 * anything is written) says whether it is also sent (« Valider et
 * envoyer ») — nothing is sent automatically any more (16/10, Q92). The
 * contamination alerts still run here whatever `plan` says.
 */
export async function approveSample(
  sample: ValidationSample,
  session: Signer,
  regulation: ChosenRegulation | null,
  plan: { sendReport: boolean },
  context: SignatureContext = {}
): Promise<SignatureOutcome<ApprovalBody>> {
  const check = canApprove(sample, session.role, session.id);
  if (!check.ok) {
    // A role that may never approve is refused (403, HANDOFF §3); the
    // Direction or an ADMIN meeting a state that forbids it now (or its
    // own technical signature) gets the 409.
    return { ok: false, error: check.error, status: signsAdministratively(session.role) ? 409 : 403 };
  }

  const now = new Date();
  // Atomic: only the request whose UPDATE moved the sample goes on to
  // issue and send the report. The technical signature checked above is
  // part of the guard — a send-back racing this approval clears it.
  const claimed = await prisma.sample.updateMany({
    where: { id: sample.id, status: "RESULTATS_SAISIS", validatedById: sample.validatedById },
    data: {
      approvedById: session.id,
      approvedAt: now,
      status: "VALIDE",
      ...(regulation ? { regulationId: regulation.id } : {}),
    },
  });
  if (claimed.count === 0) {
    return {
      ok: false,
      status: 409,
      error: "Cet échantillon vient d'être validé administrativement ou renvoyé par quelqu'un d'autre.",
    };
  }

  // From here the sample is VALIDE: its SAMPLE_APPROVED is written whatever
  // follows (`finally`) — a regulation, an issue or a send that throws still
  // leaves the approval in the journal, marked `incomplete`, and the error
  // goes on to the caller (the route's 500, the série line « failed »).
  let report: IssuedReport | null = null;
  let dispatch: { report?: string; alerts?: number; error?: string } = {};
  let broke = false;
  try {
    // Approval is what makes the report official, so it is created here — with
    // the names frozen as they stand today, so a report downloaded next year
    // still shows who actually signed it. A report reopened for amendment is
    // not recreated: its next version (« -A1 ») is issued.
    await recordRegulation(sample, regulation, session.id, context);
    report = await issueReportFor(sample.id, session.id);

    // The report leaves only on « Valider et envoyer »; otherwise the sample
    // stays VALIDE, « à envoyer », until « Envoyer au client ». The alerts
    // run either way: a no-op when they left at the technical validation,
    // the retry of a failed one, or their only send when the laboratory has
    // them wait for this approval. Neither may break the approval, which is
    // already recorded — a failed send is visible in the journal and can be
    // retried from the interface.
    if (report) {
      if (plan.sendReport) {
        const sent = await sendReport(sample.id, session.id, context).catch((error) => {
          console.error("[validation] report send failed", { error });
          return { ok: false as const, error: "Envoi du rapport impossible." };
        });
        dispatch = sent.ok ? { report: sent.status } : { error: sent.error };
      }

      const alerts = await sendContaminationAlerts(sample.id, session.id, context).catch((error) => {
        console.error("[validation] alert send failed", { error });
        return { ok: false as const, error: "Envoi des alertes impossible." };
      });
      if (alerts.ok) dispatch.alerts = alerts.sent;
      else dispatch.error = [dispatch.error, alerts.error].filter(Boolean).join(" ");
    } else {
      // The approval stands; the send retries the issue (`sendReport`).
      dispatch.error = "Le rapport n'a pas pu être émis : utilisez « Générer et envoyer le rapport » ou « Renvoyer au client ».";
    }
  } catch (error) {
    broke = true;
    throw error;
  } finally {
    await logAudit({
      actorId: session.id,
      action: "SAMPLE_APPROVED",
      entity: "Sample",
      entityId: sample.id,
      metadata: {
        from: "RESULTATS_SAISIS",
        to: "VALIDE",
        code: sample.code,
        step: "2/2",
        reportNumber: report?.number ?? null,
        // « Valider » or « Valider et envoyer » (16/10, Q92).
        send: plan.sendReport,
        ...(report?.amended ? { amendment: true } : {}),
        // What followed the approval threw: see the error logged with it.
        ...(broke ? { incomplete: true } : {}),
        ...(context.viaSerie ? { viaSerie: context.viaSerie } : {}),
      },
    });
  }

  return { ok: true, body: { id: sample.id, code: sample.code, status: "VALIDE", approvedAt: now, report, dispatch } };
}

/** What « Envoyer / Renvoyer au client » answers: the send, and the alerts that rode along. */
export type ReportSendOutcome =
  | { ok: true; status: string; to: string[]; alerts: number; alertsError?: string }
  /** `inFlight`: another send of this report is under way (`sendReport`'s SingleFlight). */
  | { ok: false; error: string; inFlight?: true };

/**
 * Sends — or resends — one sample's report to the client, and the alerts
 * with it: any batch that failed (or was skipped for lack of an address) at
 * approval is retried here — already-sent ones are not repeated, the claim
 * on the sample sees to that. `POST /api/samples/[id]/report/send` and the
 * série's send (plan D3, `viaSerie` in `context`) both go through it.
 */
export async function sendReportWithAlerts(
  sampleId: string,
  actorId: string,
  context: SignatureContext = {}
): Promise<ReportSendOutcome> {
  const result = await sendReport(sampleId, actorId, context);
  if (!result.ok) return { ok: false, error: result.error, ...("inFlight" in result ? { inFlight: true as const } : {}) };

  const alerts = await sendContaminationAlerts(sampleId, actorId, context).catch((error) => {
    console.error("[report/send] alert send failed", { error });
    return { ok: false as const, error: "Envoi des alertes impossible." };
  });

  return {
    ...result,
    alerts: alerts.ok ? alerts.sent : 0,
    alertsError: alerts.ok ? undefined : alerts.error,
  };
}

// ─── The whole série (re-ask 2.16, plan D3 + D4) ─────────────────────────────

/** A série's samples as its validation plan, and then its signatures, read them. */
const SERIE_SAMPLE_SELECT = {
  ...VALIDATION_SAMPLE_SELECT,
  controlCode: true,
  lineNumber: true,
  // What the line is: « Planche verte — surface nettoyée » (the queue's wording).
  lineKind: true,
  produit: true,
  surfaceLabel: true,
  surfaceState: true,
  personName: true,
  airMethod: true,
  airExposureMin: true,
  // The regulation the panel would preselect (`proposeRegulation`).
  product: { select: { regulationId: true } },
  productType: { select: { regulationId: true } },
  nature: { select: { family: true } },
  // What the panel warns about and the queue badges: non-conform results,
  // anomalies, and the ones that alert (`serieResultCounts`); and the
  // conclusion the report will print (`serieConclusion`).
  results: {
    select: {
      conform: true,
      workStatus: true,
      interpretation: true,
      informalInterpretation: true,
      parameter: { select: { alertOnExceed: true } },
    },
  },
} satisfies Prisma.SampleSelect;

type SerieSample = Prisma.SampleGetPayload<{ select: typeof SERIE_SAMPLE_SELECT }>;

/** The série's number and client, or null when it does not exist. */
export async function serieHeader(serieId: string) {
  return prisma.serie.findUnique({
    where: { id: serieId },
    select: { id: true, serialNumber: true, client: { select: { name: true } } },
  });
}

function lineOf(sample: Pick<SerieSample, "id" | "code" | "controlCode" | "lineNumber"> & Parameters<typeof lineDesignation>[0]) {
  return { id: sample.id, code: sample.code, controlCode: sample.controlCode, lineNumber: sample.lineNumber, designation: lineDesignation(sample) };
}

/**
 * The série's samples as candidates of its validation plan, each with the
 * regulation its own panel would preselect — the same `proposeRegulation`
 * over the same sources — so « toute la série » records what « Valider »
 * on each sample would have.
 */
async function serieValidationCandidates(serieId: string) {
  const [samples, settings, active] = await Promise.all([
    prisma.sample.findMany({
      where: { serieId },
      select: SERIE_SAMPLE_SELECT,
      orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
    }),
    getLabSettings(),
    prisma.regulation.findMany({ where: { active: true }, select: { id: true, title: true } }),
  ]);
  const titles = new Map(active.map((regulation) => [regulation.id, regulation.title]));
  const activeIds = new Set(titles.keys());
  const candidates: SerieValidationCandidate[] = samples.map((sample) => {
    const proposedId = proposeRegulation(
      {
        sample: sample.regulationId,
        clientProduct: sample.product?.regulationId ?? null,
        productType: sample.productType?.regulationId ?? null,
        family: sample.nature.family,
        settings,
      },
      activeIds
    );
    return {
      ...lineOf(sample),
      ...serieResultCounts(sample.results),
      conclusion: serieConclusion(sample.results),
      status: sample.status,
      validatedById: sample.validatedById,
      productTypeId: sample.productTypeId,
      amendmentPending: sample.report?.amendmentPending ?? false,
      proposedRegulation: proposedId ? { id: proposedId, title: titles.get(proposedId) ?? "" } : null,
      recordedRegulation: sample.regulation?.title ?? null,
    };
  });
  return { samples, settings, candidates };
}

/** No mail provider configured yet: every send is recorded (SIMULE), none delivered. */
const emailLive = () => !!process.env.RESEND_API_KEY;

/** What « Valider la série » would do, for its confirmation dialog. */
export async function serieValidationPlanFor(serieId: string, action: SerieValidationAction, session: Signer) {
  const { settings, candidates } = await serieValidationCandidates(serieId);
  return {
    ...serieValidationPlan(candidates, action, session, { alertsAtTechnical: settings.alertAfterTechnicalValidation }),
    // The panel's « Mode démonstration » notice, in the dialog too.
    emailLive: emailLive(),
  };
}

/**
 * What a line says when its signature threw — checked, never assumed: the
 * claim (`updateMany`) is committed before the regulation, the report and
 * the journal, so a throw may come after the signature landed.
 */
async function signatureAfterError(sampleId: string, action: SerieValidationAction, signerId: string): Promise<string> {
  try {
    const now = await prisma.sample.findUnique({ where: { id: sampleId }, select: { validatedById: true, approvedById: true } });
    const landed = action === "validate" ? now?.validatedById === signerId : now?.approvedById === signerId;
    return landed
      ? "Signature enregistrée, mais la suite a échoué (rapport, envoi ou journal) : vérifiez depuis sa fiche."
      : "Erreur inattendue : cet échantillon n'a pas été validé. Réessayez depuis sa fiche.";
  } catch {
    return "Erreur inattendue : ouvrez sa fiche pour voir où il en est.";
  }
}

/**
 * Signs every sample the dialog confirmed (`requested`) that the plan,
 * read again now, still finds eligible — one by one, each through
 * `validateTechnically` / `approveSample` with the regulation the dialog
 * showed. A sample not eligible any more is left untouched and said so; an
 * unexpected error on one is reported on that line and the others go on.
 */
export async function runSerieValidation(
  serie: { id: string; serialNumber: string },
  action: SerieValidationAction,
  session: Signer,
  requested: SerieValidationRequest["samples"],
  plan: { sendReport: boolean }
): Promise<SerieBatchLine[]> {
  const { samples, settings, candidates } = await serieValidationCandidates(serie.id);
  const fresh = serieValidationPlan(candidates, action, session, { alertsAtTechnical: settings.alertAfterTechnicalValidation });
  const live = emailLive();
  const byId = new Map(samples.map((sample) => [sample.id, sample]));
  const shownLines = new Map(candidates.map((candidate) => [candidate.id, serieLine(candidate)]));
  const skippedNow = new Map(fresh.skipped.map((line) => [line.id, line.reason]));
  const context: SignatureContext = { viaSerie: serie.serialNumber, settings };

  const lines: SerieBatchLine[] = [];
  for (const entry of requested) {
    const sample = byId.get(entry.id);
    const shown = shownLines.get(entry.id);
    if (!sample || !shown) {
      lines.push({ id: entry.id, reference: "—", line: "—", designation: "—", outcome: "skipped", detail: "Cet échantillon n'appartient pas à cette série." });
      continue;
    }
    const reason = skippedNow.get(sample.id);
    if (reason) {
      lines.push({ ...shown, outcome: "skipped", detail: reason });
      continue;
    }
    try {
      const resolved = await regulationFor(sample, entry.regulationId);
      if (!resolved.ok) {
        lines.push({ ...shown, outcome: "skipped", detail: resolved.error });
        continue;
      }
      const outcome =
        action === "validate"
          ? await validateTechnically(sample, session, resolved.regulation, context)
          : await approveSample(sample, session, resolved.regulation, plan, context);
      lines.push(
        outcome.ok
          ? { ...shown, outcome: "done", ...signatureDetail(action, plan.sendReport, outcome.body, live) }
          : { ...shown, outcome: "skipped", detail: outcome.error }
      );
    } catch (error) {
      console.error("[serie-validation] sample signature failed", { sampleId: sample.id, error });
      lines.push({ ...shown, outcome: "failed", detail: await signatureAfterError(sample.id, action, session.id) });
    }
  }
  return lines;
}

/** The série's samples as « Envoyer la série au client » reads them. */
async function serieSendCandidates(serieId: string): Promise<SerieSendCandidate[]> {
  const samples = await prisma.sample.findMany({
    where: { serieId },
    select: {
      id: true,
      code: true,
      controlCode: true,
      lineNumber: true,
      status: true,
      lineKind: true,
      produit: true,
      surfaceLabel: true,
      surfaceState: true,
      personName: true,
      airMethod: true,
      airExposureMin: true,
      // `amendedAt`: whether THIS version has left (`reportVersionSent`).
      report: { select: { number: true, version: true, sentAt: true, amendedAt: true, amendmentPending: true } },
    },
    orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
  });
  return samples.map((sample) => ({ ...lineOf(sample), status: sample.status, report: sample.report }));
}

/** What « Envoyer la série au client » would send, for its confirmation dialog. */
export async function serieSendPlanFor(serieId: string) {
  // The panel's « Mode démonstration » notice, in the dialog too.
  return { ...serieSendPlan(await serieSendCandidates(serieId)), emailLive: emailLive() };
}

/** A line whose report another send was sending at that very moment: it leaves (or fails) there, once. */
const SEND_IN_FLIGHT =
  "Un envoi de ce rapport était déjà en cours (depuis sa fiche ou un autre envoi de la série) : il ne part qu'une fois — vérifiez depuis sa fiche.";

/** The report as `serieSendRefusal` reads it, right before its send. */
const SEND_CHECK_SELECT = {
  status: true,
  report: { select: { number: true, version: true, sentAt: true, amendedAt: true, amendmentPending: true } },
} satisfies Prisma.SampleSelect;

/**
 * Sends the report of every sample the dialog confirmed that is still to
 * send — one e-mail per report, each through `sendReportWithAlerts`, one by
 * one (a send that fails never stops the next).
 *
 * Each sample is read again right before its own send, not once at the
 * start: `sendReport` is also the resend and has no « already sent » check
 * of its own, and each send renders a PDF (seconds each) — a per-sample
 * « Envoyer au client », or a second « Envoyer la série », may have sent
 * this one while the loop worked on the previous ones. Only the
 * SingleFlight's window remains, as for the per-sample button: a send of
 * this report under way at that very moment refuses this one (`inFlight`),
 * which is set aside — never « En échec », which would invite a resend.
 */
export async function runSerieSend(
  serie: { id: string; serialNumber: string },
  actorId: string,
  requested: readonly string[]
): Promise<SerieBatchLine[]> {
  const candidates = await serieSendCandidates(serie.id);
  const shownLines = new Map(candidates.map((candidate) => [candidate.id, serieLine(candidate)]));
  const live = emailLive();
  const context: SignatureContext = { viaSerie: serie.serialNumber };

  const lines: SerieBatchLine[] = [];
  for (const id of requested) {
    const shown = shownLines.get(id);
    if (!shown) {
      lines.push({ id, reference: "—", line: "—", designation: "—", outcome: "skipped", detail: "Cet échantillon n'appartient pas à cette série." });
      continue;
    }
    // Just before the send — a margin for the clocks of the app and the
    // database, which stamp the e-mail journal (`sendAfterError`).
    const startedAt = new Date(Date.now() - 1000);
    try {
      const now = await prisma.sample.findUnique({ where: { id, serieId: serie.id }, select: SEND_CHECK_SELECT });
      const refusal = now ? serieSendRefusal(now) : "Cet échantillon n'appartient pas à cette série.";
      if (refusal || !now?.report) {
        lines.push({ ...shown, outcome: "skipped", detail: refusal ?? "Rapport pas encore émis." });
        continue;
      }
      const number = amendedNumber(now.report.number, now.report.version);
      const sent = await sendReportWithAlerts(id, actorId, context);
      lines.push(
        sent.ok
          ? { ...shown, outcome: "done", ...sendDetail(number, sent, live) }
          : sent.inFlight
            ? { ...shown, outcome: "skipped", detail: SEND_IN_FLIGHT }
            : { ...shown, outcome: "failed", detail: sent.error }
      );
    } catch (error) {
      console.error("[serie-send] report send failed", { sampleId: id, error });
      lines.push({ ...shown, outcome: "failed", detail: await sendAfterError(id, startedAt) });
    }
  }
  return lines;
}

function sendDetail(number: string, sent: Extract<ReportSendOutcome, { ok: true }>, live: boolean) {
  return signatureDetail(
    "send",
    true,
    { report: { number }, dispatch: { report: sent.status, alerts: sent.alerts, error: sent.alertsError } },
    live
  );
}

/**
 * What a line says when its send threw — checked, never assumed: the
 * e-mail is journalled before the report and the sample are marked sent,
 * so a throw may come after it left.
 */
async function sendAfterError(sampleId: string, startedAt: Date): Promise<string> {
  try {
    const [log, sample] = await Promise.all([
      prisma.emailLog.findFirst({
        where: { type: "RAPPORT", report: { sampleId }, createdAt: { gte: startedAt }, status: { not: "ECHEC" } },
        select: { status: true },
      }),
      prisma.sample.findUnique({ where: { id: sampleId }, select: { report: { select: { sentAt: true, sendStatus: true } } } }),
    ]);
    const report = sample?.report ?? null;
    // The journal row, else the report marked sent during this attempt.
    const status = log?.status ?? (report?.sentAt && report.sentAt >= startedAt ? report.sendStatus : null);
    if (status === null) return "Erreur inattendue : aucun envoi de ce rapport n'est inscrit. Réessayez depuis sa fiche.";
    return status === "ENVOYE"
      ? "Rapport parti, mais son inscription a échoué : vérifiez depuis sa fiche."
      : "Envoi simulé inscrit au journal des envois, mais la suite a échoué : vérifiez depuis sa fiche.";
  } catch {
    return "Erreur inattendue : ouvrez sa fiche pour voir où il en est.";
  }
}
