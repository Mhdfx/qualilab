import { Inbox, ClipboardCheck, FlaskConical, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { RoleDashboard } from "@/components/RoleDashboard";

export default async function ReceptionPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [aReceptionner, recusAujourdhui, enAnalyse, total] = await Promise.all([
    prisma.sample.count({ where: { status: "PRELEVE" } }),
    prisma.sample.count({ where: { receivedAt: { gte: startOfDay } } }),
    prisma.sample.count({ where: { status: "EN_ANALYSE" } }),
    prisma.sample.count(),
  ]);

  return (
    <RoleDashboard
      badge="Espace réception"
      title="Réception des échantillons"
      subtitle="Vérifiez les échantillons à leur arrivée au laboratoire et attribuez-les à un technicien."
      stats={[
        { label: "À réceptionner", value: aReceptionner, icon: Inbox, accent: "amber" },
        { label: "Reçus aujourd'hui", value: recusAujourdhui, icon: ClipboardCheck, accent: "emerald" },
        { label: "En analyse", value: enAnalyse, icon: FlaskConical, accent: "blue" },
        { label: "Total échantillons", value: total, icon: CalendarClock, accent: "brand" },
      ]}
      mission="Vous réceptionnez les échantillons prélevés sur le terrain. Les informations sont déjà saisies par le préleveur : vous les vérifiez, validez la conformité, puis attribuez l'échantillon à un technicien. C'est à la réception que le code contrôle et le numéro de série officiels sont générés."
      nextSteps={[
        {
          title: "File d'attente des échantillons",
          description: "La liste des échantillons prélevés en attente de réception, avec vérification rapide des données terrain.",
          phase: "Phase 2",
        },
        {
          title: "Contrôle de conformité",
          description: "Valider la conformité ou signaler une non-conformité avec motif.",
          phase: "Phase 2",
        },
        {
          title: "Attribution à un technicien",
          description: "Attribuer l'échantillon en un clic, avec visibilité sur la charge de chaque technicien.",
          phase: "Phase 2",
        },
      ]}
    />
  );
}
