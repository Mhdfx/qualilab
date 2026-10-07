import { prisma } from "./prisma";
import { AUDIT_ACTIONS, logAudit } from "./audit";
import { renderPdf } from "./pdf";
import {
  buildConclusion,
  buildReportHtml,
  germFingerprints,
  germsToRealert,
  reportDataFromJson,
  reportDataToJson,
  withSilentCorrection,
  REPORT_PDF_MARGIN,
  type AlertReading,
  type ReportAmendment,
  type ReportData,
} from "./report-html";
import { INTERPRETATION_LABELS, indicativeVerdict, legacyFailures, nothingJudged, sampleVerdict, storedPlan, unitStoredDisplay } from "./interpretation";
import { getLabSettings } from "./lab-settings";
import { proposeRegulation } from "./regulation";
import { sendEmail, recipientsFor } from "./email";
import { reportEmail, alertEmail, type AlertRow } from "./emails/templates";
import { getCompany } from "./company-server";
import { generateReportNumber } from "./report-number";
import { reportMethod, reportTechnicianNames } from "./report-programme";
import type { Prisma } from "@/generated/prisma/client";
import type { Interpretation } from "@/generated/prisma/enums";
import { retryOnDuplicate } from "./retry-unique";
import { sampleDesignation } from "./document-html";
import { REOPENED_SAMPLE_FIELDS, amendmentIssueRefusal, canTransition } from "./sample-status";
import { REOPENED_STATUS, amendedNumber, reopenRefusal } from "./report-amendment";
import type { Role } from "./roles";

/**
 * What happens once a sample is approved: the client receives the report, and
 * — if a sensitive parameter is over its limit — a contamination alert.
 *
 * Alerts are grouped by germ, as in the model the client sent: one message per
 * germ listing every product concerned, not one message per result.
 *
 * Amendments (AMENDEMENT.md): a report is issued once (`createReportFor`,
 * version 0) and every approval after « Rouvrir pour amendement »
 * (`reopenForAmendment`) issues the next version (`amendReportFor`): the
 * same record, `version` + 1, printed « RAP-…-A1 ». Each issue freezes the
 * exact `ReportData` printed in `ReportVersion`.
 */

/** The report's conclusion when a germ was taken on fewer units than its plan. */
export const NO_OFFICIAL_VERDICT =
  "Le nombre d'unités prélevées est inférieur au plan d'échantillonnage : les résultats sont communiqués sans interprétation.";

/** …and when no germ has any criterion to be judged against. */
export const NO_CRITERION = "Les résultats sont communiqués sans interprétation : aucun critère n'est spécifié pour ces paramètres.";

/** The fields `sampleDesignation` reads: « Planche verte — surface nettoyée ». */
const DESIGNATION_SELECT = {
  lineKind: true,
  produit: true,
  surfaceLabel: true,
  surfaceState: true,
  personName: true,
  airMethod: true,
} as const;

