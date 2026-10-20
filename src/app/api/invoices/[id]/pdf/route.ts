import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { renderPdf } from "@/lib/pdf";
import { buildInvoiceHtml, type InvoiceDocument } from "@/lib/invoice-html";
import { invoiceAmounts } from "@/lib/billing";
import { getCompany } from "@/lib/company-server";
import { invoiceClientIdentity } from "@/lib/invoice-client-identity";
import { INVOICE_LAYOUT_PARAM, invoiceLayoutOf, layoutSourceLine } from "@/lib/invoice-html-layout";

/**
 * The invoice — or credit note — as a PDF, rendered server-side.
 *
 * Replaces the prototype's client-side screenshot: the text is selectable, the
 * table breaks across pages properly, and the document carries the legal
 * mentions an invoice needs. It follows the invoice's life (FACTURATION.md
 * §5): « BROUILLON » watermark and no number on a draft, « ANNULÉE » stamp
 * with date and reason, « Réglé / Reste à payer », and « AVOIR N° AV-… »
 * naming the invoice it corrects. An issued document prints its client as it
 * was at issue (`clientSnapshot`), not as renamed or merged since.
 *
 * `?modele=parametre` prints the same document one line per parameter (Q30,
 * `invoice-html-layout.ts`); without it, the per-line layout, unchanged.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("COMPTABLE", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const layout = invoiceLayoutOf(new URL(request.url).searchParams.get(INVOICE_LAYOUT_PARAM));
  if (!layout) {
    return NextResponse.json({ error: "Modèle de facture inconnu." }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      // A credit-note line bills an analysis through the invoice line it takes back.
      items: { include: { creditedItem: { select: { sampleId: true } } } },
      payments: { select: { amount: true } },
      creditNotes: { select: { total: true } },
      creditedInvoice: { select: { number: true, issueDate: true } },
    },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const amounts = invoiceAmounts({
    kind: invoice.kind,
    status: invoice.status,
    total: invoice.total,
    payments: invoice.payments.map((payment) => payment.amount),
    creditNotes: invoice.creditNotes.map((note) => note.total),
  });

  const document: InvoiceDocument = {
    kind: invoice.kind,
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    notes: invoice.notes,
    taxRate: toMoney(invoice.taxRate),
    subtotal: toMoney(invoice.subtotal),
    taxAmount: toMoney(invoice.taxAmount),
    total: toMoney(invoice.total),
    paidAmount: amounts.paidAmount,
    creditedAmount: amounts.creditedAmount,
    cancelledAt: invoice.cancelledAt,
    cancelReason: invoice.cancelReason,
    creditedInvoice: invoice.creditedInvoice,
    // Issued: the client as it was at issue; a draft: the live client.
    client: invoiceClientIdentity(invoice),
    items: invoice.items.map((item) =>
      layoutSourceLine({ ...item, unitPrice: toMoney(item.unitPrice), lineTotal: toMoney(item.lineTotal) })
    ),
  };

  // A draft has no number yet: its file is named after its id.
  const fileName = `${invoice.number ?? `brouillon-${invoice.id}`}${layout === "parametre" ? "-par-parametre" : ""}`;

  try {
    const pdf = await renderPdf(buildInvoiceHtml(document, await getCompany(), { layout }));

    await logAudit({
      actorId: session.id,
      action: "INVOICE_DOWNLOADED",
      entity: "Invoice",
      entityId: invoice.id,
      metadata: { number: invoice.number, kind: invoice.kind, status: invoice.status, layout },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileName}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[invoice] PDF generation failed", { invoiceId: id, error });
    return NextResponse.json(
      { error: "Impossible de générer la facture en PDF." },
      { status: 500 }
    );
  }
}
