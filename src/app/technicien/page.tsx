import { FlaskConical, ClipboardCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { RoleDashboard } from "@/components/RoleDashboard";

export default async function TechnicienPage() {
  const session = await requireRole("TECHNICIEN", "ADMIN");

  // A technician only ever sees their own workload.
  const mine =
    session.role === "TECHNICIEN" ? { technicianId: session.id } : {};

  const [attribues, enAnalyse, anomalies, saisis] = await Promise.all([
    prisma.sample.count({ where: { ...mine, status: "RECU" } }),
    prisma.sample.count({ where: { ...mine, status: "EN_ANALYSE" } }),
    prisma.result.count({
      where: { workStatus: "ANOMALIE", sample: mine },
    }),
    prisma.sample.count({ where: { ...mine, status: "RESULTATS_SAISIS" } }),
  ]);

  return (
    <RoleDashboard
      badge="Espace technicien"
      title="Analyses en laboratoire"
      subtitle="Retrouvez les échantillons qui vous sont attribués et saisissez les résultats paramètre par paramètre."
      stats={[
        { label: "Qui m'attendent", value: attribues, icon: ClipboardCheck, accent: "amber" },
        { label: "En analyse", value: enAnalyse, icon: FlaskConical, accent: "blue" },
        { label: "Anomalies", value: anomalies, icon: AlertTriangle, accent: "violet" },
        { label: "Résultats saisis", value: saisis, icon: CheckCircle2, accent: "emerald" },
      ]}
      mission="Vous ne voyez que les échantillons qui vous sont attribués. Pour chacun, vous saisissez les résultats paramètre par paramètre — valeur, unité, seuil de référence et conformité — puis vous soumettez le tout à la validation qualité."
      nextSteps={[
        {
          title: "Fiche de saisie des résultats",
          description: "Une ligne par paramètre : valeur mesurée, unité, seuil, conformité, avec enregistrement progressif.",
          phase: "Phase 2",
        },
        {
          title: "Calcul automatique des résultats",
          description: "Les résultats sont calculés à partir des saisies brutes, avec correction possible en cas d'erreur.",
          phase: "Phase 2",
        },
        {
          title: "Feuille de paillasse",
          description: "Impression de la feuille de paillasse par date pour la saisie sur la paillasse.",
          phase: "Phase 2",
        },
      ]}
    />
  );
}
