import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { renderPdf } from "@/lib/pdf";
import { buildInvoiceHtml, type InvoiceDocument } from "@/lib/invoice-html";

/**
 * The invoice as a PDF, rendered server-side.
 *
 * Replaces the prototype's client-side screenshot: the text is selectable, the
 * table breaks across pages properly, and the document carries the legal
 * mentions an invoice needs.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("COMPTABLE", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: { client: true, items: true },
  });

  if (!invoice) {
    return NextResponse.json({ error: "Facture introuvable." }, { status: 404 });
  }

  const document: InvoiceDocument = {
    number: invoice.number,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    status: invoice.status,
    notes: invoice.notes,
    taxRate: toMoney(invoice.taxRate),
    subtotal: toMoney(invoice.subtotal),
    taxAmount: toMoney(invoice.taxAmount),
    total: toMoney(invoice.total),
    client: {
      name: invoice.client.name,
      address: invoice.client.address,
      contact: invoice.client.contact,
      phone: invoice.client.phone,
      email: invoice.client.email,
      ice: invoice.client.ice,
    },
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: toMoney(item.unitPrice),
      lineTotal: toMoney(item.lineTotal),
    })),
  };

  try {
    const pdf = await renderPdf(buildInvoiceHtml(document));

    await logAudit({
      actorId: session.id,
      action: "INVOICE_DOWNLOADED",
      entity: "Invoice",
      entityId: invoice.id,
      metadata: { number: invoice.number },
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.number}.pdf"`,
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
