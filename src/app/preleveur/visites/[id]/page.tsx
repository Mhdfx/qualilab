import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SERIE_FIELD_SELECT, serializeSerie } from "@/lib/serie-select";
import { serieStatus } from "@/lib/series";
import { VisitDetail, type VisitData } from "@/components/preleveur/VisitDetail";

export const metadata = { title: "Visite" };

export default async function VisitePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("PRELEVEUR");
  const { id } = await params;

  // The préleveur's own visits only — and never the laboratory numbering
  // (SERIE_FIELD_SELECT has no controlCode).
  const serie = await prisma.serie.findUnique({
    where: { id },
    select: SERIE_FIELD_SELECT,
  });
  if (!serie || serie.createdBy.id !== session.id) notFound();

  const data = JSON.parse(
    JSON.stringify(serializeSerie(serie, serieStatus(serie.samples)))
  ) as VisitData;

  return <VisitDetail visit={data} />;
}
