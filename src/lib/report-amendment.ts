import type { SampleStatus } from "@/generated/prisma/enums";
import { formatDate } from "./labels";
import { UNSENT_REPORT_CORRECTED_IN_PLACE } from "./lab-proposals";
import { REPORT_REOPEN_ROLES } from "./sample-status";

/**
 * Amending an approved report (AMENDEMENT.md).
 *
 * The report keeps its number for life; each approval after « Rouvrir pour
 * amendement » adds one version, printed « RAP-2026-00001-A1 », « -A2 »…, with
 * a header telling the reader which report it cancels and replaces. The
 * administrator's silent correction (`/api/reports/[id]/admin-edit`) stays a
 * separate thing and never goes through here.
 */

/** Only an approved report is reopened: VALIDE (not yet sent) or RAPPORT_ENVOYE. */
export const REOPENABLE_STATUSES: readonly SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];

/** The status a reopened sample returns to: results entered, awaiting the double validation. */
export const REOPENED_STATUS: SampleStatus = "RESULTATS_SAISIS";

const AMENDMENT_SUFFIX = /-A\d+$/;

/**
 * The number printed on a version: the base number for the original
 * (version 0), « RAP-2026-00001-A1 » for the first amendment, -A2 for the
 * second… Tolerates a base that already carries a suffix (it is replaced, not
 * stacked).
 */
export function amendedNumber(base: string, version: number): string {
  if (!Number.isInteger(version) || version < 0) {
    throw new Error(`Version de rapport invalide : ${version}`);
  }
  const root = base.trim().replace(AMENDMENT_SUFFIX, "");
  return version === 0 ? root : `${root}-A${version}`;
}

/**
 * Whether this role reopens reports at all: the administrator, the Direction
 * and the technical validator (16/10, Q13 — `REPORT_REOPEN_ROLES`, the roles
 * of the state machine's way back and of `POST /api/samples/[id]/reopen`).
 */
export function reopensReports(role: string): boolean {
  return (REPORT_REOPEN_ROLES as readonly string[]).includes(role);
}

/** Those roles only, and only on an approved report. */
export function canReopen(status: SampleStatus, role: string): boolean {
  return reopensReports(role) && REOPENABLE_STATUSES.includes(status);
}

/** Said to any other role (403). */
export const REOPEN_ROLE_REFUSAL =
  "Seuls l'administrateur, la Direction et le validateur technique peuvent rouvrir un rapport pour amendement.";

/**
 * Why a report may not be reopened, in French for the 403/409 — or null when
 * it may. The reason is mandatory: it is printed on the amended report.
 */
export function reopenRefusal(input: {
  status: SampleStatus;
  role: string;
  reason: unknown;
  amendmentPending?: boolean;
}): string | null {
  if (!reopensReports(input.role)) return REOPEN_ROLE_REFUSAL;
  if (input.amendmentPending) return "Un amendement de ce rapport est déjà en cours.";
  if (!REOPENABLE_STATUSES.includes(input.status)) {
    return "Seul un rapport validé peut être rouvert pour amendement.";
  }
  if (typeof input.reason !== "string" || input.reason.trim().length < 3) {
    return "Indiquez le motif de l'amendement (au moins 3 caractères) : il sera imprimé sur le rapport amendé.";
  }
  return null;
}

/**
 * Why a sample may not be cancelled because of its report, or null. A sample
 * reopened for amendment is back to RESULTATS_SAISIS, where the state machine
 * lets the validation desks and the administrator cancel; but its report was
 * issued (and often sent and invoiced): cancelling would orphan it with an
 * amendment pending forever.
 * An issued report is corrected by amendment, never by cancelling the sample.
 */
export function cancelRefusalForReport(report: { amendmentPending: boolean } | null | undefined): string | null {
  if (!report) return null;
  return report.amendmentPending
    ? "Un amendement de ce rapport est en cours : terminez-le (validation technique puis validation administrative) au lieu d'annuler l'échantillon."
    : "Un rapport a déjà été émis pour cet échantillon : utilisez l'amendement pour le corriger.";
}

export type AmendmentHeader = {
  /** « Rapport amendé » */
  title: string;
  /** « Annule et remplace le rapport RAP-2026-00001 du 8 oct. 2026 » */
  replaces: string;
  /** « Motif de l'amendement : … », null when no note. */
  note: string | null;
};

