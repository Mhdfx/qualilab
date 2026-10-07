import { FlaskConical, ClipboardCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { benchQueueWhereFor, benchWhereFor } from "@/lib/bench-access";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { WorkQueue } from "@/components/technicien/WorkQueue";

export const metadata = { title: "Analyses" };

export default async function TechnicienPage() {
  const session = await requireRole("TECHNICIEN", "ADMIN");

  // A technician's bench is the samples they hold or share a parameter of
  // (PROGRAMME.md §6); ADMIN oversees everything. Only a programmed sample
  // reaches the bench: a received one waits for its programme.
  const mine = benchWhereFor(session);

  const [items, anomalies, submitted] = await Promise.all([
    prisma.sample.findMany({
      where: benchQueueWhereFor(session),
      select: {
        id: true,
        code: true,
        controlCode: true,
        type: true,
        status: true,
        // What is analysed: « Planche verte — surface nettoyée » (RETOUR-LABO-06-10.md §5).
        lineNumber: true,
        lineKind: true,
        produit: true,
        surfaceLabel: true,
        surfaceState: true,
        personName: true,
        airMethod: true,
        receivedAt: true,
        conformity: true,
        priority: true,
        dueAt: true,
        technicianId: true,
        client: { select: { name: true } },
        serie: { select: { serialNumber: true } },
        parameters: { select: { parameterId: true, technicianId: true } },
        results: { select: { parameterId: true, value: true, workStatus: true, interpretation: true } },
      },
      // The urgent samples first, then the oldest receptions.
      orderBy: [{ priority: "desc" }, { receivedAt: "asc" }],
    }),
    prisma.result.count({ where: { workStatus: "ANOMALIE", sample: mine } }),
    prisma.sample.count({ where: { ...mine, status: "RESULTATS_SAISIS" } }),
  ]);

  const waiting = items.filter((item) => item.status === "PROGRAMME").length;
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
        <WorkQueue items={items} viewerId={session.role === "TECHNICIEN" ? session.id : null} />
      </section>
    </div>
  );
}