/** What the report prints of the sample itself — everything but the report's own fields. */
const REPORT_SAMPLE_SELECT = {
  controlCode: true,
  // The site of the client (a restaurant of a chain): printed under the
  // client — RETOUR-LABO-06-10.md §5, V5.
  serie: { select: { serialNumber: true, site: { select: { name: true } } } },
  ...DESIGNATION_SELECT,
  numeroLot: true,
  lieu: true,
  type: true,
  sampledAt: true,
  receivedAt: true,
  user: { select: { name: true } },
  approvedBy: { select: { name: true } },
  client: { select: { name: true, address: true, ice: true } },
  unitCount: true,
  // The programme d'analyse: the norm version retained per parameter.
  parameters: { select: { parameterId: true, normVersion: { select: { label: true } } } },
  results: {
    select: {
      value: true,
      unit: true,
      threshold: true,
      conform: true,
      note: true,
      interpretation: true,
      criterion: true,
      normVersion: { select: { label: true } },
      units: { select: { rawValue: true, value: true, detected: true }, orderBy: { unitIndex: "asc" } },
      parameter: {
        select: {
          id: true,
          name: true,
          // The parameter's own method: the version in force of a norm
          // its catalogue criteria cite — the last fallback.
          criteria: {
            where: { active: true, normVersion: { is: { current: true } } },
            select: { normVersion: { select: { label: true } } },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.SampleSelect;

type ReportSample = Prisma.SampleGetPayload<{ select: typeof REPORT_SAMPLE_SELECT }>;

/** The report's own fields, frozen at each issue. */
type ReportFields = {
  conclusion: string | null;
  interpretation: Interpretation | null;
  regulation: string | null;
  technicianName: string | null;
  validatorName: string | null;
  validatedAt: Date | null;
};

const REPORT_SELECT = {
  id: true,
  number: true,
  version: true,
  amendmentPending: true,
  amendmentNote: true,
  amendedAt: true,
  createdAt: true,
  conclusion: true,
  interpretation: true,
  regulation: true,
  technicianName: true,
  validatorName: true,
  validatedAt: true,
} satisfies Prisma.ReportSelect;

type ReportRow = Prisma.ReportGetPayload<{ select: typeof REPORT_SELECT }>;

/** The `ReportData` of a sample with the given report fields and printed number. */
function toReportData(
  sample: ReportSample,
  fields: ReportFields & { number: string; amendment?: ReportAmendment | null }
): ReportData {
  const programmedNorm = new Map(sample.parameters.map((p) => [p.parameterId, p.normVersion?.label ?? null]));

  return {
    number: fields.number,
    controlCode: sample.controlCode,
    serialNumber: sample.serie.serialNumber,
    client: sample.client,
    siteName: sample.serie.site?.name ?? null,
    produit: sampleDesignation(sample),
    lineKind: sample.lineKind,
    numeroLot: sample.numeroLot,
    lieu: sample.lieu,
    type: sample.type,
    sampledAt: sample.sampledAt,
    receivedAt: sample.receivedAt,
    preleveur: sample.user.name,
    technicianName: fields.technicianName,
    validatorName: fields.validatorName,
    approverName: sample.approvedBy?.name ?? null,
    validatedAt: fields.validatedAt,
    conclusion: fields.conclusion ?? "",
    interpretation: fields.interpretation,
    regulation: fields.regulation,
    unitCount: sample.unitCount,
    results: sample.results.map((result) => ({
      parameter: result.parameter.name,
      value: result.value,
      unit: result.unit,
      threshold: result.threshold,
      conform: result.conform,
      note: result.note,
      interpretation: result.interpretation,
      // « Méthode » (PROGRAMME.md §6): the programmed version, else the one
      // the result was read under (the criterion's), else the parameter's.
      norm: reportMethod(
        programmedNorm.get(result.parameter.id),
        result.normVersion?.label,
        result.parameter.criteria[0]?.normVersion?.label
      ),
      criterion: storedPlan(result.criterion),
      units: result.units.map((u) => ({ display: unitStoredDisplay(u), value: u.value, detected: u.detected })),
    })),
    amendment: fields.amendment ?? null,
  };
}

/** A frozen version as stored; null when it was never frozen (or is unreadable). */
export async function loadReportVersion(reportId: string, version: number) {
  const row = await prisma.reportVersion.findUnique({
    where: { reportId_version: { reportId, version } },
    select: { version: true, number: true, data: true, note: true, reconstructed: true, issuedAt: true },
  });
  if (!row) return null;
  const data = reportDataFromJson(row.data);
  if (!data) {
    console.error("[report] unreadable frozen version", { reportId, version });
    return null;
  }
  return { ...row, data };
}

/** The amendment header of the current version: the version it replaces. */
async function amendmentOf(report: Pick<ReportRow, "id" | "number" | "version" | "amendmentNote" | "createdAt">) {
  if (report.version === 0) return null;
  const previous = await prisma.reportVersion.findUnique({
    where: { reportId_version: { reportId: report.id, version: report.version - 1 } },
    select: { number: true, issuedAt: true },
  });
  return {
    previousNumber: previous?.number ?? amendedNumber(report.number, report.version - 1),
    previousIssuedAt: previous?.issuedAt ?? report.createdAt,
    note: report.amendmentNote?.trim() || null,
  };
}

/** The current version from the live data (`admin-edit` included). */
async function liveReportData(sampleId: string, report: ReportRow): Promise<ReportData | null> {
  const sample = await prisma.sample.findUnique({ where: { id: sampleId }, select: REPORT_SAMPLE_SELECT });
  if (!sample) return null;
  return toReportData(sample, {
    ...report,
    number: amendedNumber(report.number, report.version),
    amendment: await amendmentOf(report),
  });
}

/**
 * Assembles the data of the report's current version. Shared with the
 * download route and the send.
 *
 * Rendered from the live data — so the administrator's correction
 * (`/api/reports/[id]/admin-edit`) shows — except while an amendment is in
 * progress: the results and signatures are then being redone, and the
 * current version is the one frozen at « Rouvrir pour amendement ».
 */
export async function loadReportData(sampleId: string): Promise<ReportData | null> {
  const report = await prisma.report.findUnique({ where: { sampleId }, select: REPORT_SELECT });
  if (!report) return null;
  if (report.amendmentPending) {
    const frozen = await loadReportVersion(report.id, report.version);
    // The administrator's silent correction still shows on the version in
    // force, frozen or not (the conclusion is all it writes).
    if (frozen) return withSilentCorrection(frozen.data, report.conclusion);
  }
  return liveReportData(sampleId, report);
}

/**
 * The report's own fields as they stand today — the names frozen, so a
 * report downloaded next year still shows who actually signed it.
 */
async function computeReportFields(sampleId: string): Promise<ReportFields | null> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      validatedAt: true,
      technician: { select: { name: true } },
      // « Analyses réalisées par » names every technician of the line
      // (PROGRAMME.md §6): the sample's and each parameter's, once each.
      parameters: { select: { technician: { select: { name: true } } } },
      validatedBy: { select: { name: true } },
      nature: { select: { family: true } },
      regulationId: true,
      product: { select: { regulationId: true } },
      productType: { select: { regulationId: true } },
      results: {
        select: { conform: true, interpretation: true, informalInterpretation: true, parameter: { select: { name: true } } },
      },
    },
  });
  if (!sample) return null;

  // Under criteria the conclusion is the scale's sentence for the worst
  // verdict (CRITERES.md §2 rule 5); otherwise the historical wording. A
  // germ still judged on its old limit is named after the sentence, so the
  // conclusion can never say « conforme » above a non-conform line.
  //
  // Too few units for a germ's plan (RETOUR-LABO-29-09.md §3 rule 2): no
  // official verdict at all — the report states why, and names any germ
  // still over its old limit.
  const verdict = sampleVerdict(sample.results);
  const scale = verdict ? await prisma.conclusionScale.findUnique({ where: { interpretation: verdict } }) : null;
  const legacy = legacyFailures(sample.results).map((r) => r.parameter.name);
  const legacySentence =
    legacy.length > 0
      ? `Paramètres hors des limites de référence : ${legacy.join(", ")}. Une action corrective est recommandée.`
      : "";
  const indicativeOnly = verdict === null && sample.results.some((r) => r.interpretation === null && r.informalInterpretation);
  const historical = buildConclusion(
    sample.results.map((r) => ({ conform: r.conform, parameter: r.parameter.name }))
  );
  const conclusion = scale
    ? [scale.sentence, legacySentence].filter(Boolean).join(" ")
    : indicativeOnly
      ? [NO_OFFICIAL_VERDICT, legacySentence].filter(Boolean).join(" ")
      : nothingJudged(sample.results)
        ? NO_CRITERION
        : historical;

  // « Réglementation en vigueur »: the one the technical validator chose for
  // this sample (slice I); a sample validated without one (no criteria, or
  // before slice I) takes what the screen would have proposed. Frozen here
  // as text, so a later edit of the catalogue never alters this report.
  const settings = await getLabSettings();
  const activeRegulations = await prisma.regulation.findMany({ where: { active: true }, select: { id: true, text: true } });
  const regulationId = proposeRegulation(
    {
      sample: sample.regulationId,
      clientProduct: sample.product?.regulationId ?? null,
      productType: sample.productType?.regulationId ?? null,
      family: sample.nature.family,
      settings,
    },
    new Set(activeRegulations.map((r) => r.id))
  );
  const regulation = activeRegulations.find((r) => r.id === regulationId)?.text ?? null;

  return {
    conclusion,
    interpretation: verdict,
    regulation,
    technicianName: reportTechnicianNames(sample),
    validatorName: sample.validatedBy?.name ?? null,
    validatedAt: sample.validatedAt,
  };
}

const asJson = (data: ReportData) => reportDataToJson(data) as Prisma.InputJsonValue;

export type IssuedReport = { id: string; number: string; amended?: boolean };

/**
 * Creates the report record for an approved sample, and freezes its version
 * 0 with it (one transaction). Idempotent: an existing report is returned as
 * is. Number collisions (two approvals at the same instant) are retried; any
 * other failure returns null and is logged, and `sendReport` retries the
 * creation later so an approved sample can never stay report-less forever.
 */
export async function createReportFor(sampleId: string): Promise<IssuedReport | null> {
  const existing = await prisma.report.findUnique({
    where: { sampleId },
    select: { id: true, number: true, version: true },
  });
  if (existing) return { id: existing.id, number: amendedNumber(existing.number, existing.version) };

  const fields = await computeReportFields(sampleId);
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { ...REPORT_SAMPLE_SELECT, approvedAt: true, approvedById: true },
  });
  if (!fields || !sample) return null;

  try {
    return await retryOnDuplicate(async () => {
      const number = await generateReportNumber();
      const data = toReportData(sample, { ...fields, number });
      return prisma.$transaction(async (tx) => {
        const report = await tx.report.create({
          data: { sampleId, number, ...fields },
          select: { id: true, number: true },
        });
        await tx.reportVersion.create({
          data: {
            reportId: report.id,
            version: 0,
            number,
            data: asJson(data),
            issuedAt: sample.approvedAt ?? new Date(),
            issuedById: sample.approvedById,
          },
        });
        return report;
      });
    });
  } catch (error) {
    // Two approvals at the same instant: the other one created it.
    const created = await prisma.report.findUnique({ where: { sampleId }, select: { id: true, number: true, version: true } });
    if (created) return { id: created.id, number: amendedNumber(created.number, created.version) };
    console.error("[report] creation failed", { sampleId, error });
    return null;
  }
}

