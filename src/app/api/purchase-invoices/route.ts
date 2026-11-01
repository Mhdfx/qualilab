import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validatePurchaseInvoice } from "@/lib/achat-validation";
import { dueDateFor } from "@/lib/stock";
import { loadAchatSettings } from "@/lib/achat-settings";
import { pageParams, toPage } from "@/lib/pagination";
import {
  PURCHASE_INVOICE_INCLUDE,
  PURCHASE_LIST_ORDER,
  purchaseInvoiceData,
  purchaseInvoiceView,
  purchaseListFilters,
  purchaseListSummary,
  purchaseListWhere,
  withholdingFor,
} from "@/lib/purchase-invoices-server";

/**
 * Supplier invoices — the payment-due alerts' data source. The due date
 * defaults to the supplier's payment convention; each row is served with
 * its computed due state so every screen judges lateness identically.
 *
 * Lot 3D (RETOUR-LABO-28-10.md M1, M2, M6, M7): HT / TVA / TTC, the
 * currency, the attestation de régularité fiscale and the retenue à la
 * source; the list has no ceiling any more — `?paged=1` answers
 * `{ items, nextCursor, summary }`, filtered by `vue` (a_payer, payees,
 * annulees), `fournisseur`, `periode` (AAAA-MM or AAAA) and `q` (number),
 * paged by `cursor`. Without `paged`, the first 200 rows as a bare array,
 * as before.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const where = purchaseListWhere(purchaseListFilters(params));
  const settings = await loadAchatSettings();
  const months = settings.withholding.certificateValidityMonths;

  if (params.get("paged") !== "1") {
    const invoices = await prisma.purchaseInvoice.findMany({
      where,
      orderBy: PURCHASE_LIST_ORDER,
      take: 200,
      include: PURCHASE_INVOICE_INCLUDE,
    });
    return NextResponse.json(invoices.map((invoice) => purchaseInvoiceView(invoice, months)));
  }

  const page = pageParams(request);
  const [invoices, summary] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      orderBy: PURCHASE_LIST_ORDER,
      take: page.take + 1,
      ...(page.cursor ? { cursor: page.cursor, skip: page.skip } : {}),
      include: PURCHASE_INVOICE_INCLUDE,
    }),
    purchaseListSummary(where),
  ]);
  const { items, nextCursor } = toPage(invoices, page.take);
  return NextResponse.json({ items: items.map((invoice) => purchaseInvoiceView(invoice, months)), nextCursor, summary });
}

export async function POST(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  const supplierId = typeof input.supplierId === "string" ? input.supplierId : "";
  const supplier = supplierId
    ? await prisma.supplier.findUnique({
        where: { id: supplierId },
        select: {
          id: true,
          name: true,
          paymentTermDays: true,
          archived: true,
          withholdingSubject: true,
          taxCertificateDate: true,
          taxCertificateValidUntil: true,
        },
      })
    : null;
  if (!supplier || supplier.archived) {
    return NextResponse.json({ error: "Fournisseur invalide." }, { status: 400 });
  }

  const settings = await loadAchatSettings();
  const validated = validatePurchaseInvoice(input, { defaultVatRate: settings.defaultVatRate });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const dueDate =
    validated.value.dueDate ??
    dueDateFor(validated.value.issueDate, supplier.paymentTermDays);
  const withholding = withholdingFor(validated.value, supplier, settings.withholding);
  if (withholding.refusal) return NextResponse.json({ error: withholding.refusal }, { status: 400 });

  try {
    const invoice = await prisma.purchaseInvoice.create({
      data: {
        supplierId: supplier.id,
        ...purchaseInvoiceData(validated.value, withholding),
        dueDate,
        createdById: session.id,
      },
      include: PURCHASE_INVOICE_INCLUDE,
    });

    await logAudit({
      actorId: session.id,
      action: "PURCHASE_INVOICE_CREATED",
      entity: "PurchaseInvoice",
      entityId: invoice.id,
      metadata: {
        supplier: supplier.name,
        number: invoice.number,
        amount: validated.value.amount,
        amountHT: validated.value.amountHT,
        vatAmount: validated.value.vatAmount,
        dueDate: invoice.dueDate,
        ...(validated.value.currency ? { currency: validated.value.currency, amountForeign: validated.value.amountForeign } : {}),
        certificate: withholding.certificate,
        ...(withholding.amount ? { withholdingRate: withholding.rate, withholdingAmount: withholding.amount } : {}),
      },
    });

    return NextResponse.json(purchaseInvoiceView(invoice, settings.withholding.certificateValidityMonths), { status: 201 });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "Cette facture existe déjà pour ce fournisseur." },
        { status: 409 }
      );
    }
    throw error;
  }
}
