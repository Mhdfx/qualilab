import type { SampleStatus } from "@/generated/prisma/enums";
import type { HeldInvoice } from "@/lib/billing";
import { BILLABLE_STATUSES } from "@/lib/billing-status";
import type { Role } from "@/lib/roles";
import { verbsFor } from "@/lib/sample-verbs";
import type { VerbSample } from "@/components/samples/sample-verbs-logic";
import type { ReceivedLine, ReceptionLineData } from "./SerieReceptionForm";

/**
 * What the verbs of the reception of a série (« Corriger la fiche »,
 * « Annuler », « Réactiver ») need beyond the série's own lines — the facts
 * /validation/[id] and /programmation/[id] read for their one sample (16/10,
 * D1): the invoice holding it (`heldInvoices`), the contamination alert
 * already sent, an issued report. With them « Annuler » names the invoice
 * (« Déjà facturé (FAC-…) : sa ligne reste sur la facture… ») and the alert,
 * as those pages do, instead of the neutral « s'il est déjà facturé… ».
 *
 * Pure, so the shaping is tested: the page reads the alert and the report
 * with the série (its one query) and the invoices of all its samples in one
 * `heldInvoices` call — never a query per sample.
 */

/**
 * Whether this person's verbs on a sample at this step say what an invoice
 * or an alert leaves: a billable sample (from the programme — before it,
 * nothing is billed) that they may cancel, or whose analyses they may
 * change (« Corriger les analyses » warns while an invoice holds it). On
 * this page that is the administrator; the réception never cancels nor
 * changes the analyses of programmed work (16/10, Q13 / Q128), so the
 * invoice and the alert are neither read nor sent to its screen.
 */
export function verbsReadBilling(status: SampleStatus, role: Role): boolean {
  if (!BILLABLE_STATUSES.includes(status)) return false;
  const verbs = verbsFor({ status }, role);
  return verbs.cancel || verbs.correctAnalyses;
}

/** The samples whose invoice `heldInvoices` reads, in one call; empty = no query. */
export function invoiceReadIds(samples: readonly { id: string; status: SampleStatus }[], role: Role): string[] {
  return samples.filter((s) => verbsReadBilling(s.status, role)).map((s) => s.id);
}

/** What the verbs read of one sample, as the screen receives it. */
export type ReceptionVerbFacts = {
  /** A report was issued (reopened for amendment): corrected by the amendment, never cancelled. */
  hasReport: boolean;
  /** The invoice holding it — its number, null for a draft; null = on no invoice. Absent = not read for this person. */
  invoiced?: { number: string | null } | null;
  /** When a contamination alert left for it (ISO); null = none. Absent = not read for this person. */
  alertsSentAt?: string | null;
};

/**
 * The série's lines with the verbs' facts: the report reduced to whether
 * one exists; the invoice (from `held`) and the alert's date only where
 * `verbsReadBilling` — elsewhere the alert's date, selected with the série,
 * does not leave the server.
 */
export function withVerbFacts<T extends { id: string; status: SampleStatus; alertsSentAt: Date | null; report: { id: string } | null }>(
  samples: readonly T[],
  held: ReadonlyMap<string, Pick<HeldInvoice, "number">>,
  role: Role
): (Omit<T, "alertsSentAt" | "report"> & ReceptionVerbFacts)[] {
  return samples.map(({ alertsSentAt, report, ...line }) => {
    const facts: ReceptionVerbFacts = { hasReport: report !== null };
    if (verbsReadBilling(line.status, role)) {
      const invoice = held.get(line.id);
      facts.invoiced = invoice ? { number: invoice.number } : null;
      facts.alertsSentAt = alertsSentAt?.toISOString() ?? null;
    }
    return { ...line, ...facts };
  });
}

/**
 * A line of the summary read from the page's data: a série already
 * received, or one just received and read again (« Annuler » and « Corriger
 * la fiche » refresh the page). It carries the sample's status and cancel
 * reason: the summary reads them on the line while `justReceived` holds, so
 * a sample cancelled there shows « Annulé · motif », leaves the label count
 * and gives its verbs its own step (« Réactiver », a PROGRAMME line's invoice)
 * — never the RECU assumed right after the reception.
 */
export function summaryLineOf(s: ReceptionLineData): ReceivedLine {
  return {
    id: s.id,
    code: s.code,
    lineNumber: s.lineNumber,
    controlCode: s.controlCode,
    unitCount: s.unitCount,
    conformity: s.conformity,
    conformityReason: s.conformityReason,
    receptionNote: s.receptionNote ?? null,
    analysisBlocked: s.analysisBlocked ?? false,
    awaitingClientSince: s.awaitingClientSince ?? null,
    status: s.status,
    cancelReason: s.cancelReason ?? null,
    produit: s.produit,
    surfaceLabel: s.surfaceLabel,
    surfaceState: s.surfaceState ?? null,
    airMethod: s.airMethod ?? null,
    personName: s.personName,
    nature: { label: s.nature.label },
    technician: s.technician,
    assignedAt: s.assignedAt ?? null,
  };
}

/**
 * What the verbs need of a line, as the page serialised it. `status`
 * overrides the line's own (a série just received: its samples are RECU
 * before the page is read again).
 */
export function verbSampleOf(line: ReceptionLineData, clientId: string, status: SampleStatus = line.status): VerbSample {
  return {
    clientId,
    productTypeId: line.productType?.id ?? null,
    productTypeName: line.productType?.name ?? null,
    id: line.id,
    code: line.code,
    controlCode: line.controlCode,
    status,
    hasReport: line.hasReport,
    type: line.type,
    lineKind: line.lineKind,
    produit: line.produit,
    lieu: line.lieu,
    numeroLot: line.numeroLot,
    productionDate: line.productionDate,
    expiryDate: line.expiryDate,
    quantity: line.quantity,
    quantityUnit: line.quantityUnit,
    productTemperature: line.productTemperature,
    ambientTemperature: line.ambientTemperature,
    surfaceLabel: line.surfaceLabel,
    surfaceAreaCm2: line.surfaceAreaCm2,
    surfaceAreaNote: line.surfaceAreaNote,
    personName: line.personName,
    personRole: line.personRole,
    handsState: line.handsState,
    // « État de la surface » / « Méthode de prélèvement » in « Corriger la fiche ».
    surfaceState: line.surfaceState ?? null,
    airMethod: line.airMethod ?? null,
    airExposureMin: line.airExposureMin,
    remarks: line.remarks,
    unitCount: line.unitCount,
    parameterIds: line.parameters.map((p) => p.parameter.id),
    // « Annuler » and « Corriger les analyses » name the invoice and the alert
    // (D1); absent when not read, and they then say what holds whatever the case.
    ...(line.invoiced !== undefined ? { invoiced: line.invoiced } : {}),
    ...(line.alertsSentAt !== undefined ? { alertsSentAt: line.alertsSentAt } : {}),
  };
}
