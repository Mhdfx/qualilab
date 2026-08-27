import Link from "next/link";
import {
  Boxes,
  PackageMinus,
  ReceiptText,
  AlertTriangle,
  Clock,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { dueState, isLowStock, DUE_SOON_DAYS } from "@/lib/stock";
import { formatCurrency, formatDate } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";

export const metadata = { title: "Achat & Stock" };

export default async function MagasinPage() {
  const [items, unpaid] = await Promise.all([
    prisma.stockItem.findMany({
      where: { archived: false },
      orderBy: { name: "asc" },
    }),
    prisma.purchaseInvoice.findMany({
      where: { status: "A_PAYER" },
      orderBy: { dueDate: "asc" },
      include: { supplier: { select: { name: true } } },
    }),
  ]);

  const lowItems = items
    .map((item) => ({
      ...item,
      quantityNum: toMoney(item.quantity),
      minNum: toMoney(item.minQuantity),
    }))
    .filter((item) => isLowStock(item.quantityNum, item.minNum));

  const withDue = unpaid.map((invoice) => ({
    ...invoice,
    due: dueState(invoice.dueDate),
  }));
  const overdue = withDue.filter((invoice) => invoice.due === "RETARD");
  const dueSoon = withDue.filter((invoice) => invoice.due === "BIENTOT");
  const unpaidTotal = unpaid.reduce(
    (sum, invoice) => sum + toMoney(invoice.amount),
    0
  );

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Magasin"
        subtitle="Suivez le stock du laboratoire, les fournisseurs et leurs échéances de paiement."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Articles en stock" value={items.length} icon={Boxes} accent="brand" />
          <StatCard label="Sous le seuil" value={lowItems.length} icon={PackageMinus} accent="amber" />
          <StatCard label="Factures à payer" value={unpaid.length} icon={ReceiptText} accent="blue" />
          <StatCard
            label="Montant à payer"
            value={formatCurrency(Math.round(unpaidTotal * 100) / 100)}
            icon={Clock}
            accent="violet"
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">
              <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Stock sous le seuil
            </h2>
            <Link
              href="/magasin/stock"
              className="rounded text-sm font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Gérer le stock
            </Link>
          </div>
          {lowItems.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Aucun article sous son seuil — rien à recommander.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {lowItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                    {item.category && (
                      <p className="text-xs text-slate-500">{item.category}</p>
                    )}
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-amber-700">
                    {item.quantityNum} / seuil {item.minNum} {item.unit}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Échéances fournisseurs ({DUE_SOON_DAYS} jours)
            </h2>
            <Link
              href="/magasin/factures"
              className="rounded text-sm font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Toutes les factures
            </Link>
          </div>
          {overdue.length === 0 && dueSoon.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Aucune échéance dans les {DUE_SOON_DAYS} prochains jours.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {[...overdue, ...dueSoon].map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">
                      {invoice.supplier.name}
                      <span className="text-slate-400"> · {invoice.number}</span>
                    </p>
                    <p
                      className={`text-xs font-medium ${
                        invoice.due === "RETARD" ? "text-rose-600" : "text-amber-700"
                      }`}
                    >
                      {invoice.due === "RETARD" ? "En retard — " : "Échéance "}
                      {formatDate(invoice.dueDate)}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                    {formatCurrency(toMoney(invoice.amount))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
