import type { SampleStatus } from "@/generated/prisma/enums";
import { formatDate } from "./labels";

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

/** Only the administrator reopens, and only an approved report. */
export function canReopen(status: SampleStatus, role: string): boolean {
  return role === "ADMIN" && REOPENABLE_STATUSES.includes(status);
}

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
  if (input.role !== "ADMIN") return "Seul l'administrateur peut rouvrir un rapport pour amendement.";
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
 * lets an administrator cancel; but its report was issued (and often sent and
 * invoiced): cancelling would orphan it with an amendment pending forever.
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
