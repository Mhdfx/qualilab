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
  // §9.3), the responsable des paramètres does at programming time.
  const [serie, settings] = await Promise.all([
    prisma.serie.findUnique({ where: { id }, select: SERIE_LAB_SELECT }),
    getLabSettings(),
  ]);

  if (!serie) notFound();

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
        thresholds={settings}
        role={session.role}
      />
    </div>
  );
}
