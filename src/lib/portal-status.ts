import type { SampleStatus } from "@/generated/prisma/enums";

/**
 * What a client sees of a sample on the portal (PORTAIL.md §2).
 *
 * Four states only. The laboratory's internal steps — programme, bench,
 * double validation — are never shown: until the report is sent, a sample
 * is « En analyse », and nothing of its results leaves the laboratory. A
 * sample reopened for amendment goes back to « En analyse » until the
 * amended report is sent.
 */
export type PortalStage = "RECU" | "EN_ANALYSE" | "RAPPORT_DISPONIBLE" | "ANNULE";

export const PORTAL_STAGES: readonly PortalStage[] = ["RECU", "EN_ANALYSE", "RAPPORT_DISPONIBLE", "ANNULE"];

export const PORTAL_STAGE_LABELS: Record<PortalStage, string> = {
  RECU: "Reçu",
  EN_ANALYSE: "En analyse",
  RAPPORT_DISPONIBLE: "Rapport disponible",
  ANNULE: "Annulé",
};

/**
 * Every sample status, mapped. PRELEVE (sampled by the laboratory, on its way
 * to reception) already reads « Reçu » for the client: the laboratory has it.
 */
const STAGE_OF: Record<SampleStatus, PortalStage> = {
  PRELEVE: "RECU",
  RECU: "RECU",
  PROGRAMME: "EN_ANALYSE",
  EN_ANALYSE: "EN_ANALYSE",
  RESULTATS_SAISIS: "EN_ANALYSE",
  VALIDE: "EN_ANALYSE",
  RAPPORT_ENVOYE: "RAPPORT_DISPONIBLE",
  ANNULE: "ANNULE",
};

export function portalStage(status: SampleStatus): PortalStage {
  return STAGE_OF[status];
}

/** The sample statuses behind a portal state — the `where: { status: { in } }` of the list filter. */
export function portalStageFilter(stage: PortalStage): SampleStatus[] {
  return (Object.keys(STAGE_OF) as SampleStatus[]).filter((status) => STAGE_OF[status] === stage);
}

export function isPortalStage(value: unknown): value is PortalStage {
  return typeof value === "string" && (PORTAL_STAGES as readonly string[]).includes(value);
}

/** The only status whose report a client may download (PORTAIL.md §2). */
export function reportAvailableOnPortal(status: SampleStatus): boolean {
  return status === "RAPPORT_ENVOYE";
}

/** The report exists in no sendable form yet (still at the laboratory, or being amended). */
export const PORTAL_REPORT_NOT_YET = "Le rapport de cet échantillon n'est pas encore disponible.";

/**
 * Why the portal refuses a sample's report — or null when it is served. A
 * cancelled sample will never have one: « pas encore » would promise it.
 * A report reopened for amendment waits for the amended one to be sent.
 */
export function portalReportRefusal(
  status: SampleStatus,
  report: { amendmentPending: boolean } | null
): string | null {
  if (status === "ANNULE") return "Cet échantillon a été annulé : aucun rapport ne sera émis.";
  if (!reportAvailableOnPortal(status) || !report || report.amendmentPending) return PORTAL_REPORT_NOT_YET;
  return null;
}