class StaleAmendment extends Error {}

/**
 * Issues the amended version of a report reopened for amendment
 * (AMENDEMENT.md §2.3), at the approval: the record is not recreated —
 * `version` + 1, printed « RAP-…-A1 », the fields frozen anew (the new
 * signatures, conclusion and verdict), `amendmentNote` / `amendedAt`, and a
 * new `ReportVersion` holding the exact data printed, with the header
 * « Rapport amendé — annule et remplace le rapport … du … ». One
 * transaction; null (logged) on failure — `sendReport` retries it.
 */
export async function amendReportFor(sampleId: string, actorId: string | null): Promise<IssuedReport | null> {
  const report = await prisma.report.findUnique({ where: { sampleId }, select: REPORT_SELECT });
  if (!report) return null;
  if (!report.amendmentPending) {
    return { id: report.id, number: amendedNumber(report.number, report.version) };
  }

  const fields = await computeReportFields(sampleId);
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { ...REPORT_SAMPLE_SELECT, code: true, status: true, validatedById: true, approvedAt: true, approvedById: true },
  });
  if (!fields || !sample) return null;
  // Never without the full double validation, whoever calls.
  const refusal = amendmentIssueRefusal(sample);
  if (refusal) {
    console.error("[report] amendment refused", { sampleId, status: sample.status, refusal });
    return null;
  }

  // The version replaced: frozen at « Rouvrir pour amendement ».
  const replaced = await loadReportVersion(report.id, report.version);
  const previousNumber = replaced?.number ?? amendedNumber(report.number, report.version);
  const previousIssuedAt = replaced?.issuedAt ?? report.amendedAt ?? report.createdAt;
  const version = report.version + 1;
  const number = amendedNumber(report.number, version);
  const note = report.amendmentNote?.trim() || null;
  const issuedAt = sample.approvedAt ?? new Date();
  const data = toReportData(sample, { ...fields, number, amendment: { previousNumber, previousIssuedAt, note } });

  try {
    await prisma.$transaction(async (tx) => {
      // Guarded: two approvals racing issue one version, not two.
      const claimed = await tx.report.updateMany({
        where: { id: report.id, amendmentPending: true, version: report.version },
        data: {
          ...fields,
          version,
          amendedAt: issuedAt,
          amendmentPending: false,
          // The amended report has not reached the client yet.
          sendStatus: "NON_ENVOYE",
        },
      });
      if (claimed.count === 0) throw new StaleAmendment();
      await tx.reportVersion.create({
        data: { reportId: report.id, version, number, data: asJson(data), note, issuedAt, issuedById: sample.approvedById },
      });
    });
  } catch (error) {
    if (error instanceof StaleAmendment || (error as { code?: string }).code === "P2002") {
      // Someone else issued it a moment ago: return what is current.
      const current = await prisma.report.findUnique({ where: { id: report.id }, select: { number: true, version: true } });
      return current ? { id: report.id, number: amendedNumber(current.number, current.version) } : null;
    }
    console.error("[report] amendment failed", { sampleId, error });
    return null;
  }

  await logAudit({
    actorId,
    action: AUDIT_ACTIONS.REPORT_AMENDED,
    entity: "Report",
    entityId: report.id,
    metadata: { code: sample.code, number, version, note, replaces: previousNumber },
  });

  return { id: report.id, number, amended: true };
}

