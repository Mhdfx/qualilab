import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { canEditDraft } from "@/lib/invoice-lifecycle";
import { NouvelleFactureForm } from "@/components/NouvelleFactureForm";
import { loadInvoiceDetail } from "@/components/invoices/invoice-queries";
import { draftFormInvoice } from "@/components/invoices/invoice-view";

export const metadata = { title: "Modifier le brouillon" };

/**
 * « Modifier » on a draft (FACTURATION.md §1). An issued invoice is never
 * edited: the page sends back to its fiche.
 */
export default async function ComptaModifierFacturePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("COMPTABLE", "ADMIN");
  const { id } = await params;

  const invoice = await loadInvoiceDetail(id);
  if (!invoice) notFound();
  if (!canEditDraft(invoice)) redirect(`/comptabilite/factures/${id}`);

  return <NouvelleFactureForm draft={draftFormInvoice(invoice)} />;
}
