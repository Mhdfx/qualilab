import type { SampleStatus } from "@/generated/prisma/enums";
import { billedBeforeResult } from "./billing-status";

/**
 * The banners an invoice carries since the programme d'analyse
 * (PROGRAMME.md §6). An analysis is billable from its confirmed programme
 * on, so an invoice may name a sample whose results are not validated yet —
 * « Facturé avant résultat » — or one cancelled after it was billed —
 * « Échantillon annulé après facturation », a case the accountant must
 * settle (credit note or reopened invoice) — or one whose analyses changed
 * while the invoice held it — « Analyses modifiées après facturation »
 * (16/10: a family changed on the programme, F6; « Corriger les analyses »
 * at the bench, F8; an analysis not done withdrawn, C5): the invoice still
 * bills the former list.
 *
 * Pure: the invoice sheet (a client component) and the client sheet read
 * the same rule, and the tests cover it without a database.
 */

export type BilledSample = {
  id: string;
  code: string;
  controlCode: string | null;
  status: SampleStatus;
  /**
   * True while its report is reopened for amendment (AMENDEMENT.md §2): the
   * sample is back to RESULTATS_SAISIS, but its results were approved and a
   * report issued before — it was not « facturé avant résultat ».
   */
  amendmentPending?: boolean;
  /**
   * Its analyses changed while this invoice held it (`analysesChangedOn`,
   * read from the journal's `billedOn`).
   */
  analysesChanged?: boolean;
};

export type InvoiceNoticeKind = "BEFORE_RESULT" | "CANCELLED" | "ANALYSES_CHANGED";

/**
 * The journal lines that change a sample's analyses — « Corriger la fiche /
 * les analyses » and an edit of a confirmed programme. Each one written while
 * an invoice held the sample carries `billedOn: { invoiceId, number }`.
 */
export const ANALYSES_CHANGE_ACTIONS = ["SAMPLE_INTAKE_CORRECTED", "SAMPLE_PROGRAMME_UPDATED"] as const;

/** The invoice a journal line says held the sample when its analyses changed, or null. */
export function billedOnInvoice(metadata: string | null): string | null {
  try {
    const parsed = JSON.parse(metadata ?? "") as { billedOn?: { invoiceId?: unknown } } | null;
    const invoiceId = parsed?.billedOn?.invoiceId;
    return typeof invoiceId === "string" && invoiceId ? invoiceId : null;
  } catch {
    return null;
  }
}

export type InvoiceNotice = {
  kind: InvoiceNoticeKind;
  /** The references of the samples concerned, each once, in invoice order. */
  references: string[];
};

/**
 * The notice of one billed sample, or null when nothing needs saying. A
 * sample reopened for amendment had its result already: no banner.
 */
export function sampleBillingNotice(
  status: SampleStatus,
  amendmentPending = false
): InvoiceNoticeKind | null {
  if (status === "ANNULE") return "CANCELLED";
  if (billedBeforeResult(status) && !amendmentPending) return "BEFORE_RESULT";
  return null;
}

/** Every notice of one billed sample: its status's, and a change of its analyses while billed. */
export function sampleBillingNotices(sample: Pick<BilledSample, "status" | "amendmentPending" | "analysesChanged">): InvoiceNoticeKind[] {
  const kind = sampleBillingNotice(sample.status, sample.amendmentPending === true);
  return [...(kind ? [kind] : []), ...(sample.analysesChanged ? (["ANALYSES_CHANGED"] as const) : [])];
}

/** The banners of an invoice, from the samples its lines refer to. */
export function invoiceNotices(items: { sample?: BilledSample | null }[]): InvoiceNotice[] {
  const seen = new Set<string>();
  const byKind = new Map<InvoiceNoticeKind, string[]>();
  for (const item of items) {
    const sample = item.sample;
    if (!sample || seen.has(sample.id)) continue;
    seen.add(sample.id);
    for (const kind of sampleBillingNotices(sample)) {
      byKind.set(kind, [...(byKind.get(kind) ?? []), sample.controlCode ?? sample.code]);
    }
  }
  // The cases to act on come first: a cancellation, then analyses changed.
  const order: InvoiceNoticeKind[] = ["CANCELLED", "ANALYSES_CHANGED", "BEFORE_RESULT"];
  return order.flatMap((kind) => {
    const references = byKind.get(kind);
    return references ? [{ kind, references }] : [];
  });
}

export const INVOICE_NOTICE_LABELS: Record<InvoiceNoticeKind, { title: string; hint: string }> = {
  BEFORE_RESULT: {
    title: "Facturé avant résultat",
    hint: "Les analyses ont été facturées sur le programme confirmé ; leurs résultats ne sont pas encore validés.",
  },
  CANCELLED: {
    title: "Échantillon annulé après facturation",
    hint: "Une ligne facturée a été annulée : avoir à établir ou facture à rouvrir.",
  },
  ANALYSES_CHANGED: {
    title: "Analyses modifiées après facturation",
    hint: "La facture porte encore les analyses d'avant : avoir pour une analyse retirée, facture complémentaire pour une analyse ajoutée (sur un brouillon : corrigez ses lignes).",
  },
};
