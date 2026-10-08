import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { dueState } from "@/lib/stock";
import { PageHeader } from "@/components/ui/PageHeader";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import {
  PurchaseInvoicesManager,
  type PurchaseInvoiceRow,
} from "@/components/magasin/PurchaseInvoicesManager";
import { parseView, viewHref } from "@/lib/dashboard-view";
import { PURCHASE_INVOICE_VIEWS, purchaseInvoiceViewStatus } from "@/lib/management-views";

export const metadata = { title: "Factures fournisseurs" };

/**
 * The supplier invoices. `?vue=a_payer` is the magasin tiles « Factures à
 * payer » and « Montant à payer » (« comme un tri »): the unpaid invoices,
 * the ones the amount adds up.
 */
export default async function FacturesFournisseursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("MAGASINIER", "ADMIN");
  const view = parseView((await searchParams).vue, PURCHASE_INVOICE_VIEWS);
  const status = purchaseInvoiceViewStatus(view);
  const [invoices, suppliers] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where: status ? { status } : undefined,
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
      {view && (
        <ViewFilterNotice
          label={PURCHASE_INVOICE_VIEWS[view]}
          resetHref={viewHref("/magasin/factures", null)}
          className="mb-4"
        />
      )}
      {/* Keyed by the view: the router keeps a page's client state across a
          change of its search params, so without the key « Tout afficher »
          would keep the unpaid invoices loaded for `?vue=a_payer`. */}
      <PurchaseInvoicesManager key={view ?? "toutes"} initialInvoices={rows} suppliers={suppliers} viewStatus={status} />
    </div>
  );
}
