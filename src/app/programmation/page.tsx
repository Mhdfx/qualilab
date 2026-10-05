import { ClipboardList, CheckCircle2, Clock, FlaskConical } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ProgrammationQueue, type QueueLine } from "@/components/programmation/ProgrammationQueue";

export const metadata = { title: "Programmation des analyses" };

/** A ceiling, not a page: the queue is the current work, never the history (same as the API). */
const QUEUE_LIMIT = 1000;

export default async function ProgrammationPage() {
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  const [, rows, programmeesAujourdhui, enRetard] = await Promise.all([
    // Belt and braces with the layout guard: a page must be safe on its own.
    requireRole("PROGRAMMATEUR", "ADMIN"),
    // The queue of PROGRAMME.md §5: received and programmed lines, grouped by
    // série by the component; a cancelled line has left the circuit.
    prisma.sample.findMany({
      where: { status: { in: ["RECU", "PROGRAMME"] } },
      select: {
        id: true,
        code: true,
        controlCode: true,
        lineNumber: true,
        lineKind: true,
        produit: true,
        surfaceLabel: true,
        personName: true,
        lieu: true,
        status: true,
        unitCount: true,
        priority: true,
        dueAt: true,
        programmedAt: true,
        programmedBy: { select: { id: true, name: true } },
        receivedAt: true,
        analysisBlocked: true,
        nature: { select: { id: true, label: true, family: true } },
        productType: { select: { id: true, name: true } },
        technician: { select: { id: true, name: true } },
        client: { select: { id: true, name: true } },
        serie: { select: { id: true, serialNumber: true, kind: true, receivedAt: true } },
        parameters: { select: { parameterId: true } },
      },
      orderBy: [{ receivedAt: "asc" }, { serieId: "asc" }, { lineNumber: "asc" }],
      take: QUEUE_LIMIT,
    }),
    prisma.sample.count({ where: { programmedAt: { gte: startOfDay } } }),
    // A promised delivery date already passed on a line not yet validated.
    prisma.sample.count({
      where: { dueAt: { lt: now }, status: { in: ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] } },
    }),
  ]);

  const lines: QueueLine[] = rows.map(({ parameters, ...row }) => ({
    ...row,
    parameterCount: parameters.length,
  }));
  const aProgrammer = lines.filter((line) => line.status === "RECU").length;
  const programmees = lines.length - aProgrammer;
  const truncated = rows.length === QUEUE_LIMIT;

  return (
    <div>
      <PageHeader
        badge="Espace programmation"
        title="Programme d'analyse"
        subtitle="Pour chaque ligne réceptionnée, décidez du type de produit, des analyses, des nombres, des méthodes et de l'organisation avant la paillasse. La facturation se prépare dès la confirmation."
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="À programmer" value={aProgrammer} icon={ClipboardList} accent="amber" />
          <StatCard label="Programmées aujourd'hui" value={programmeesAujourdhui} icon={CheckCircle2} accent="emerald" />
          <StatCard label="En retard" value={enRetard} icon={Clock} accent="violet" />
          <StatCard label="En attente de paillasse" value={programmees} icon={FlaskConical} accent="brand" />
        </div>
      </section>

      <section id="file" aria-label="File de programmation">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">À programmer</h2>
          <span className="text-sm text-slate-500">
            {lines.length} ligne{lines.length > 1 ? "s" : ""}
            {programmees > 0 ? ` · ${programmees} programmée${programmees > 1 ? "s" : ""}` : ""}
          </span>
        </div>
        {truncated && (
          <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800" role="status">
            La file est tronquée aux {QUEUE_LIMIT} lignes les plus anciennes : programmez-les pour voir les suivantes.
          </p>
        )}
        <ProgrammationQueue lines={lines} now={now} />
      </section>
    </div>
  );
}