/** What the approval issues: the amended version when one is pending, else the report itself. */
export async function issueReportFor(sampleId: string, actorId: string | null): Promise<IssuedReport | null> {
  const report = await prisma.report.findUnique({ where: { sampleId }, select: { amendmentPending: true } });
  return report?.amendmentPending ? amendReportFor(sampleId, actorId) : createReportFor(sampleId);
}

/** The longest amendment reason accepted: it is printed on the one-page report. */
export const AMENDMENT_NOTE_MAX = 500;

export type ReopenOutcome =
  | { ok: true; number: string; version: number; frozen: boolean }
  | { ok: false; status: number; error: string };

/**
 * « Rouvrir pour amendement » (AMENDEMENT.md §2.1): the sample goes back to
 * RESULTATS_SAISIS with both signatures cleared, the current version is
 * frozen if it is not yet (version 0 of a report issued before versions
 * existed: « reconstituée »), and the report notes the amendment in progress
 * with its reason. One transaction, then the journal (REPORT_REOPENED).
 *
 * `alertsSentAt` is kept: the alerts already sent are not repeated for the
 * same results (`sendContaminationAlerts`).
 */
export async function reopenForAmendment(
  sampleId: string,
  actor: { id: string; role: Role },
  reason: unknown
): Promise<ReopenOutcome> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      code: true,
      status: true,
      approvedAt: true,
      approvedById: true,
      report: { select: REPORT_SELECT },
    },
  });
  if (!sample) return { ok: false, status: 404, error: "Échantillon introuvable." };
  const report = sample.report;
  if (!report) {
    return { ok: false, status: 409, error: "Aucun rapport n'a été émis pour cet échantillon : il n'y a rien à amender." };
  }

  const refusal = reopenRefusal({
    status: sample.status,
    role: actor.role,
    reason,
    amendmentPending: report.amendmentPending,
  });
  if (refusal) return { ok: false, status: actor.role === "ADMIN" ? 409 : 403, error: refusal };
  const motif = (reason as string).trim();
  // Printed under « Rapport amendé », on a report that holds on one page.
  if (motif.length > AMENDMENT_NOTE_MAX) {
    return {
      ok: false,
      status: 400,
      error: `Le motif de l'amendement est trop long (${AMENDMENT_NOTE_MAX} caractères au plus) : il est imprimé sur le rapport.`,
    };
  }
  const transition = canTransition(sample.status, REOPENED_STATUS, actor.role, motif);
  if (!transition.ok) return { ok: false, status: 409, error: transition.error };

  // The version in force is frozen before anything changes — unless it
  // already is (every version issued since this feature is).
  const alreadyFrozen = await prisma.reportVersion.findUnique({
    where: { reportId_version: { reportId: report.id, version: report.version } },
    select: { id: true },
  });
  let freeze: Prisma.ReportVersionUncheckedCreateInput | null = null;
  // Frozen at its issue, then silently corrected by the administrator
  // (`admin-edit`, the conclusion only): the version replaced must keep what
  // it printed last, not what it printed before the correction — the amended
  // header says it cancels and replaces exactly that document.
  let corrected: { id: string; data: Prisma.InputJsonValue } | null = null;
  if (alreadyFrozen) {
    const frozen = await loadReportVersion(report.id, report.version);
    if (frozen) {
      const printed = withSilentCorrection(frozen.data, report.conclusion);
      if (printed !== frozen.data) corrected = { id: alreadyFrozen.id, data: asJson(printed) };
    }
  } else {
    const data = await liveReportData(sampleId, report);
    if (!data) return { ok: false, status: 409, error: "Le rapport en vigueur n'a pas pu être relu : réessayez." };
    freeze = {
      reportId: report.id,
      version: report.version,
      number: data.number,
      data: asJson(data),
      note: report.version > 0 ? report.amendmentNote : null,
      reconstructed: true,
      issuedAt: report.version > 0 ? report.amendedAt ?? report.createdAt : sample.approvedAt ?? report.createdAt,
      issuedById: report.version === 0 ? sample.approvedById : null,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const moved = await tx.sample.updateMany({
        where: { id: sample.id, status: sample.status },
        data: REOPENED_SAMPLE_FIELDS,
      });
      if (moved.count === 0) throw new StaleAmendment();
      const marked = await tx.report.updateMany({
        where: { id: report.id, amendmentPending: false, version: report.version },
        data: { amendmentPending: true, amendmentNote: motif },
      });
      if (marked.count === 0) throw new StaleAmendment();
      if (freeze) await tx.reportVersion.create({ data: freeze });
      if (corrected) await tx.reportVersion.update({ where: { id: corrected.id }, data: { data: corrected.data } });
    });
  } catch (error) {
    if (error instanceof StaleAmendment || (error as { code?: string }).code === "P2002") {
      return { ok: false, status: 409, error: "Cet échantillon vient de changer d'état : rechargez la page." };
    }
    throw error;
  }

  const number = amendedNumber(report.number, report.version);
  await logAudit({
    actorId: actor.id,
    action: AUDIT_ACTIONS.REPORT_REOPENED,
    entity: "Report",
    entityId: report.id,
    metadata: {
      code: sample.code,
      number,
      version: report.version,
      reason: motif,
      from: sample.status,
      to: REOPENED_STATUS,
      reconstructed: freeze !== null,
    },
  });

  return { ok: true, number, version: report.version, frozen: freeze !== null };
}

