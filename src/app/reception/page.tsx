import { Inbox, ClipboardCheck, FlaskConical, Layers, ListChecks, PackagePlus } from "lucide-react";
import { PrimaryLink } from "@/components/PrimaryButton";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/lib/auth";
import { formatDateTime } from "@/lib/labels";
import { serverIsoDay, viewHref } from "@/lib/dashboard-view";
import { rechercheHref } from "@/lib/sample-search";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard } from "@/components/ui/StatCard";
import { SerieQueue, type QueueSerie } from "@/components/reception/SerieQueue";
import {
  BlockedSamples,
  type BlockedSample,
} from "@/components/reception/BlockedSamples";
import type { TechnicianOption } from "@/components/reception/types";

export const metadata = { title: "Réception" };

/** The queue shows the oldest séries first; the tiles count them all. */
const QUEUE_LIMIT = 100;

/**
 * The queue is made of séries (WORKFLOW.md rule 1): a série waits as long as
 * one of its samples is still PRELEVE. Every sample belongs to a série, so
 * the PRELEVE samples are exactly the samples these séries wait with.
 */
const PENDING_SERIE = { samples: { some: { status: "PRELEVE" as const } } };

export default async function ReceptionPage() {
  // The day as /recherche reads `du` / `au` back: server midnight to
  // 23:59:59.999 on the server clock (TZ = LAB_TIME_ZONE), so the tile's
  // link is written with `serverIsoDay`, the same clock.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setHours(23, 59, 59, 999);

  const [session, pending, pendingSeries, pendingSamples, blocked, recusAujourdhui, enAnalyse, aProgrammer] = await Promise.all([
    // Belt and braces with the layout guard.
    requireRole("RECEPTIONNISTE", "ADMIN"),
    prisma.serie.findMany({
      where: PENDING_SERIE,
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
      take: QUEUE_LIMIT,
    }),
    // Counted, not read off the capped list: the tiles stay true past 100 séries.
    prisma.serie.count({ where: PENDING_SERIE }),
    prisma.sample.count({ where: { status: "PRELEVE" } }),
    prisma.sample.findMany({
      where: { analysisBlocked: true, status: "RECU" },
      select: {
        id: true,
        controlCode: true,
        produit: true,
        conformityReason: true,
        conformityNote: true,
        receivedAt: true,
        client: { select: { name: true } },
      },
      orderBy: { receivedAt: "asc" },
    }),
    // Exactly the samples /recherche lists for today's reception date.
    prisma.sample.count({ where: { receivedAt: { gte: startOfDay, lte: endOfDay } } }),
    prisma.sample.count({ where: { status: "EN_ANALYSE" } }),
    // Received samples waiting for the responsable des paramètres (PROGRAMME.md §6).
    prisma.sample.count({ where: { status: "RECU" } }),
  ]);

  const queueTruncated = pendingSeries > pending.length;
  const queueHref = viewHref("/reception", null, "file");

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
        where: { status: { in: ["RECU", "PROGRAMME", "EN_ANALYSE"] } },
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
    conformityReason: sample.conformityReason,
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Each tile opens the list it counts (« comme un tri »): the queue below, or /recherche. */}
          <StatCard label="Séries à réceptionner" value={pendingSeries} icon={Inbox} accent="amber" href={queueHref} />
          <StatCard label="Échantillons en attente" value={pendingSamples} icon={Layers} accent="brand" href={queueHref} />
          <StatCard
            label="Reçus aujourd'hui"
            value={recusAujourdhui}
            icon={ClipboardCheck}
            accent="emerald"
            href={rechercheHref({ from: serverIsoDay(startOfDay), to: serverIsoDay(startOfDay) })}
          />
          <StatCard
            label="À programmer"
            value={aProgrammer}
            icon={ListChecks}
            accent="violet"
            href={rechercheHref({ status: "RECU" })}
          />
          <StatCard
            label="En analyse"
            value={enAnalyse}
            icon={FlaskConical}
            accent="blue"
            href={rechercheHref({ status: "EN_ANALYSE" })}
          />
        </div>
      </section>

      <section id="file" aria-label="File d'attente" className="scroll-mt-24">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-lg font-semibold text-slate-900">En attente de réception</h2>
          <span className="text-sm text-slate-500">
            {pendingSeries} série{pendingSeries > 1 ? "s" : ""} · {pendingSamples} échantillon
            {pendingSamples > 1 ? "s" : ""}
            {queueTruncated ? ` · les ${pending.length} premières affichées` : ""}
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
