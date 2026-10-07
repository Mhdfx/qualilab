import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { getCompany } from "@/lib/company-server";
import { FactureDetail } from "@/components/FactureDetail";
import { loadInvoiceDetail } from "@/components/invoices/invoice-queries";

export const metadata = { title: "Facture" };

export default async function FactureDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("ADMIN");
  const { id } = await params;

  const invoice = await loadInvoiceDetail(id);
  if (!invoice) notFound();

  return <FactureDetail invoice={invoice} company={await getCompany()} canManage />;
}
