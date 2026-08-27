import { FlaskConical, ClipboardCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { WorkQueue } from "@/components/technicien/WorkQueue";

export const metadata = { title: "Analyses" };

export default async function TechnicienPage() {
  const session = await requireRole("TECHNICIEN", "ADMIN");

  // A technician only ever sees their own bench; ADMIN oversees everything.
  const mine = session.role === "TECHNICIEN" ? { technicianId: session.id } : {};

  const [items, anomalies, submitted] = await Promise.all([
    prisma.sample.findMany({
      where: { ...mine, status: { in: ["RECU", "EN_ANALYSE"] } },
      select: {
        id: true,
        serialNumber: true,
        controlCode: true,
        type: true,
        status: true,
        receivedAt: true,
        conformity: true,
        client: { select: { name: true } },
        parameters: { select: { parameter: { select: { id: true } } } },
        results: { select: { value: true, workStatus: true } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    prisma.result.count({ where: { workStatus: "ANOMALIE", sample: mine } }),
    prisma.sample.count({ where: { ...mine, status: "RESULTATS_SAISIS" } }),
  ]);

  const waiting = items.filter((item) => item.status === "RECU").length;
  const inProgress = items.filter((item) => item.status === "EN_ANALYSE").length;

  return (
    <div>
      <PageHeader
        badge="Espace technicien"
        title="Analyses en laboratoire"
        subtitle="Saisissez les résultats paramètre par paramètre, puis soumettez-les à la validation qualité."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Qui m'attendent" value={waiting} icon={ClipboardCheck} accent="amber" />
          <StatCard label="En analyse" value={inProgress} icon={FlaskConical} accent="blue" />
          <StatCard label="Anomalies" value={anomalies} icon={AlertTriangle} accent="violet" />
          <StatCard label="Résultats soumis" value={submitted} icon={CheckCircle2} accent="emerald" />
        </div>
      </section>

      <section id="analyses" aria-label="Mes analyses">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Mes analyses</h2>
          <span className="text-sm text-slate-500">
            {items.length} échantillon{items.length > 1 ? "s" : ""}
          </span>
        </div>
        <WorkQueue items={items} />
      </section>
    </div>
  );
}