/**
 * The mention printed at the top of an amended report (AMENDEMENT.md §2.3).
 * `previousNumber` / `previousIssuedAt` are those of the version replaced —
 * the original for A1, A1 for A2.
 */
export function amendmentHeader(input: {
  previousNumber: string;
  previousIssuedAt: Date | string;
  note?: string | null;
}): AmendmentHeader {
  const note = input.note?.trim();
  return {
    title: "Rapport amendé",
    replaces: `Annule et remplace le rapport ${input.previousNumber} du ${formatDate(input.previousIssuedAt)}`,
    note: note ? `Motif de l'amendement : ${note}` : null,
  };
}

/** One line: « Rapport amendé — annule et remplace le rapport RAP-… du … ». */
export function amendmentHeaderText(input: {
  previousNumber: string;
  previousIssuedAt: Date | string;
}): string {
  const header = amendmentHeader(input);
  return `${header.title} — ${header.replaces.charAt(0).toLowerCase()}${header.replaces.slice(1)}`;
}

/**
 * « Rouvrir pour amendement » on a version the client never received —
 * validated without being sent since 16/10 (Q92, D2): the only way back from
 * VALIDE is the amendment, and the amended version prints « Rapport amendé —
 * Annule et remplace » the version before it, so the client's first copy
 * cancels a report they never had. Said in the dialog before the reopening
 * (`sent` = `reportVersionSent`); whether a report never sent may instead be
 * reissued without an amendment is the laboratory's call (NEEDEDINFO Q132) —
 * answered on 20/11, « corriger sans amendement » (lot 5A, K11): such a
 * version is corrected before send instead (`reopenMode`), and no warning is
 * said while `UNSENT_REPORT_CORRECTED_IN_PLACE` is on.
 */
export function unsentReopenWarning(
  printedNumber: string,
  sent: boolean,
  correctedInPlace: boolean = UNSENT_REPORT_CORRECTED_IN_PLACE
): string | null {
  if (sent || correctedInPlace) return null;
  return (
    `Le client n'a jamais reçu ${printedNumber} : il recevra directement le rapport amendé, ` +
    `imprimé « Rapport amendé — Annule et remplace le rapport ${printedNumber} » et envoyé sous l'objet « Rapport amendé ».`
  );
}

// ─── Lot 5A, K11 — « Corriger avant envoi » (Q132 of 20/11) ─────────────────

/**
 * Q132 of 20/11, « Autre (corriger sans amendement : même numéro, sans
 * « annule et remplace ») »: a validated report the client never received is
 * corrected IN PLACE — the sample goes back to RESULTATS_SAISIS (both
 * validations again), the report is « en correction » (`Report.amendmentPending`
 * set, so every guard of an amendment holds: no send, no portal, no
 * conclusion edit, no cancel), and the new approval issues the SAME version
 * again: same printed number, no « Rapport amendé — Annule et remplace » of
 * its own, `Report.version` and `amendedAt` unchanged. The frozen `ReportData`
 * it replaces is kept on the version as an internal trace
 * (`ReportVersion.correctedBeforeSend`, never printed nor sent), with the
 * reason, who and when. An amendment not sent yet (« -A1 ») is corrected in
 * place too and keeps its number and its « Annule et remplace » of the
 * version that left. A report already sent is amended, as before. Behind
 * `UNSENT_REPORT_CORRECTED_IN_PLACE`.
 */

/** The correction in progress on a version: its reason, who asked for it, when. */
export type PendingCorrection = { reason: string; byId: string; byName: string | null; at: string };

/** One frozen version replaced in place by a correction before send. */
export type ReplacedVersion = {
  /** The `ReportData` it printed (JSON), as frozen at its issue. */
  data: unknown;
  issuedAt: string;
  issuedById: string | null;
  reason: string;
  correctedById: string;
  correctedByName: string | null;
  correctedAt: string;
  /** When the corrected version was issued in its place. */
  reissuedAt: string;
};

/** What `ReportVersion.correctedBeforeSend` holds. */
export type CorrectionTrace = { pending: PendingCorrection | null; replaced: ReplacedVersion[] };

const EMPTY_TRACE: CorrectionTrace = { pending: null, replaced: [] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown): string | null => (typeof value === "string" ? value : null);

