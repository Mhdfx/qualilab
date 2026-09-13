import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { SERIE_LAB_SELECT, serializeSerie } from "@/lib/serie-select";
import { serieStatus } from "@/lib/series";
import {
  SerieReceptionForm,
  type ReceptionSerieData,
} from "@/components/reception/SerieReceptionForm";
import type { TechnicianOption } from "@/components/reception/types";

export const metadata = { title: "Réception de la série" };

export default async function SerieReceptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("RECEPTIONNISTE", "ADMIN");
  const { id } = await params;

  const [serie, technicians, workload, settings] = await Promise.all([
    prisma.serie.findUnique({ where: { id }, select: SERIE_LAB_SELECT }),
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
    getLabSettings(),
  ]);

  if (!serie) notFound();

  const loadByTechnician = new Map(
    workload.map((row) => [row.technicianId, row._count._all])
  );
  const technicianOptions: TechnicianOption[] = technicians
    .map((technician) => ({
      id: technician.id,
      name: technician.name,
      load: loadByTechnician.get(technician.id) ?? 0,
    }))
    .sort((a, b) => a.load - b.load || a.name.localeCompare(b.name, "fr"));

  const data = JSON.parse(
    JSON.stringify(serializeSerie(serie, serieStatus(serie.samples)))
  ) as ReceptionSerieData;

  return (
    <div>
      <Link
        href="/reception"
        className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 transition hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        File de réception
      </Link>
      <SerieReceptionForm
        serie={data}
        technicians={technicianOptions}
        thresholds={settings}
        blockNonConform={settings.blockNonConformAtReception}
        role={session.role}
      />
    </div>
  );
}
