import { Inbox, ClipboardCheck, FlaskConical, Layers, PackagePlus } from "lucide-react";
import { PrimaryLink } from "@/components/PrimaryButton";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SerieQueue, type QueueSerie } from "@/components/reception/SerieQueue";
import {
  BlockedSamples,
  type BlockedSample,
} from "@/components/reception/BlockedSamples";
import type { TechnicianOption } from "@/components/reception/types";

export const metadata = { title: "Réception" };

export default async function ReceptionPage() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [session, pending, blocked, recusAujourdhui, enAnalyse] = await Promise.all([
    // Belt and braces with the layout guard.
    requireRole("RECEPTIONNISTE", "ADMIN"),
    // The queue is made of séries (WORKFLOW.md rule 1): a série waits as
    // long as one of its lines is still PRELEVE.
    prisma.serie.findMany({
      where: { samples: { some: { status: "PRELEVE" } } },
      select: {
        id: true,
        serialNumber: true,
        kind: true,
        startedAt: true,
        arrivedAt: true,
        coolerTemperature: true,
        samplerKind: true,
        samplerName: true,
        client: { select: { name: true } },
        site: { select: { name: true } },
        samplerUser: { select: { name: true } },
        samples: {
          select: { id: true, status: true, nature: { select: { label: true } } },
          orderBy: { lineNumber: "asc" },
        },
      },
      orderBy: { startedAt: "asc" },
      take: 100,
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
  ]);

  const pendingLines = pending.reduce(
    (n, serie) => n + serie.samples.filter((s) => s.status === "PRELEVE").length,
    0
  );

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
        title="Réception des séries"
        subtitle="Une visite arrive dans une glacière et se réceptionne en une fois : températures, règles d'acceptation, numérotation et étiquettes."
        action={
          <PrimaryLink href="/reception/nouveau-depot" className="shadow-lg shadow-black/20">
            <PackagePlus className="h-4 w-4" aria-hidden="true" />
            Nouveau dépôt
          </PrimaryLink>
        }
      />

      <section aria-label="Indicateurs" className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Séries à réceptionner" value={pending.length} icon={Inbox} accent="amber" />
          <StatCard label="Lignes en attente" value={pendingLines} icon={Layers} accent="brand" />
          <StatCard label="Reçus aujourd'hui" value={recusAujourdhui} icon={ClipboardCheck} accent="emerald" />
          <StatCard label="En analyse" value={enAnalyse} icon={FlaskConical} accent="blue" />
        </div>
      </section>

      <section id="file" aria-label="File d'attente">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-slate-900">En attente de réception</h2>
          <span className="text-sm text-slate-500">
            {pending.length} série{pending.length > 1 ? "s" : ""}
          </span>
        </div>
        <SerieQueue series={pending as QueueSerie[]} />
      </section>

      <BlockedSamples
        samples={blockedSamples}
        technicians={technicianOptions}
        canRelease={session?.role === "ADMIN"}
      />
    </div>
  );
}