/** The trace as stored; an absent or unreadable one is empty (never thrown at a reader). */
export function parseCorrectionTrace(raw: unknown): CorrectionTrace {
  const value = typeof raw === "string" ? safeJson(raw) : raw;
  if (!isRecord(value)) return EMPTY_TRACE;
  const pending = isRecord(value.pending) && str(value.pending.reason) && str(value.pending.byId) && str(value.pending.at)
    ? {
        reason: str(value.pending.reason)!,
        byId: str(value.pending.byId)!,
        byName: str(value.pending.byName),
        at: str(value.pending.at)!,
      }
    : null;
  const replaced = Array.isArray(value.replaced)
    ? value.replaced.filter(isRecord).flatMap((row): ReplacedVersion[] => {
        const issuedAt = str(row.issuedAt);
        const reason = str(row.reason);
        const correctedById = str(row.correctedById);
        const correctedAt = str(row.correctedAt);
        const reissuedAt = str(row.reissuedAt);
        if (!issuedAt || !reason || !correctedById || !correctedAt || !reissuedAt || row.data === undefined) return [];
        return [
          {
            data: row.data,
            issuedAt,
            issuedById: str(row.issuedById),
            reason,
            correctedById,
            correctedByName: str(row.correctedByName),
            correctedAt,
            reissuedAt,
          },
        ];
      })
    : [];
  return { pending, replaced };
}

function safeJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** Whether the version carries a correction in progress — what the approval reads to reissue in place. */
export function correctionPending(raw: unknown): boolean {
  return parseCorrectionTrace(raw).pending !== null;
}

/** The trace once « Corriger avant envoi » is asked: the previous corrections kept. */
export function traceWithPending(raw: unknown, pending: PendingCorrection): CorrectionTrace {
  return { ...parseCorrectionTrace(raw), pending };
}

/**
 * The trace once the corrected version is issued in place: the frozen data
 * replaced appended with the pending correction's reason, author and date;
 * nothing pending any more. Null when no correction was pending.
 */
export function traceWithReissue(
  raw: unknown,
  replaced: { data: unknown; issuedAt: Date | string; issuedById: string | null },
  reissuedAt: Date | string
): CorrectionTrace | null {
  const trace = parseCorrectionTrace(raw);
  if (!trace.pending) return null;
  const iso = (date: Date | string) => (typeof date === "string" ? date : date.toISOString());
  return {
    pending: null,
    replaced: [
      ...trace.replaced,
      {
        data: replaced.data,
        issuedAt: iso(replaced.issuedAt),
        issuedById: replaced.issuedById,
        reason: trace.pending.reason,
        correctedById: trace.pending.byId,
        correctedByName: trace.pending.byName,
        correctedAt: trace.pending.at,
        reissuedAt: iso(reissuedAt),
      },
    ],
  };
}

/**
 * The in-force version's trace, for `versionIssuedAt`: the latest frozen
 * version of the report (the one `Report.version` names) with its trace.
 */
export const IN_FORCE_VERSION_TRACE_SELECT = {
  version: true,
  amendedAt: true,
  versions: { select: { version: true, correctedBeforeSend: true }, orderBy: { version: "desc" }, take: 1 },
} as const;

/**
 * When the version of the report in force was last issued — what « an alert
 * left for this version » is compared with (`alertNotSentForVersion`, K7):
 * its latest reissue after « Corriger avant envoi » (K11 — `amendedAt`
 * never moves then: review of lot 5A), else `Report.amendedAt` (an
 * amendment), else null (the first issue, never corrected). A trace read
 * on another version than the one in force is ignored.
 */
export function versionIssuedAt(
  report:
    | {
        version: number;
        amendedAt: Date | string | null;
        versions?: readonly { version: number; correctedBeforeSend: unknown }[];
      }
    | null
    | undefined
): Date | null {
  if (!report) return null;
  const inForce = report.versions?.find((version) => version.version === report.version);
  const reissued = inForce ? parseCorrectionTrace(inForce.correctedBeforeSend).replaced.map((row) => row.reissuedAt) : [];
  const times = [report.amendedAt, ...reissued]
    .filter((time): time is Date | string => time !== null)
    .map((time) => new Date(time))
    .filter((time) => !Number.isNaN(time.getTime()));
  if (times.length === 0) return null;
  return times.reduce((latest, time) => (time.getTime() > latest.getTime() ? time : latest));
}

/** The data of the version last replaced in place (for the alerts: what had been judged), or null. */
export function lastReplacedData(raw: unknown): unknown {
  const trace = parseCorrectionTrace(raw);
  return trace.replaced.length > 0 ? trace.replaced[trace.replaced.length - 1].data : null;
}

