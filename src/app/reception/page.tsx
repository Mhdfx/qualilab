import { Inbox, ClipboardCheck, FlaskConical, CalendarClock } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { ReceptionQueue } from "@/components/reception/ReceptionQueue";
import {
  BlockedSamples,
  type BlockedSample,
} from "@/components/reception/BlockedSamples";
import type { TechnicianOption } from "@/components/reception/ReceptionForm";

export const metadata = { title: "Réception" };

export default async function ReceptionPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [session, pending, blocked, recusAujourdhui, enAnalyse, total] =
    await Promise.all([
      getSession(),
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
      prisma.sample.findMany({
        where: { analysisBlocked: true, status: "RECU" },
        select: {
          id: true,
          controlCode: true,
          produit: true,
          conformityNote: true,
          receivedAt: true,
          client: { select: { name: true } },
        },
        orderBy: { receivedAt: "asc" },
      }),
      prisma.sample.count({ where: { receivedAt: { gte: startOfDay } } }),
      prisma.sample.count({ where: { status: "EN_ANALYSE" } }),
      prisma.sample.count(),
    ]);

  // The release control needs the technician list; only fetched when a
  // blocked sample actually exists.
  let technicianOptions: TechnicianOption[] = [];
  if (blocked.length > 0) {
    const [technicians, workload] = await Promise.all([
      prisma.user.findMany({
        where: { role: "TECHNICIEN", banned: { not: true } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.sample.groupBy({
        by: ["technicianId"],
        where: { status: { in: ["RECU", "EN_ANALYSE"] } },
        _count: { _all: true },
      }),
    ]);
    const loadByTechnician = new Map(
      workload.map((row) => [row.technicianId, row._count._all])
    );
    technicianOptions = technicians.map((technician) => ({
      id: technician.id,
      name: technician.name,
      load: loadByTechnician.get(technician.id) ?? 0,
    }));
  }

  const blockedSamples: BlockedSample[] = blocked.map((sample) => ({
    id: sample.id,
    controlCode: sample.controlCode,
    clientName: sample.client.name,
    produit: sample.produit,
    conformityNote: sample.conformityNote,
    receivedAt: sample.receivedAt ? formatDateTime(sample.receivedAt) : null,
  }));

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

      <BlockedSamples
        samples={blockedSamples}
        technicians={technicianOptions}
        canRelease={session?.role === "ADMIN"}
      />
    </div>
  );
}
