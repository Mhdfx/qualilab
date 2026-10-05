import type { SampleStatus } from "@/generated/prisma/enums";
import { billedBeforeResult } from "./billing-status";

/**
 * The banners an invoice carries since the programme d'analyse
 * (PROGRAMME.md §6). An analysis is billable from its confirmed programme
 * on, so an invoice may name a sample whose results are not validated yet —
 * « Facturé avant résultat » — or one cancelled after it was billed —
 * « Échantillon annulé après facturation », a case the accountant must
 * settle (credit note or reopened invoice).
 *
 * Pure: the invoice sheet (a client component) and the client sheet read
 * the same rule, and the tests cover it without a database.
 */

export type BilledSample = {
  id: string;
  code: string;
  controlCode: string | null;
  status: SampleStatus;
};

export type InvoiceNoticeKind = "BEFORE_RESULT" | "CANCELLED";

export type InvoiceNotice = {
  kind: InvoiceNoticeKind;
  /** The references of the samples concerned, each once, in invoice order. */
  references: string[];
};

/** The notice of one billed sample, or null when nothing needs saying. */
export function sampleBillingNotice(status: SampleStatus): InvoiceNoticeKind | null {
  if (status === "ANNULE") return "CANCELLED";
  if (billedBeforeResult(status)) return "BEFORE_RESULT";
  return null;
}

/** The banners of an invoice, from the samples its lines refer to. */
export function invoiceNotices(items: { sample?: BilledSample | null }[]): InvoiceNotice[] {
  const seen = new Set<string>();
  const byKind = new Map<InvoiceNoticeKind, string[]>();
  for (const item of items) {
    const sample = item.sample;
    if (!sample || seen.has(sample.id)) continue;
    seen.add(sample.id);
    const kind = sampleBillingNotice(sample.status);
    if (!kind) continue;
    byKind.set(kind, [...(byKind.get(kind) ?? []), sample.controlCode ?? sample.code]);
  }
  // The cancellation is the case to act on: it comes first.
  const order: InvoiceNoticeKind[] = ["CANCELLED", "BEFORE_RESULT"];
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
};
