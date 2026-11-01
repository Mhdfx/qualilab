import { requireRole } from "@/lib/auth";
import Link from "next/link";
import {
  Boxes,
  PackageMinus,
  ReceiptText,
  AlertTriangle,
  Clock,
  CalendarX2,
  Coins,
  FileWarning,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { DUE_SOON_DAYS, EXPIRY_STATE_LABELS, stockTotals } from "@/lib/stock";
import { formatCurrency, formatDate } from "@/lib/labels";
import { formatDateOnly } from "@/lib/date-only";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Card } from "@/components/ui/Card";
import { viewHref } from "@/lib/dashboard-view";
import type { PurchaseInvoiceView } from "@/lib/management-views";
import { loadAchatSettings } from "@/lib/achat-settings";
import { loadStockOverview } from "@/lib/stock-overview";
import { PURCHASE_INVOICE_INCLUDE, purchaseInvoiceView } from "@/lib/purchase-invoices-server";
import { CERTIFICATE_STATE_LABELS } from "@/lib/withholding";

export const metadata = { title: "Achat & Stock" };

export default async function MagasinPage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("MAGASINIER", "ADMIN");
  const settings = await loadAchatSettings();
  const now = new Date();
  const [items, unpaidRows] = await Promise.all([
    loadStockOverview({ expiryWarningDays: settings.expiryWarningDays, now }),
    prisma.purchaseInvoice.findMany({
      where: { status: "A_PAYER" },
      orderBy: { dueDate: "asc" },
      include: PURCHASE_INVOICE_INCLUDE,
    }),
  ]);
  const unpaid = unpaidRows.map((invoice) => purchaseInvoiceView(invoice, settings.withholding.certificateValidityMonths, now));

  const lowItems = items.filter((item) => item.low);
  // M4 — the expired first, then those expiring within the window.
  const expiring = items
    .filter((item) => item.expiry)
    .sort((a, b) => (a.expiry!.expiryDay < b.expiry!.expiryDay ? -1 : 1));
  // M5 — the stock's value at the last prices (HT).
  const totals = stockTotals(items);

  const overdue = unpaid.filter((invoice) => invoice.due === "RETARD");
  const dueSoon = unpaid.filter((invoice) => invoice.due === "BIENTOT");
  // What is left to pay: net à payer (TTC − retenue) less the payments.
  const unpaidTotal = unpaid.reduce((sum, invoice) => sum + Math.round(invoice.remaining * 100), 0) / 100;
  // M7 — the NB of 28/10: the unpaid invoices no valid attestation covers.
  const withoutCertificate = unpaid.filter((invoice) => invoice.certificate !== "VALIDE");
  // Each figure opens exactly what it counts (« comme un tri »): the stock,
  // the card below, the supplier invoices still to pay — the ones the
  // amount adds up.
  const unpaidHref = viewHref("/magasin/factures", "a_payer" satisfies PurchaseInvoiceView);

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Magasin"
        subtitle="Suivez le stock du laboratoire, les fournisseurs et leurs échéances de paiement."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard label="Articles en stock" value={items.length} icon={Boxes} accent="brand" href="/magasin/stock" />
          <StatCard label="Sous le seuil" value={lowItems.length} icon={PackageMinus} accent="amber" href="#sous-seuil" />
          <StatCard label="Péremption à surveiller" value={expiring.length} icon={CalendarX2} accent="amber" href="#peremption" />
          <StatCard
            label={totals.unpriced > 0 ? `Valeur du stock (HT, ${totals.unpriced} sans prix)` : "Valeur du stock (HT)"}
            value={formatCurrency(totals.value)}
            icon={Coins}
            accent="emerald"
            href="/magasin/stock"
          />
          <StatCard label="Factures à payer" value={unpaid.length} icon={ReceiptText} accent="blue" href={unpaidHref} />
          <StatCard
            label="Reste à payer"
            value={formatCurrency(unpaidTotal)}
            icon={Clock}
            accent="violet"
            href={unpaidHref}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section id="sous-seuil" aria-labelledby="sous-seuil-title" className="scroll-mt-24">
          <Card className="h-full p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="sous-seuil-title" className="section-title">
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
                      {item.quantity} / seuil {item.minQuantity} {item.unit}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        <section id="peremption" aria-labelledby="peremption-title" className="scroll-mt-24">
          <Card className="h-full p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="peremption-title" className="section-title">
                <CalendarX2 className="h-4 w-4 text-amber-500" aria-hidden="true" />
                Péremption ({settings.expiryWarningDays} jours)
              </h2>
              <Link
                href="/magasin/stock/journal"
                className="rounded text-sm font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                Journal du stock
              </Link>
            </div>
            {expiring.length === 0 ? (
              <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Rien de périmé ni d&apos;expirant dans les {settings.expiryWarningDays} prochains jours.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {expiring.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">
                        {item.expiry!.lot ? `Lot ${item.expiry!.lot} · ` : ""}
                        {item.quantity} {item.unit} en stock
                      </p>
                    </div>
                    <p
                      className={`shrink-0 text-sm font-semibold ${
                        item.expiry!.state === "PERIME" ? "text-rose-700" : "text-amber-700"
                      }`}
                    >
                      {EXPIRY_STATE_LABELS[item.expiry!.state]} · {formatDateOnly(new Date(`${item.expiry!.expiryDay}T00:00:00Z`))}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Le stock est suivi par article : les unités les plus anciennes sont supposées sorties les premières.
            </p>
          </Card>
        </section>

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
                      {formatDate(new Date(invoice.dueDate))}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular-nums text-slate-800">
                    {formatCurrency(invoice.remaining)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="section-title">
              <FileWarning className="h-4 w-4 text-amber-500" aria-hidden="true" />
              Attestations de régularité fiscale
            </h2>
            <Link
              href="/magasin/fournisseurs"
              className="rounded text-sm font-medium text-brand transition hover:text-brand-dark focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              Fournisseurs
            </Link>
          </div>
          {withoutCertificate.length === 0 ? (
            <p className="mt-4 rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              Chaque facture à payer est couverte par une attestation valide.
            </p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {withoutCertificate.slice(0, 8).map((invoice) => (
                <li key={invoice.id} className="flex items-center justify-between gap-3 py-2.5">
                  <p className="min-w-0 truncate text-sm font-medium text-slate-800">
                    {invoice.supplier.name}
                    <span className="text-slate-400"> · {invoice.number}</span>
                  </p>
                  <p className="shrink-0 text-xs font-semibold text-amber-700">{CERTIFICATE_STATE_LABELS[invoice.certificate]}</p>
                </li>
              ))}
            </ul>
          )}
          {withoutCertificate.length > 8 && (
            <p className="mt-2 text-xs text-slate-500">… et {withoutCertificate.length - 8} autre{withoutCertificate.length - 8 > 1 ? "s" : ""}.</p>
          )}
          <p className="mt-3 text-xs text-slate-500">
            L&apos;attestation doit accompagner chaque facture pour appliquer correctement la retenue à la source.
          </p>
        </Card>
      </div>
    </div>
  );
}
