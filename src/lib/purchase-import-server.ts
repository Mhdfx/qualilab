import "server-only";
import { prisma } from "./prisma";
import { toMoney } from "./money";
import { isoDayOf, parseIsoDay } from "./date-only";
import { headerKey } from "./stock-import";
import { purchaseInvoiceData } from "./purchase-invoices-server";
import {
  REFUSAL_LABELS,
  WARNING_LABELS,
  importedFromValue,
  invoiceNumberKey,
  planPurchaseJournal,
  type ExistingInvoice,
  type ExistingSupplier,
  type ImportedInvoice,
  type PurchaseJournal,
  type PurchaseJournalPlan,
} from "./purchase-import";
import type { WithholdingSettings } from "./withholding";

/**
 * Lot 6B, M16 (RETOUR-LABO-25-11.md §6) — the purchase journal against the
 * database: the suppliers known by their name, the invoices a previous import
 * wrote (by `importKey`, whatever the supplier is called now), the invoices
 * already there (supplier + number), and the writing of the plan. The
 * decisions are `planPurchaseJournal`'s (pure, tested); this module only
 * reads and writes.
 */

const SUPPLIER_CHUNK = 500;
const KEY_CHUNK = 1_000;
/** Invoices per `createMany` (relecture du lot 6: one insert per invoice took ≈ 9 s for 500). */
const INSERT_CHUNK = 500;

export async function purchasePlanFromDatabase(
  journal: PurchaseJournal,
  context: { today: string; settings: WithholdingSettings }
): Promise<PurchaseJournalPlan> {
  const wanted = new Set(journal.drafts.map((draft) => draft.supplierKey));
  const rows = await prisma.supplier.findMany({
    select: {
      id: true,
      name: true,
      archived: true,
      paymentTermDays: true,
      withholdingSubject: true,
      taxCertificateDate: true,
      taxCertificateValidUntil: true,
    },
    orderBy: [{ archived: "asc" }, { createdAt: "asc" }],
  });
  // By the name's key; an active supplier wins over an archived one of the same key.
  const suppliers = new Map<string, ExistingSupplier>();
  const suppliersById = new Map<string, ExistingSupplier>();
  for (const row of rows) {
    suppliersById.set(row.id, row);
    const key = headerKey(row.name);
    if (wanted.has(key) && !suppliers.has(key)) suppliers.set(key, row);
  }

  // The invoices of the file a previous import wrote: by their key, whatever their supplier's name is now.
  const keys = [...new Set(journal.drafts.flatMap((draft) => [draft.importKey, draft.printKey]))];
  const imported = new Map<string, ImportedInvoice>();
  for (let i = 0; i < keys.length; i += KEY_CHUNK) {
    const found = await prisma.purchaseInvoice.findMany({
      where: { importKey: { in: keys.slice(i, i + KEY_CHUNK) } },
      select: { importKey: true, supplierId: true, number: true, issueDate: true, amount: true, supplier: { select: { name: true } } },
    });
    for (const invoice of found) {
      if (!invoice.importKey) continue;
      imported.set(invoice.importKey, {
        supplierId: invoice.supplierId,
        supplierName: invoice.supplier.name,
        number: invoice.number,
        issueDay: isoDayOf(invoice.issueDate),
        amount: toMoney(invoice.amount),
      });
    }
  }

  const ids = [...new Set([...[...suppliers.values()].map((supplier) => supplier.id), ...[...imported.values()].map((invoice) => invoice.supplierId)])];
  const invoices = new Map<string, ExistingInvoice>();
  for (let i = 0; i < ids.length; i += SUPPLIER_CHUNK) {
    const found = await prisma.purchaseInvoice.findMany({
      where: { supplierId: { in: ids.slice(i, i + SUPPLIER_CHUNK) } },
      select: { supplierId: true, number: true, issueDate: true, amount: true, status: true },
    });
    for (const invoice of found) {
      invoices.set(`${invoice.supplierId}|${invoiceNumberKey(invoice.number)}`, {
        issueDay: isoDayOf(invoice.issueDate),
        amount: toMoney(invoice.amount),
        status: invoice.status,
      });
    }
  }

  return planPurchaseJournal(journal, { today: context.today, suppliers, suppliersById, invoices, imported, settings: context.settings });
}

/** Whether a commit of the plan writes anything. */
export const purchasePlanWrites = (plan: PurchaseJournalPlan) => plan.invoices.length > 0;

/**
 * Writes the plan in one transaction: the suppliers to create, then the
 * invoices by batches of `INSERT_CHUNK` (`createMany`, each with its
 * `importKey`), then their payments, attached through the ids read back by
 * those keys. A supplier or an invoice created meanwhile by someone else
 * makes the transaction fail on its unique key (P2002) — the route answers
 * 409 and nothing is written; the next analysis skips what exists.
 */
