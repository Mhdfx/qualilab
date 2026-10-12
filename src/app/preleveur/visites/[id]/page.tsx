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
  // (SERIE_FIELD_SELECT has no controlCode). The photo of the signed
  // protocol is counted, never read here: « Voir » opens …/protocol-photo.
  const [serie, photos] = await Promise.all([
    prisma.serie.findUnique({
      where: { id },
      select: SERIE_FIELD_SELECT,
    }),
    prisma.serie.count({ where: { id, signedProtocolData: { not: null } } }),
  ]);
  if (!serie || serie.createdBy.id !== session.id) notFound();

  const data = JSON.parse(
    JSON.stringify({ ...serializeSerie(serie, serieStatus(serie.samples)), hasSignedProtocol: photos > 0 })
  ) as VisitData;

  return <VisitDetail visit={data} />;
}
