import { ShieldCheck, ClipboardList, FileCheck2, Send } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RoleDashboard } from "@/components/RoleDashboard";

export default async function ValidationPage() {
  const [aValider, valides, rapports, envoyes] = await Promise.all([
    prisma.sample.count({ where: { status: "RESULTATS_SAISIS" } }),
    prisma.sample.count({ where: { status: "VALIDE" } }),
    prisma.report.count(),
    prisma.sample.count({ where: { status: "RAPPORT_ENVOYE" } }),
  ]);

  return (
    <RoleDashboard
      badge="Espace validation"
      title="Validation qualité"
      subtitle="Contrôlez les résultats soumis par les techniciens avant l'émission du rapport officiel."
      stats={[
        { label: "À valider", value: aValider, icon: ClipboardList, accent: "amber" },
        { label: "Validés", value: valides, icon: ShieldCheck, accent: "emerald" },
        { label: "Rapports générés", value: rapports, icon: FileCheck2, accent: "blue" },
        { label: "Rapports envoyés", value: envoyes, icon: Send, accent: "brand" },
      ]}
      mission="Vous contrôlez les résultats saisis par les techniciens : valeurs face aux seuils, notes et historique de l'échantillon. Votre validation déclenche automatiquement la génération du rapport PDF et son envoi au client. En cas de doute, vous rejetez avec un commentaire et l'échantillon repart chez le technicien."
      nextSteps={[
        {
          title: "File des échantillons à valider",
          description: "Vue de contrôle complète : résultats vs seuils, notes du technicien, historique.",
          phase: "Phase 2",
        },
        {
          title: "Validation ou rejet motivé",
          description: "Valider, ou rejeter avec commentaire pour renvoyer l'échantillon au technicien.",
          phase: "Phase 2",
        },
        {
          title: "Rapport PDF & envoi automatique",
          description: "La validation génère le rapport officiel et l'envoie au client par email.",
          phase: "Phase 3",
        },
      ]}
    />
  );
}