/**
 * Sends the report to the client and marks the sample `RAPPORT_ENVOYE`.
 * Also used for a manual resend, which is why it is idempotent-friendly.
 * An amended version is sent like a new report, subject « Rapport amendé … ».
 */
export async function sendReport(sampleId: string, actorId: string | null) {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      code: true,
      status: true,
      ...DESIGNATION_SELECT,
      numeroLot: true,
      lieu: true,
      controlCode: true,
      sampledAt: true,
      receivedAt: true,
      clientId: true,
      client: { select: { name: true } },
      serie: { select: { serialNumber: true, site: { select: { name: true } } } },
      nature: { select: { label: true } },
      report: { select: { id: true, amendmentPending: true } },
      results: { select: { conform: true, interpretation: true, informalInterpretation: true } },
    },
  });

  if (!sample) {
    return { ok: false as const, error: "Échantillon introuvable." };
  }

  const approved = sample.status === "VALIDE" || sample.status === "RAPPORT_ENVOYE";
  if (sample.report?.amendmentPending) {
    // Until the new approval, the amended report does not exist yet.
    if (!approved) {
      return {
        ok: false as const,
        error: "Un amendement de ce rapport est en cours : le rapport amendé partira à son approbation.",
      };
    }
    // Self-healing: the approval went through but the amended version was
    // not issued — it is issued now.
    if (!(await amendReportFor(sample.id, actorId))) {
      return { ok: false as const, error: "Émission du rapport amendé impossible." };
    }
  } else if (!sample.report && approved) {
    // Self-healing: an approval whose report creation failed left a VALIDE
    // sample without its official document — the send creates it now instead
    // of failing forever.
    await createReportFor(sample.id);
  }

  const report = await prisma.report.findUnique({
    where: { sampleId: sample.id },
    select: { id: true, version: true, interpretation: true },
  });
  if (!report) {
    return { ok: false as const, error: "Aucun rapport à envoyer." };
  }

  const to = await recipientsFor(sample.clientId, "reports");
  if (to.length === 0) {
    return {
      ok: false as const,
      error: "Aucune adresse email enregistrée pour ce client.",
    };
  }

  const data = await loadReportData(sampleId);
  if (!data) return { ok: false as const, error: "Rapport indisponible." };

  const company = await getCompany();

  let attachment;
  try {
    attachment = {
      filename: `${data.number}.pdf`,
      content: await renderPdf(buildReportHtml(data, company), { margin: REPORT_PDF_MARGIN }),
    };
  } catch (error) {
    console.error("[dispatch] could not render the report", { sampleId, error });
    return { ok: false as const, error: "Génération du PDF impossible." };
  }

  // The conclusion of the summary table: the report's official verdict; the
  // indicative one when too few units left the report without any
  // (RETOUR-LABO-29-09.md §3 rule 2); otherwise the old conform reading.
  const official = report.interpretation ?? sampleVerdict(sample.results);
  const indicative = official === null ? indicativeVerdict(sample.results) : null;
  const legacyNonConform = sample.results.some((result) => result.conform === false);
  const verdict = official ?? indicative;
  const { subject, html } = reportEmail({
    clientName: sample.client.name,
    siteName: sample.serie.site?.name ?? null,
    reportNumber: data.number,
    serialNumber: sample.serie.serialNumber,
    controlCode: sample.controlCode,
    sampledAt: sample.sampledAt,
    receivedAt: sample.receivedAt,
    analyse: sample.nature.label,
    produit: sampleDesignation(sample),
    lineKind: sample.lineKind,
    numeroLot: sample.numeroLot,
    lieu: sample.lieu,
    conclusion: verdict
      ? INTERPRETATION_LABELS[verdict]
      : legacyNonConform
        ? "Non conforme"
        : nothingJudged(sample.results)
          ? "Sans interprétation"
          : "Conforme",
    alert: verdict ? verdict === "NON_SATISFAISANT" : legacyNonConform,
    indicative: official === null && indicative !== null && sample.results.some((r) => r.informalInterpretation),
    amendment: data.amendment ?? null,
  });

  const result = await sendEmail({
    to,
    subject,
    html,
    type: "RAPPORT",
    reportId: report.id,
    attachments: [attachment],
  });

  if (result.status === "ECHEC") {
    return { ok: false as const, error: result.error ?? "Envoi impossible." };
  }

  const sentAt = new Date();
  await prisma.report.update({
    where: { id: report.id },
    data: {
      sendStatus: result.status === "ENVOYE" ? "ENVOYE" : "NON_ENVOYE",
      sentAt,
      // The column holds 191 characters and the mail has already left:
      // a long recipient list is recorded truncated, never lost.
      sentTo: to.join(", ").slice(0, 191),
    },
  });

  // Only the first send advances the sample; a resend must not move it back.
  // updateMany: a sample reopened for amendment while this send was under
  // way is no longer VALIDE — it is simply not moved (an update would throw
  // after the mail has left, and the send would go unrecorded).
  if (sample.status === "VALIDE") {
    await prisma.sample.updateMany({
      where: { id: sample.id, status: "VALIDE" },
      data: { status: "RAPPORT_ENVOYE" },
    });
  }

  await logAudit({
    actorId,
    action: "REPORT_SENT",
    entity: "Report",
    entityId: report.id,
    metadata: {
      code: sample.code,
      number: data.number,
      version: report.version,
      to,
      status: result.status,
    },
  });

  return { ok: true as const, status: result.status, to };
}