export async function writePurchasePlan(
  plan: PurchaseJournalPlan,
  context: { actorId: string; fileName: string; today: string }
): Promise<{ suppliersCreated: number; invoices: number; payments: number }> {
  const importedFrom = importedFromValue(context.today, context.fileName);
  return prisma.$transaction(
    async (tx) => {
      const created = new Map<string, string>();
      for (const supplier of plan.suppliersToCreate) {
        const row = await tx.supplier.create({ data: { name: supplier.name, paymentTermDays: supplier.paymentTermDays }, select: { id: true } });
        created.set(supplier.key, row.id);
      }
      let payments = 0;
      for (let i = 0; i < plan.invoices.length; i += INSERT_CHUNK) {
        const chunk = plan.invoices.slice(i, i + INSERT_CHUNK);
        await tx.purchaseInvoice.createMany({
          data: chunk.map((invoice) => {
            const { draft } = invoice;
            return {
              supplierId: invoice.supplierId ?? (created.get(draft.supplierKey) as string),
              ...purchaseInvoiceData(draft.invoice, invoice.withholding),
              dueDate: parseIsoDay(invoice.dueDay) as Date,
              status: draft.status,
              paidAt: draft.paidAt ? parseIsoDay(draft.paidAt) : null,
              paymentMethod: draft.status === "PAYEE" ? draft.paymentMethod : null,
              paymentReference: draft.status === "PAYEE" ? draft.paymentReference : null,
              createdById: context.actorId,
              importedFrom,
              importKey: draft.importKey,
            };
          }),
        });
        const withPayments = chunk.filter((invoice) => invoice.draft.payments.length > 0);
        if (withPayments.length === 0) continue;
        const ids = new Map(
          (
            await tx.purchaseInvoice.findMany({
              where: { importKey: { in: withPayments.map((invoice) => invoice.draft.importKey) } },
              select: { id: true, importKey: true },
            })
          ).map((row) => [row.importKey, row.id])
        );
        const rows = withPayments.flatMap(({ draft }) =>
          draft.payments.map((payment) => ({
            invoiceId: ids.get(draft.importKey) as string,
            paidOn: parseIsoDay(payment.day) as Date,
            amount: payment.amount,
            method: draft.paymentMethod ?? "AUTRE",
            reference: draft.paymentReference,
            createdById: context.actorId,
          }))
        );
        if (rows.some((row) => !row.invoiceId)) throw new Error("Facture importée introuvable par sa clé — import annulé.");
        await tx.purchasePayment.createMany({ data: rows });
        payments += rows.length;
      }
      return { suppliersCreated: created.size, invoices: plan.invoices.length, payments };
    },
    { timeout: 60_000, maxWait: 10_000 }
  );
}

/** The plan as the screen reads it (plain JSON; days « AAAA-MM-JJ »). */
export function purchasePlanReport(journal: PurchaseJournal, plan: PurchaseJournalPlan, today: string) {
  const supplierName = (key: string, fallback: string) => journal.suppliers.get(key)?.name ?? fallback;
  return {
    rows: journal.rows,
    templateRows: journal.templateRows,
    suppliers: {
      toCreate: plan.suppliersToCreate.map((supplier) => ({ name: supplier.name, paymentTermDays: supplier.paymentTermDays, rows: supplier.rows })),
      matched: plan.suppliersMatched,
    },
    totals: plan.totals,
    invoices: plan.invoices.map(({ draft, supplierId, dueDay, withholding }) => ({
      line: draft.line,
      supplier: supplierName(draft.supplierKey, draft.supplierName),
      newSupplier: supplierId === null,
      number: draft.invoice.number,
      generatedNumber: draft.generatedNumber,
      issueDay: isoDayOf(draft.invoice.issueDate),
      dueDay,
      amountHT: draft.invoice.amountHT,
      vatAmount: draft.invoice.vatAmount,
      amount: draft.invoice.amount,
      currency: draft.invoice.currency,
      amountForeign: draft.invoice.amountForeign,
      status: draft.status,
      late: draft.status === "A_PAYER" && dueDay < today,
      payments: draft.payments.length,
      paidAt: draft.paidAt,
      paymentMethod: draft.paymentMethod,
      paymentReference: draft.paymentReference,
      withholdingAmount: withholding.amount,
    })),
    existing: plan.existing,
    conflicts: journal.conflicts,
    refused: plan.refused,
    warnings: plan.warnings,
    labels: { refused: REFUSAL_LABELS, warnings: WARNING_LABELS },
  };
}
