import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { SERIE_LAB_SELECT, serializeSerie } from "@/lib/serie-select";
import { serieStatus } from "@/lib/series";
import { receivedChecklists } from "@/lib/reception-audit";
import {
  SerieReceptionForm,
  type ReceptionSerieData,
} from "@/components/reception/SerieReceptionForm";

export const metadata = { title: "Réception de la série" };

export default async function SerieReceptionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Belt and braces with the layout guard: a page must be safe on its own.
  const session = await requireRole("RECEPTIONNISTE", "ADMIN");
  const { id } = await params;

  // No technician list: the reception assigns nobody (RETOUR-LABO-06-10.md
  // §9.3), the responsable des paramètres does at programming time. The
  // signed protocol's photo (C6) is counted, never read: « Voir » opens it.
  const [serie, settings, photos] = await Promise.all([
    prisma.serie.findUnique({ where: { id }, select: SERIE_LAB_SELECT }),
    getLabSettings(),
    prisma.serie.count({ where: { id, signedProtocolData: { not: null } } }),
  ]);

  if (!serie) notFound();

  // The checklist as decided at reception (A8): each received sample's
  // SAMPLE_RECEIVED entry — reception of a visit and deposit alike write it
  // on « Sample » / the sample's id. One bounded read on the journal's
  // [entity, entityId] index; newest first, the latest entry wins.
  const receivedIds = serie.samples.filter((s) => s.status !== "PRELEVE").map((s) => s.id);
  const entries =
    receivedIds.length === 0
      ? []
      : await prisma.auditLog.findMany({
          where: { entity: "Sample", entityId: { in: receivedIds }, action: "SAMPLE_RECEIVED" },
          select: { entityId: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: receivedIds.length * 3,
        });
  const decided = receivedChecklists(receivedIds, entries);

  const data = JSON.parse(
    JSON.stringify({ ...serializeSerie(serie, serieStatus(serie.samples)), hasSignedProtocol: photos > 0 })
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
        thresholds={settings}
        role={session.role}
        decided={decided}
        consultationRequired={settings.consultationRequired}
      />
    </div>
  );
}