/** The alerts already sent for a sample, as their fingerprints (successful sends only). */
async function alertsAlreadySent(sampleId: string) {
  const rows = await prisma.auditLog.findMany({
    where: { entity: "Sample", entityId: sampleId, action: "CONTAMINATION_ALERT_SENT" },
    select: { metadata: true },
  });
  const sent: { germ: string; fingerprint: string }[] = [];
  for (const row of rows) {
    try {
      const meta = JSON.parse(row.metadata ?? "null") as { germe?: unknown; fingerprint?: unknown; status?: unknown } | null;
      if (meta && typeof meta.germe === "string" && typeof meta.fingerprint === "string" && meta.status !== "ECHEC") {
        sent.push({ germ: meta.germe, fingerprint: meta.fingerprint });
      }
    } catch {
      // A row that is not JSON says nothing about this alert.
    }
  }
  return sent;
}

/**
 * Contamination alerts for a sample: any sensitive parameter over its limit.
 *
 * ⚠️ The limits currently seeded are the usual Moroccan (NM) criteria, used as
 * defaults until the laboratory supplies its official figures
 * (NEEDEDINFO item 1). Changing a limit changes what triggers an alert — no
 * code change is needed.
 *
 * Amended reports (AMENDEMENT.md — decision of the amendment slice): the
 * client is not alerted twice for the same results. While an amendment is
 * in progress or once a report has been amended, only the germs whose result
 * changed are alerted (`germsToRealert`): a germ is skipped when an alert
 * already left for exactly this result (the fingerprint recorded with each
 * CONTAMINATION_ALERT_SENT) or when the version replaced carried exactly
 * this result and the sample's alerts had gone out. A new germ over its
 * limit, another value, criterion or verdict is alerted again.
 */
