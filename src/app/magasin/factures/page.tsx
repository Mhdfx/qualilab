import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { ViewFilterNotice } from "@/components/ui/ViewFilterNotice";
import { PurchaseInvoicesManager } from "@/components/magasin/PurchaseInvoicesManager";
import { parseView, viewHref } from "@/lib/dashboard-view";
import { PURCHASE_INVOICE_VIEWS } from "@/lib/management-views";
import { DEFAULT_PAGE_SIZE } from "@/lib/pagination";
import { isoDayOf } from "@/lib/date-only";
import { labDayOf } from "@/lib/lab-time";
import { loadAchatSettings } from "@/lib/achat-settings";
import { PAYMENT_REQUIRES_TAX_CERTIFICATE, PURCHASE_PARTIAL_PAYMENTS } from "@/lib/lab-proposals";
import {
  PURCHASE_INVOICE_INCLUDE,
  PURCHASE_LIST_ORDER,
  purchaseInvoiceView,
  purchaseListFilters,
  purchaseListSummary,
  purchaseListWhere,
} from "@/lib/purchase-invoices-server";

export const metadata = { title: "Factures fournisseurs" };

/**
 * The supplier invoices. `?vue=a_payer` is the magasin tiles « Factures à
 * payer » and « Reste à payer » (« comme un tri »): the unpaid invoices,
 * the ones the amount adds up. Lot 3D: filters (vue, fournisseur, période,
 * numéro), pages without a ceiling, the « Journal des achats » export, the
 * payments, the correction and « Annuler la saisie ».
 */
export default async function FacturesFournisseursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("MAGASINIER", "ADMIN");
  const query = await searchParams;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (typeof value === "string") params.set(key, value);
  const tileView = parseView(query.vue, PURCHASE_INVOICE_VIEWS);
  const filters = purchaseListFilters(params);
  const where = purchaseListWhere(filters);
  const settings = await loadAchatSettings();
  const now = new Date();

  const [invoices, summary, suppliers] = await Promise.all([
    prisma.purchaseInvoice.findMany({
      where,
      orderBy: PURCHASE_LIST_ORDER,
      take: DEFAULT_PAGE_SIZE + 1,
      include: PURCHASE_INVOICE_INCLUDE,
    }),
    purchaseListSummary(where),
    prisma.supplier.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        archived: true,
        paymentTermDays: true,
        withholdingSubject: true,
        taxCertificateDate: true,
        taxCertificateValidUntil: true,
      },
    }),
  ]);
  const hasMore = invoices.length > DEFAULT_PAGE_SIZE;
  const shown = hasMore ? invoices.slice(0, DEFAULT_PAGE_SIZE) : invoices;

  return (
    <div>
      <PageHeader
        badge="Achat & Stock"
        title="Factures fournisseurs"
        subtitle="Enregistrez les factures reçues (HT, TVA, attestation fiscale) ; le système surveille les échéances, les paiements et la retenue à la source."
      />
      {tileView && (
        <ViewFilterNotice
          label={PURCHASE_INVOICE_VIEWS[tileView]}
          resetHref={viewHref("/magasin/factures", null)}
          className="mb-4"
        />
      )}
      {/* Keyed by the query: the router keeps a page's client state across a
          change of its search params, so without the key « Tout afficher »
          would keep the unpaid invoices loaded for `?vue=a_payer`. */}
      <PurchaseInvoicesManager
        key={params.toString() || "toutes"}
        initial={{
          items: shown.map((invoice) => purchaseInvoiceView(invoice, settings.withholding.certificateValidityMonths, now)),
          nextCursor: hasMore ? (shown.at(-1)?.id ?? null) : null,
          summary,
        }}
        initialFilters={{
          vue: filters.view ?? "",
          fournisseur: filters.supplierId ?? "",
          periode: filters.period ?? "",
          q: filters.q ?? "",
        }}
        suppliers={suppliers.map((supplier) => ({
          id: supplier.id,
          name: supplier.name,
          archived: supplier.archived,
          paymentTermDays: supplier.paymentTermDays,
          withholdingSubject: supplier.withholdingSubject,
          taxCertificateDay: supplier.taxCertificateDate ? isoDayOf(supplier.taxCertificateDate) : null,
          taxCertificateValidUntil: supplier.taxCertificateValidUntil ? isoDayOf(supplier.taxCertificateValidUntil) : null,
        }))}
        settings={settings}
        today={labDayOf(now)}
        partialPayments={PURCHASE_PARTIAL_PAYMENTS}
        paymentRequiresCertificate={PAYMENT_REQUIRES_TAX_CERTIFICATE}
      />
    </div>
  );
}
