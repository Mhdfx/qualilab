import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { dueState } from "@/lib/stock";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  PurchaseInvoicesManager,
  type PurchaseInvoiceRow,
} from "@/components/magasin/PurchaseInvoicesManager";

export const metadata = { title: "Factures fournisseurs" };

export default async function FacturesFournisseursPage() {
  const [invoices, suppliers] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 200,
      include: { supplier: { select: { id: true, name: true } } },
    }),
    prisma.supplier.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true, paymentTermDays: true },
    }),
  ]);

  const rows: PurchaseInvoiceRow[] = invoices.map((invoice) => ({
    id: invoice.id,
    number: invoice.number,
    label: invoice.label,
    amount: toMoney(invoice.amount),
    issueDate: invoice.issueDate.toISOString(),
    dueDate: invoice.dueDate.toISOString(),
    status: invoice.status,
    paidAt: invoice.paidAt?.toISOString() ?? null,
    due: invoice.status === "A_PAYER" ? dueState(invoice.dueDate) : "OK",
    supplier: invoice.supplier,
  }));

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Factures fournisseurs"
        subtitle="Enregistrez les factures reçues ; le système surveille les échéances et signale les retards."
      />
      <PurchaseInvoicesManager initialInvoices={rows} suppliers={suppliers} />
    </div>
  );
}
