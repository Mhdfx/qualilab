import { Inbox, ClipboardCheck, FlaskConical, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ReceptionQueue } from "@/components/reception/ReceptionQueue";

export default async function ReceptionPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [pending, recusAujourdhui, enAnalyse, total] = await Promise.all([
    prisma.sample.findMany({
      where: { status: "PRELEVE" },
      select: {
        id: true,
        code: true,
        lieu: true,
        type: true,
        sampledAt: true,
        client: { select: { name: true } },
        user: { select: { name: true } },
        parameters: { select: { parameter: { select: { name: true } } } },
      },
      orderBy: { sampledAt: "asc" },
    }),
    prisma.sample.count({ where: { receivedAt: { gte: startOfDay } } }),
    prisma.sample.count({ where: { status: "EN_ANALYSE" } }),
    prisma.sample.count(),
  ]);

  return (
    <div>
      <PageHeader
        badge="Espace réception"
        title="Réception des échantillons"
        subtitle="Vérifiez les échantillons à leur arrivée au laboratoire, contrôlez leur conformité et attribuez-les à un technicien."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="À réceptionner" value={pending.length} icon={Inbox} accent="amber" />
          <StatCard label="Reçus aujourd'hui" value={recusAujourdhui} icon={ClipboardCheck} accent="emerald" />
          <StatCard label="En analyse" value={enAnalyse} icon={FlaskConical} accent="blue" />
          <StatCard label="Total échantillons" value={total} icon={CalendarClock} accent="brand" />
        </div>
      </section>

      <section id="file" aria-label="File d'attente">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">
            En attente de réception
          </h2>
          <span className="text-sm text-slate-500">
            {pending.length} échantillon{pending.length > 1 ? "s" : ""}
          </span>
        </div>
        <ReceptionQueue samples={pending} />
      </section>
    </div>
  );
}
