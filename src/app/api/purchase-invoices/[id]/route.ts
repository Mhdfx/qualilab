import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { isoDayOf } from "@/lib/date-only";
import { NOTES_MAX, validatePurchaseInvoice } from "@/lib/achat-validation";
import { loadAchatSettings } from "@/lib/achat-settings";
import { dueDateFor } from "@/lib/stock";
import { correctionRefusal } from "@/lib/purchase-invoice";
import {
  PURCHASE_INVOICE_INCLUDE,
  purchaseInvoiceData,
  purchaseInvoiceView,
  withholdingFor,
} from "@/lib/purchase-invoices-server";
import { lockPurchaseInvoice, recordPurchasePayment, removePurchasePayments } from "@/lib/purchase-payments-server";

/**
 * One supplier invoice. Rule of 27/08 (HANDOFF §8), updated by lot 3D
 * (RETOUR-LABO-28-10.md M1): what has been PAID is history and never
 * rewritten — but an invoice still to pay, with no payment yet, may be
 * corrected (PUT, a reason required, journalled with before / after) or
 * cancelled when it was entered by mistake (« Annuler la saisie »: status
 * ANNULEE with its reason; kept, out of every total and alert).
 *
 * PATCH `{ status }`:
 * - « PAYEE » — pays all that is left, on `paidOn` (today by default), with
 *   `method` (required) and `reference` (`POST …/payments` for a part);
 * - « A_PAYER » — « Rouvrir »: removes the payments recorded by mistake;
 * - « ANNULEE » + `reason` — « Annuler la saisie ».
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const { status } = input;

  if (status === "PAYEE") {
    const existing = await prisma.purchaseInvoice.findUnique({ where: { id }, select: { status: true } });
    if (!existing) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    // Already paid (a double click, two tabs): nothing changes, no second payment.
    if (existing.status === "PAYEE") return unchanged(id);
    return recordPurchasePayment(id, { ...input, amount: "" }, session.id);
  }
  if (status === "A_PAYER") {
    const existing = await prisma.purchaseInvoice.findUnique({
      where: { id },
      select: { status: true, _count: { select: { payments: true } } },
    });
    if (!existing) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
    // Nothing to reopen: no second journal entry.
    if (existing.status === "A_PAYER" && existing._count.payments === 0) return unchanged(id);
    return removePurchasePayments(id, null, session.id);
  }
  if (status === "ANNULEE") return cancelEntry(id, input, session.id);
  return NextResponse.json({ error: "Statut invalide." }, { status: 400 });
}

async function unchanged(id: string) {
  const settings = await loadAchatSettings();
  const invoice = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id }, include: PURCHASE_INVOICE_INCLUDE });
  return NextResponse.json(purchaseInvoiceView(invoice, settings.withholding.certificateValidityMonths));
}

function reasonOf(input: Record<string, unknown>): string | NextResponse {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) return NextResponse.json({ error: "Indiquez le motif." }, { status: 400 });
  if (reason.length > NOTES_MAX) {
    return NextResponse.json({ error: `Le motif est trop long (${NOTES_MAX} caractères max).` }, { status: 400 });
  }
  return reason;
}

/** « Annuler la saisie »: an invoice still to pay, with no payment, entered by mistake. */
async function cancelEntry(id: string, input: Record<string, unknown>, actorId: string) {
  const reason = reasonOf(input);
  if (reason instanceof NextResponse) return reason;

  const result = await prisma.$transaction(async (tx) => {
    await lockPurchaseInvoice(tx, id);
    const invoice = await tx.purchaseInvoice.findUnique({
      where: { id },
      select: { status: true, number: true, amount: true, supplier: { select: { name: true } }, _count: { select: { payments: true } } },
    });
    if (!invoice) return { status: 404, error: "Facture introuvable." } as const;
    const refusal = correctionRefusal({ status: invoice.status, paymentCount: invoice._count.payments });
    if (refusal) return { status: 409, error: refusal } as const;
    await tx.purchaseInvoice.update({
      where: { id },
      data: { status: "ANNULEE", cancelledAt: new Date(), cancelReason: reason },
    });
    return { status: 200, invoice } as const;
  });
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });

  await logAudit({
    actorId,
    action: "PURCHASE_INVOICE_CANCELLED",
    entity: "PurchaseInvoice",
    entityId: id,
    metadata: {
      supplier: result.invoice.supplier.name,
      number: result.invoice.number,
      amount: toMoney(result.invoice.amount),
      reason,
    },
  });
  return unchanged(id);
}

