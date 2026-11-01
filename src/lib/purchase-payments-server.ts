import "server-only";
import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { logAudit } from "./audit";
import { toMoney } from "./money";
import { isoDayOf } from "./date-only";
import { labDayOf } from "./lab-time";
import { validatePurchasePayment } from "./achat-validation";
import { loadAchatSettings } from "./achat-settings";
import { paymentAmountError, paymentCertificateRefusal, purchaseBalance } from "./purchase-invoice";
import { PURCHASE_PARTIAL_PAYMENTS } from "./lab-proposals";
import { PURCHASE_INVOICE_INCLUDE, invoiceCertificate, purchaseInvoiceView } from "./purchase-invoices-server";

/**
 * Paying a supplier invoice (lot 3D, RETOUR-LABO-28-10.md M1, M6): a payment
 * on the day chosen, with its method and reference — the whole remaining
 * amount, or part of it (`PURCHASE_PARTIAL_PAYMENTS`). Every write locks
 * the invoice's row first (`SELECT … FOR UPDATE`): two payments racing, or
 * a payment racing a correction, run one after the other and the second
 * reads what the first wrote — never a double payment.
 */

/** Locks the invoice's row for the rest of the transaction. */
export async function lockPurchaseInvoice(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT \`id\` FROM \`PurchaseInvoice\` WHERE \`id\` = ${id} FOR UPDATE`;
}

const optional = (value: unknown) => (value === null || value === undefined ? null : toMoney(value as string));

class Refusal extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

/** Records one payment; answers the invoice as the screens read it. */
export async function recordPurchasePayment(id: string, input: Record<string, unknown>, actorId: string) {
  const invoice = await prisma.purchaseInvoice.findUnique({ where: { id }, include: PURCHASE_INVOICE_INCLUDE });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  if (invoice.status !== "A_PAYER") {
    return NextResponse.json(
      { error: invoice.status === "PAYEE" ? "Cette facture est déjà payée." : "Cette facture a été annulée." },
      { status: 409 }
    );
  }

  const now = new Date();
  const validated = validatePurchasePayment(input, { today: labDayOf(now), issueDay: isoDayOf(invoice.issueDate) });
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });

  const settings = await loadAchatSettings();
  const months = settings.withholding.certificateValidityMonths;
  const certificate = invoiceCertificate(invoice, months);
  const certificateRefusal = paymentCertificateRefusal(certificate);
  if (certificateRefusal) return NextResponse.json({ error: certificateRefusal }, { status: 400 });

  let outcome: { amount: number; settled: boolean; remainingAfter: number };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      await lockPurchaseInvoice(tx, id);
      const current = await tx.purchaseInvoice.findUnique({
        where: { id },
        select: { status: true, amount: true, withholdingAmount: true, payments: { select: { amount: true } } },
      });
      if (!current || current.status !== "A_PAYER") throw new Refusal("Cette facture n'est plus à payer.", 409);
      const { remaining } = purchaseBalance({
        status: "A_PAYER",
        amount: toMoney(current.amount),
        withholdingAmount: optional(current.withholdingAmount),
        payments: current.payments.map((payment) => toMoney(payment.amount)),
      });
      const amount = validated.value.amount ?? remaining;
      const refusal = paymentAmountError(amount, remaining, PURCHASE_PARTIAL_PAYMENTS);
      if (refusal) throw new Refusal(refusal, 400);

      await tx.purchasePayment.create({
        data: {
          invoiceId: id,
          paidOn: validated.value.paidOn,
          amount,
          method: validated.value.method,
          reference: validated.value.reference,
          createdById: actorId,
        },
      });
      const remainingAfter = (Math.round(remaining * 100) - Math.round(amount * 100)) / 100;
      const settled = remainingAfter <= 0;
      if (settled) {
        await tx.purchaseInvoice.updateMany({
          where: { id, status: "A_PAYER" },
          data: {
            status: "PAYEE",
            paidAt: validated.value.paidOn,
            paymentMethod: validated.value.method,
            paymentReference: validated.value.reference,
          },
        });
      }
      return { amount, settled, remainingAfter };
    });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  await logAudit({
    actorId,
    action: outcome.settled ? "PURCHASE_INVOICE_PAID" : "PURCHASE_INVOICE_PARTLY_PAID",
    entity: "PurchaseInvoice",
    entityId: id,
    metadata: {
      supplier: invoice.supplier.name,
      number: invoice.number,
      amount: toMoney(invoice.amount),
      paid: outcome.amount,
      paidOn: isoDayOf(validated.value.paidOn),
      method: validated.value.method,
      reference: validated.value.reference,
      remaining: Math.max(0, outcome.remainingAfter),
      certificate,
    },
  });

  const fresh = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id }, include: PURCHASE_INVOICE_INCLUDE });
  return NextResponse.json(purchaseInvoiceView(fresh, months, now), { status: 201 });
}

