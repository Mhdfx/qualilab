import { requireRole } from "@/lib/auth";
import { FacturesList } from "@/components/FacturesList";
import { billingFigures, loadInvoiceList } from "@/components/invoices/invoice-queries";
import { parseListFilters } from "@/components/invoices/invoice-view";

export const metadata = { title: "Factures" };

/**
 * The comptable's invoice list.
 *
 * Invoicing is the comptable's job, so it lives in their space too — the same
 * screens the admin sees, from the shared components. Filters come from the
 * address (`?etat=&type=&q=`), FACTURATION.md §5.
 */
export default async function ComptaFacturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("COMPTABLE", "ADMIN");
  const filters = parseListFilters(await searchParams);
  const [{ rows, truncated }, figures] = await Promise.all([loadInvoiceList(filters), billingFigures()]);
  return <FacturesList rows={rows} truncated={truncated} filters={filters} figures={figures} />;
}
