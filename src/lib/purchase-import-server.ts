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
  type PurchaseJournal,
  type PurchaseJournalPlan,
} from "./purchase-import";
import type { WithholdingSettings } from "./withholding";

/**
 * Lot 6B, M16 (RETOUR-LABO-25-11.md §6) — the purchase journal against the
 * database: the suppliers known by their name, the invoices already there
 * (supplier + number), and the writing of the plan. The decisions are
 * `planPurchaseJournal`'s (pure, tested); this module only reads and writes.
 */

const SUPPLIER_CHUNK = 500;

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
  for (const row of rows) {
    const key = headerKey(row.name);
    if (wanted.has(key) && !suppliers.has(key)) suppliers.set(key, row);
  }

  const ids = [...new Set([...suppliers.values()].map((supplier) => supplier.id))];
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

  return planPurchaseJournal(journal, { today: context.today, suppliers, invoices, settings: context.settings });
}

/** Whether a commit of the plan writes anything. */
export const purchasePlanWrites = (plan: PurchaseJournalPlan) => plan.invoices.length > 0;

/**
 * Writes the plan in one transaction: the suppliers to create, then each
 * invoice with its payments (`importedFrom` = the day and the file). A
 * supplier or an invoice created meanwhile by someone else makes the
 * transaction fail on its unique key (P2002) — the route answers 409 and
 * nothing is written; the next analysis skips what exists.
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
      for (const invoice of plan.invoices) {
        const supplierId = invoice.supplierId ?? (created.get(invoice.draft.supplierKey) as string);
        const { draft } = invoice;
        await tx.purchaseInvoice.create({
          data: {
            supplierId,
            ...purchaseInvoiceData(draft.invoice, invoice.withholding),
            dueDate: parseIsoDay(invoice.dueDay) as Date,
            status: draft.status,
            paidAt: draft.paidAt ? parseIsoDay(draft.paidAt) : null,
            paymentMethod: draft.status === "PAYEE" ? draft.paymentMethod : null,
            paymentReference: draft.status === "PAYEE" ? draft.paymentReference : null,
            createdById: context.actorId,
            importedFrom,
            payments: draft.payments.length
              ? {
                  create: draft.payments.map((payment) => ({
                    paidOn: parseIsoDay(payment.day) as Date,
                    amount: payment.amount,
                    method: draft.paymentMethod ?? "AUTRE",
                    reference: draft.paymentReference,
                    createdById: context.actorId,
                  })),
                }
              : undefined,
          },
          select: { id: true },
        });
        payments += draft.payments.length;
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
