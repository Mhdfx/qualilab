import { requireRole } from "@/lib/auth";
import { FilePen, Hourglass, FileBarChart, Wallet } from "lucide-react";
import { RoleDashboard } from "@/components/RoleDashboard";
import { formatCurrency } from "@/lib/labels";
import { billingFigures } from "@/components/invoices/invoice-queries";

export const metadata = { title: "Comptabilité" };

export default async function ComptabilitePage() {
  // Belt and braces with the layout guard: a page must be safe on its own.
  await requireRole("COMPTABLE", "ADMIN");
  // FACTURATION.md §4: drafts apart, billed = issued − credit notes,
  // collected = settlements.
  const figures = await billingFigures();

  return (
    <RoleDashboard
      badge="Espace comptabilité"
      title="Facturation & paiements"
      subtitle="Préparez les factures à partir des échantillons programmés ou validés, émettez-les et suivez les règlements."
      stats={[
        { label: "Brouillons", value: figures.draftCount, icon: FilePen, accent: "violet" },
        { label: "En attente de règlement", value: figures.awaitingCount, icon: Hourglass, accent: "amber" },
        { label: "Facturé (net d'avoirs)", value: formatCurrency(figures.billed), icon: FileBarChart, accent: "brand" },
        { label: "Encaissé", value: formatCurrency(figures.collected), icon: Wallet, accent: "emerald" },
      ]}
      mission="Vous préparez les factures d'un client à partir de ses analyses : un brouillon se corrige librement, puis vous l'émettez et il reçoit son numéro. Vous enregistrez les règlements (espèces, chèque, effet, carte, virement), corrigez une facture émise par un avoir ou l'annulez tant qu'aucun règlement n'est reçu, et exportez chaque document en PDF."
    />
  );
}