/**
 * Correcting an invoice still to pay, with no payment (lot 3D, M1): every
 * field of the form, the supplier included, with a reason. The retenue is
 * recomputed as at the recording (the rate typed, else the settings').
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const reason = reasonOf(input);
  if (reason instanceof NextResponse) return reason;

  const existing = await prisma.purchaseInvoice.findUnique({ where: { id }, include: PURCHASE_INVOICE_INCLUDE });
  if (!existing) return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });

  const supplierId = typeof input.supplierId === "string" && input.supplierId ? input.supplierId : existing.supplierId;
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    select: { id: true, name: true, archived: true, paymentTermDays: true, withholdingSubject: true, taxCertificateDate: true, taxCertificateValidUntil: true },
  });
  if (!supplier || (supplier.archived && supplier.id !== existing.supplierId)) {
    return NextResponse.json({ error: "Fournisseur invalide." }, { status: 400 });
  }

  const settings = await loadAchatSettings();
  const validated = validatePurchaseInvoice(input, { defaultVatRate: settings.defaultVatRate });
  if (!validated.ok) return NextResponse.json({ error: validated.error }, { status: 400 });
  const dueDate = validated.value.dueDate ?? dueDateFor(validated.value.issueDate, supplier.paymentTermDays);
  const withholding = withholdingFor(validated.value, supplier, settings.withholding);
  if (withholding.refusal) return NextResponse.json({ error: withholding.refusal }, { status: 400 });

  let result: { status: number; error?: string };
  try {
    result = await prisma.$transaction(async (tx) => {
      await lockPurchaseInvoice(tx, id);
      const current = await tx.purchaseInvoice.findUnique({
        where: { id },
        select: { status: true, _count: { select: { payments: true } } },
      });
      if (!current) return { status: 404, error: "Facture introuvable." };
      const refusal = correctionRefusal({ status: current.status, paymentCount: current._count.payments });
      if (refusal) return { status: 409, error: refusal };
      await tx.purchaseInvoice.update({
        where: { id },
        data: {
          supplierId: supplier.id,
          ...purchaseInvoiceData(validated.value, withholding),
          dueDate,
          correctedAt: new Date(),
        },
      });
      return { status: 200 };
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Cette facture existe déjà pour ce fournisseur." }, { status: 409 });
    }
    throw error;
  }
  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });

  const snapshot = (value: {
    supplier: string;
    number: string;
    amount: number;
    amountHT: number | null;
    vatAmount: number | null;
    issueDay: string;
    dueDay: string;
    withholdingAmount: number | null;
  }) => value;
  await logAudit({
    actorId: session.id,
    action: "PURCHASE_INVOICE_CORRECTED",
    entity: "PurchaseInvoice",
    entityId: id,
    metadata: {
      reason,
      before: snapshot({
        supplier: existing.supplier.name,
        number: existing.number,
        amount: toMoney(existing.amount),
        amountHT: existing.amountHT === null ? null : toMoney(existing.amountHT),
        vatAmount: existing.vatAmount === null ? null : toMoney(existing.vatAmount),
        issueDay: isoDayOf(existing.issueDate),
        dueDay: isoDayOf(existing.dueDate),
        withholdingAmount: existing.withholdingAmount === null ? null : toMoney(existing.withholdingAmount),
      }),
      after: snapshot({
        supplier: supplier.name,
        number: validated.value.number,
        amount: validated.value.amount,
        amountHT: validated.value.amountHT,
        vatAmount: validated.value.vatAmount,
        issueDay: isoDayOf(validated.value.issueDate),
        dueDay: isoDayOf(dueDate),
        withholdingAmount: withholding.amount,
      }),
    },
  });

  return unchanged(id);
}
