import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCompany } from "@/lib/company-server";
import { FactureDetail } from "@/components/FactureDetail";
import { loadInvoiceDetail } from "@/components/invoices/invoice-queries";

export const metadata = { title: "Facture" };

/**
 * The comptable's invoice fiche (FACTURATION.md §5): state, actions,
 * settlements and credit notes.
 */
export default async function ComptaFactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("COMPTABLE", "ADMIN");
  const { id } = await params;

  const invoice = await loadInvoiceDetail(id);
  if (!invoice) notFound();

  return <FactureDetail invoice={invoice} company={await getCompany()} canManage />;
}