/**
 * Removes payments recorded by mistake — one (`paymentId`) or all of them
 * (« Rouvrir » a paid invoice). The invoice goes back to « à payer » (an
 * invoice paid before lot 3D has no payment row: it simply reopens).
 */
export async function removePurchasePayments(id: string, paymentId: string | null, actorId: string) {
  const invoice = await prisma.purchaseInvoice.findUnique({ where: { id }, include: PURCHASE_INVOICE_INCLUDE });
  if (!invoice) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  if (invoice.status === "ANNULEE") return NextResponse.json({ error: "Cette facture a été annulée." }, { status: 409 });
  if (paymentId && !invoice.payments.some((payment) => payment.id === paymentId)) {
    return NextResponse.json({ error: "Paiement introuvable." }, { status: 404 });
  }

  const paymentSelect = { id: true, paidOn: true, amount: true, method: true, reference: true } as const;
  let removed: Prisma.PurchasePaymentGetPayload<{ select: typeof paymentSelect }>[];
  try {
    removed = await prisma.$transaction(async (tx) => {
      await lockPurchaseInvoice(tx, id);
      // Re-read under the lock: an invoice cancelled meanwhile (« Annuler la
      // saisie » in another tab) is never turned back to « à payer ».
      const current = await tx.purchaseInvoice.findUnique({ where: { id }, select: { status: true } });
      if (!current) throw new Refusal("Facture introuvable.", 404);
      if (current.status === "ANNULEE") throw new Refusal("Cette facture a été annulée.", 409);
      const payments = await tx.purchasePayment.findMany({
        where: { invoiceId: id, ...(paymentId ? { id: paymentId } : {}) },
        select: paymentSelect,
      });
      if (paymentId && payments.length === 0) throw new Refusal("Paiement introuvable.", 404);
      if (payments.length > 0) {
        await tx.purchasePayment.deleteMany({ where: { id: { in: payments.map((payment) => payment.id) } } });
      }
      await tx.purchaseInvoice.update({
        where: { id },
        data: { status: "A_PAYER", paidAt: null, paymentMethod: null, paymentReference: null },
      });
      return payments;
    });
  } catch (error) {
    if (error instanceof Refusal) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }

  await logAudit({
    actorId,
    action: paymentId ? "PURCHASE_PAYMENT_CANCELLED" : "PURCHASE_INVOICE_REOPENED",
    entity: "PurchaseInvoice",
    entityId: id,
    metadata: {
      supplier: invoice.supplier.name,
      number: invoice.number,
      amount: toMoney(invoice.amount),
      payments: removed.map((payment) => ({
        paidOn: isoDayOf(payment.paidOn),
        amount: toMoney(payment.amount),
        method: payment.method,
        reference: payment.reference,
      })),
    },
  });

  const settings = await loadAchatSettings();
  const fresh = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id }, include: PURCHASE_INVOICE_INCLUDE });
  return NextResponse.json(purchaseInvoiceView(fresh, settings.withholding.certificateValidityMonths));
}
