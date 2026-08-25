import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { FactureDetail } from "@/components/FactureDetail";
import type { Invoice } from "@/lib/invoice-types";

export default async function ComptaFactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("COMPTABLE", "ADMIN");
  const { id } = await params;

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      client: true,
      createdBy: { select: { id: true, name: true } },
      items: true,
    },
  });

  if (!invoice) notFound();

  const data: Invoice = {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate?.toISOString() ?? null,
    notes: invoice.notes,
    taxRate: toMoney(invoice.taxRate),
    subtotal: toMoney(invoice.subtotal),
    taxAmount: toMoney(invoice.taxAmount),
    total: toMoney(invoice.total),
    client: invoice.client,
    createdBy: invoice.createdBy,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: toMoney(item.unitPrice),
      lineTotal: toMoney(item.lineTotal),
    })),
  };

  return <FactureDetail invoice={data} />;
}
