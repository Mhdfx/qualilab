import { requireRole } from "@/lib/auth";
import { FacturesList } from "@/components/FacturesList";
import { billingFigures, loadInvoiceList } from "@/components/invoices/invoice-queries";
import { parseListFilters } from "@/components/invoices/invoice-view";

export const metadata = { title: "Factures" };

export default async function FacturesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("ADMIN");
  const filters = parseListFilters(await searchParams);
  const [{ rows, truncated }, figures] = await Promise.all([loadInvoiceList(filters), billingFigures()]);
  return <FacturesList rows={rows} truncated={truncated} filters={filters} figures={figures} />;
}
