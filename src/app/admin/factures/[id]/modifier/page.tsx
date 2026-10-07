import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { canEditDraft } from "@/lib/invoice-lifecycle";
import { NouvelleFactureForm } from "@/components/NouvelleFactureForm";
import { loadInvoiceDetail } from "@/components/invoices/invoice-queries";
import { draftFormInvoice } from "@/components/invoices/invoice-view";

export const metadata = { title: "Modifier le brouillon" };

export default async function ModifierFacturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("ADMIN");
  const { id } = await params;

  const invoice = await loadInvoiceDetail(id);
  if (!invoice) notFound();
  // An issued invoice is never edited (FACTURATION.md §1).
  if (!canEditDraft(invoice)) redirect(`/admin/factures/${id}`);

  return <NouvelleFactureForm draft={draftFormInvoice(invoice)} />;
}
