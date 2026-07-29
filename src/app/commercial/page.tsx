import { Building2, FlaskConical, Send, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RoleDashboard } from "@/components/RoleDashboard";

export default async function CommercialPage() {
  const [clients, echantillons, rapportsEnvoyes, factures] = await Promise.all([
    prisma.client.count(),
    prisma.sample.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
    prisma.invoice.count(),
  ]);

  return (
    <RoleDashboard
      badge="Espace commercial"
      title="Gestion commerciale"
      subtitle="Gérez la base clients et suivez l'état des échantillons et des rapports par client."
      stats={[
        { label: "Clients", value: clients, icon: Building2, accent: "brand" },
        { label: "Échantillons", value: echantillons, icon: FlaskConical, accent: "blue" },
        { label: "Rapports envoyés", value: rapportsEnvoyes, icon: Send, accent: "emerald" },
        { label: "Factures", value: factures, icon: FileText, accent: "violet" },
      ]}
      mission="Vous gérez la base clients : création, modification, archivage. Vous suivez l'état des échantillons de chaque client et pouvez renvoyer manuellement un rapport si le client le demande."
      nextSteps={[
        {
          title: "Gestion complète des clients",
          description: "Création, modification et archivage des fiches clients (raison sociale, contact, ICE).",
          phase: "Phase 4",
        },
        {
          title: "Fiche client 360°",
          description: "Historique des échantillons, rapports envoyés, factures et paiements au même endroit.",
          phase: "Phase 4",
        },
        {
          title: "Renvoi manuel d'un rapport",
          description: "Renvoyer un rapport déjà généré au client, avec journal des envois.",
          phase: "Phase 3",
        },
      ]}
    />
  );
}
