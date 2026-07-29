import { FileText, Clock, CheckCircle2, Wallet } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RoleDashboard } from "@/components/RoleDashboard";
import { formatCurrency } from "@/lib/labels";

export default async function ComptabilitePage() {
  const [factures, enAttente, payees, encaisse] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.count({ where: { status: "EN_ATTENTE" } }),
    prisma.invoice.count({ where: { status: "PAYEE" } }),
    prisma.invoice.aggregate({
      where: { status: "PAYEE" },
      _sum: { total: true },
    }),
  ]);

  return (
    <RoleDashboard
      badge="Espace comptabilité"
      title="Facturation & paiements"
      subtitle="Générez les factures à partir des échantillons validés et suivez les règlements."
      stats={[
        { label: "Factures", value: factures, icon: FileText, accent: "brand" },
        { label: "En attente", value: enAttente, icon: Clock, accent: "amber" },
        { label: "Payées", value: payees, icon: CheckCircle2, accent: "emerald" },
        { label: "Encaissé", value: formatCurrency(encaisse._sum.total ?? 0), icon: Wallet, accent: "blue" },
      ]}
      mission="Vous générez les factures à partir des échantillons validés d'un client : les analyses réalisées deviennent les lignes de facture, aux prix du catalogue. Vous suivez les statuts de paiement et exportez les factures en PDF."
      nextSteps={[
        {
          title: "Facture depuis les échantillons validés",
          description: "Les analyses validées deviennent automatiquement les lignes de facture, au tarif du catalogue.",
          phase: "Phase 4",
        },
        {
          title: "Dénominations personnalisables",
          description: "Maîtrise complète des libellés de produits et de rapports sur la facture.",
          phase: "Phase 4",
        },
        {
          title: "Suivi des paiements",
          description: "Statuts de règlement par client et relances.",
          phase: "Phase 4",
        },
      ]}
    />
  );
}