export async function sendContaminationAlerts(
  sampleId: string,
  actorId: string | null
) {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      code: true,
      ...DESIGNATION_SELECT,
      numeroLot: true,
      lieu: true,
      receivedAt: true,
      clientId: true,
      alertsSentAt: true,
      serie: { select: { site: { select: { name: true } } } },
      report: { select: { id: true, version: true, amendmentPending: true } },
      results: {
        // A sensitive germ over its limit — including one judged only
        // indicatively (too few units): the contamination is real either way.
        where: {
          parameter: { alertOnExceed: true },
          OR: [{ conform: false }, { informalInterpretation: "NON_SATISFAISANT" }],
        },
        select: {
          value: true,
          unit: true,
          threshold: true,
          conform: true,
          interpretation: true,
          parameter: {
            select: { name: true, limitValue: true, unit: true, threshold: true },
          },
        },
      },
    },
  });

  if (!sample || sample.results.length === 0) {
    return { ok: true as const, sent: 0 };
  }

  const readings: AlertReading[] = sample.results.map((r) => ({
    parameter: r.parameter.name,
    value: r.value,
    unit: r.unit,
    threshold: r.threshold,
    conform: r.conform,
    interpretation: r.interpretation,
  }));
  const fingerprints = germFingerprints(readings);

  // Amendment: only what changed is alerted again.
  const report = sample.report;
  const amendment = report !== null && (report.amendmentPending || report.version > 0);
  let results = sample.results;
  if (amendment) {
    const replacedVersion = report.amendmentPending ? report.version : report.version - 1;
    const [replaced, alerted] = await Promise.all([
      sample.alertsSentAt ? loadReportVersion(report.id, replacedVersion) : Promise.resolve(null),
      alertsAlreadySent(sample.id),
    ]);
    const germs = new Set(
      germsToRealert({ current: readings, alerted, replaced: replaced?.data.results ?? null })
    );
    results = results.filter((r) => germs.has(r.parameter.name));
    if (results.length === 0) {
      return { ok: true as const, sent: 0, alreadySentAt: sample.alertsSentAt ?? undefined };
    }
  }

  // Nobody to write to: leave the sample unclaimed so the alert goes out as
  // soon as the gestionnaire records an address and the next step retries.
  const to = await recipientsFor(sample.clientId, "alerts");
  if (to.length === 0) {
    return {
      ok: false as const,
      error: "Aucune adresse d'alerte enregistrée pour ce client.",
    };
  }

  // The laboratory is always in copy of an alert.
  const cc = [(await getCompany()).email].filter(Boolean);

  // Claim atomically: whoever flips alertsSentAt from null wins, a
  // concurrent caller (early-alert validation racing the admin approval) sees
  // zero rows and leaves — one alert per contamination, never two. If any
  // germ fails below, the claim is released so the next call retries: a
  // contamination alert that reached nobody is worse than a duplicate.
  // On an amendment the claim is taken from the value read (alerts may
  // already have gone out for the version replaced), and released back to it.
  const previousClaim = amendment ? sample.alertsSentAt : null;
  const dispatchedAt = new Date();
  const claimed = await prisma.sample.updateMany({
    where: { id: sample.id, alertsSentAt: previousClaim },
    data: { alertsSentAt: dispatchedAt },
  });
  if (claimed.count === 0) {
    return {
      ok: true as const,
      sent: 0,
      alreadySentAt: sample.alertsSentAt ?? dispatchedAt,
    };
  }
  const releaseClaim = () =>
    prisma.sample.update({
      where: { id: sample.id },
      data: { alertsSentAt: previousClaim },
    });

  // One message per germ, listing every product concerned. « Site de
  // prélèvement » names the client's site before the place when the série
  // has one: a chain reads which restaurant is concerned (V5).
  const designation = sampleDesignation(sample);
  const siteName = sample.serie.site?.name ?? null;
  const site = siteName ? `${siteName} — ${sample.lieu}` : sample.lieu;
  const byGerm = new Map<string, AlertRow[]>();
  for (const result of results) {
    const germ = result.parameter.name;
    const unit = result.unit ?? result.parameter.unit ?? "";
    // The criterion the verdict came from when there is one (stored on the
    // result), otherwise the parameter's catalogue threshold — its unit
    // moves into the column header with the result's.
    const limite =
      result.threshold ??
      result.parameter.threshold ??
      (result.parameter.limitValue !== null ? String(result.parameter.limitValue) : "—");
    const row: AlertRow = {
      produit: designation,
      site,
      receivedAt: sample.receivedAt,
      numeroLot: sample.numeroLot,
      germe: germ,
      resultat: result.value ?? "—",
      limite: unit ? limite.replace(` ${unit}`, "").trim() : limite,
      unit: unit || null,
    };
    byGerm.set(germ, [...(byGerm.get(germ) ?? []), row]);
  }

  let sent = 0;
  const failed: string[] = [];
  try {
    for (const [germ, rows] of byGerm) {
      const { subject, html } = alertEmail(germ, rows);
      const result = await sendEmail({
        to,
        cc,
        subject,
        html,
        type: "ALERTE_CONTAMINATION",
        reportId: sample.report?.id ?? null,
      });

      if (result.status !== "ECHEC") sent += 1;
      else failed.push(germ);

      await logAudit({
        actorId,
        action: "CONTAMINATION_ALERT_SENT",
        entity: "Sample",
        entityId: sample.id,
        metadata: {
          code: sample.code,
          germe: germ,
          produits: rows.map((row) => row.produit),
          to,
          status: result.status,
          // What this alert said: an amended report does not repeat it.
          fingerprint: fingerprints.get(germ) ?? null,
          ...(amendment ? { amendment: true } : {}),
        },
      });
    }
  } catch (error) {
    // A crash between the claim and the sends must not leave the sample
    // marked as alerted.
    await releaseClaim().catch(() => undefined);
    throw error;
  }

  if (failed.length > 0) {
    // Release the claim: the journal keeps the ECHEC rows, and the next
    // approval/resend attempts the whole batch again.
    await releaseClaim();
    return {
      ok: false as const,
      error: `Alerte de contamination non envoyée pour : ${failed.join(", ")} — à renvoyer.`,
    };
  }

  return { ok: true as const, sent };
}
