import { requireRole } from "@/lib/auth";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { getCompany } from "@/lib/company-server";
import { FactureDetail } from "@/components/FactureDetail";
import type { Invoice } from "@/lib/invoice-types";

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("ADMIN");
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

  const serialized: Invoice = {
    id: invoice.id,
    number: invoice.number,
    status: invoice.status,
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
    notes: invoice.notes,
    taxRate: toMoney(invoice.taxRate),
    subtotal: toMoney(invoice.subtotal),
    taxAmount: toMoney(invoice.taxAmount),
    total: toMoney(invoice.total),
    client: {
      id: invoice.client.id,
      name: invoice.client.name,
      contact: invoice.client.contact,
      email: invoice.client.email,
      phone: invoice.client.phone,
      address: invoice.client.address,
      ice: invoice.client.ice,
    },
    createdBy: invoice.createdBy,
    items: invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: toMoney(item.unitPrice),
      lineTotal: toMoney(item.lineTotal),
    })),
  };

  return (
    <FactureDetail invoice={serialized} company={await getCompany()} canSettle />
  );
}