/**
 * Which way back an approved report takes: « Corriger avant envoi » for a
 * version the client never received while the switch is on, else
 * « Rouvrir pour amendement ». `sent` = `reportVersionSent`; `enabled` is the
 * switch, passed by the tests.
 */
export function reopenMode(sent: boolean, enabled: boolean = UNSENT_REPORT_CORRECTED_IN_PLACE): "correct" | "amend" {
  return enabled && !sent ? "correct" : "amend";
}

/**
 * What a pending change of the report is, for the screens: a correction
 * before send — `amendmentPending` on a version the client never received,
 * which only « Corriger avant envoi » starts while the switch is on —, an
 * amendment, or nothing. The approval itself decides on the version's trace
 * (`correctionPending`); an amendment of an unsent version started before
 * lot 5A would read « correction » here and still be issued as an amendment
 * (none on the production at the deployment: DEPLOY.md « Lot 5A »).
 */
export function pendingReportChange(
  amendmentPending: boolean,
  sent: boolean,
  enabled: boolean = UNSENT_REPORT_CORRECTED_IN_PLACE
): "correction" | "amendment" | null {
  if (!amendmentPending) return null;
  return enabled && !sent ? "correction" : "amendment";
}

/** « Correction avant envoi en cours … » — the notice of a correction in progress. */
export function pendingCorrectionText(printedNumber: string): string {
  return `Correction avant envoi en cours : le rapport ${printedNumber} sera émis de nouveau sous le même numéro, sans « annule et remplace », à la nouvelle validation administrative.`;
}

/** Said when the wrong verb reaches the server for this version. */
export const CORRECTION_MESSAGES = {
  useCorrection:
    "Ce rapport n'a jamais été envoyé au client : corrigez-le avant envoi (même numéro, sans « annule et remplace »).",
  useAmendment: "Ce rapport a déjà été envoyé au client : seul un amendement peut le corriger.",
  notValidated: "Seul un rapport validé et pas encore envoyé peut être corrigé avant envoi.",
  reason: "Indiquez le motif de la correction (au moins 3 caractères) : il reste dans la trace interne du rapport.",
  pending: "Une correction ou un amendement de ce rapport est déjà en cours.",
  disabled: "La correction avant envoi n'est pas ouverte : utilisez « Rouvrir pour amendement ».",
  sentMeanwhile: "Le rapport vient d'être envoyé au client : rechargez la page — seul un amendement peut désormais le corriger.",
} as const;

/**
 * Why « Corriger avant envoi » is refused, in French for the 403/409, or null
 * when it may go ahead: the roles of the amendment, a validated version the
 * client never received (status VALIDE, `sent` false), nothing pending, a
 * reason of at least 3 characters (internal: never printed).
 */
export function correctionRefusal(
  input: { status: SampleStatus; role: string; reason: unknown; sent: boolean; amendmentPending: boolean },
  enabled: boolean = UNSENT_REPORT_CORRECTED_IN_PLACE
): string | null {
  if (!enabled) return CORRECTION_MESSAGES.disabled;
  if (!reopensReports(input.role)) return REOPEN_ROLE_REFUSAL;
  if (input.amendmentPending) return CORRECTION_MESSAGES.pending;
  if (input.sent) return CORRECTION_MESSAGES.useAmendment;
  if (input.status !== "VALIDE") return CORRECTION_MESSAGES.notValidated;
  if (typeof input.reason !== "string" || input.reason.trim().length < 3) return CORRECTION_MESSAGES.reason;
  return null;
}

/** The email subject of an amended report sent to the client. */
export function amendedReportSubject(printedNumber: string): string {
  return `Rapport amendé ${printedNumber}`;
}

/** « DUPLICATA — édité le 8 oct. 2026 », head and foot of a duplicate PDF (AMENDEMENT.md §3). */
export function duplicataMention(editedAt: Date | string): string {
  return `DUPLICATA — édité le ${formatDate(editedAt)}`;
}

/** Marks a frozen version that is no longer the current one. */
export function supersededMention(currentNumber: string): string {
  return `Version remplacée par ${currentNumber}`;
}

/** « Version reconstituée » — version 0 rebuilt at the first amendment. */
export const RECONSTRUCTED_LABEL = "Version reconstituée";
