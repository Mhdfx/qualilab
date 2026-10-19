import "server-only";
import { holdingInvoiceItemWhere, type HeldInvoice } from "./billing";
import { ANALYSES_CHANGE_ACTIONS, billedOnInvoice } from "./invoice-notices";
import { prisma } from "./prisma";

/**
 * Which invoice holds a sample, and whether its analyses changed while one
 * did — the reads behind « Échantillon déjà facturé » on the correction
 * screens and « Analyses modifiées après facturation » on the invoice and
 * the client sheet (16/10: F6, F8 and C5 change analyses after the
 * programme, from which a sample is billable). The rules are pure, in
 * `billing.ts` and `invoice-notices.ts`.
 */

/** The invoice holding each of these samples — a draft or an issued invoice — when one does. */
export async function heldInvoices(sampleIds: readonly string[]): Promise<Map<string, HeldInvoice>> {
  if (sampleIds.length === 0) return new Map();
  const items = await prisma.invoiceItem.findMany({
    where: { sampleId: { in: [...sampleIds] }, ...holdingInvoiceItemWhere() },
    select: { sampleId: true, invoice: { select: { id: true, number: true } } },
  });
  const held = new Map<string, HeldInvoice>();
  for (const item of items) {
    if (item.sampleId && !held.has(item.sampleId)) held.set(item.sampleId, { invoiceId: item.invoice.id, number: item.invoice.number });
  }
  return held;
}

/**
 * Of these samples, those whose analyses changed while the given invoice held
 * them: a journal line of `ANALYSES_CHANGE_ACTIONS` whose `billedOn` names
 * that invoice. An invoice cancelled since, and the samples billed again on a
 * new one, are not concerned — the change came before the new lines.
 */
export async function analysesChangedWhileHeld(held: readonly { sampleId: string; invoiceId: string }[]): Promise<Set<string>> {
  if (held.length === 0) return new Set();
  const invoiceOf = new Map(held.map((h) => [h.sampleId, h.invoiceId]));
  const lines = await prisma.auditLog.findMany({
    where: {
      entity: "Sample",
      entityId: { in: [...invoiceOf.keys()] },
      action: { in: [...ANALYSES_CHANGE_ACTIONS] },
      metadata: { contains: '"billedOn"' },
    },
    select: { entityId: true, metadata: true },
  });
  const changed = new Set<string>();
  for (const line of lines) {
    if (line.entityId && billedOnInvoice(line.metadata) === invoiceOf.get(line.entityId)) changed.add(line.entityId);
  }
  return changed;
}
