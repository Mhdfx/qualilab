import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { decodeImageDataUri, protocolPhotoAccess } from "@/lib/protocol-photo-access";

/**
 * The photo of the signed paper protocol of a visit (C6), as the préleveur
 * took it — the only place `Serie.signedProtocolData` is read back. Lists and
 * pages never select that column; they ask whether a photo exists
 * (`prisma.serie.count`) and link here.
 *
 * Never the technician (blind bench), nor the roles outside the sampling, its
 * reception and its validation (`protocolPhotoAccess`). A préleveur gets
 * their own visits only, with the 404 of `GET /api/series/[id]`. Every view is
 * journalled; the image is never cached (`private, no-store`).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const serie = await prisma.serie.findUnique({
    where: { id },
    select: { id: true, serialNumber: true, createdById: true, signedProtocolData: true },
  });

  const access = serie ? protocolPhotoAccess(session, serie) : "NOT_FOUND";
  if (access === "FORBIDDEN") return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  if (!serie || access === "NOT_FOUND") return NextResponse.json({ error: "Série introuvable." }, { status: 404 });

  const image = decodeImageDataUri(serie.signedProtocolData);
  if (!image) {
    if (serie.signedProtocolData) {
      // Stored but not one of the accepted images: never served as such.
      console.error("[protocol-photo] unreadable stored photo", { serieId: serie.id });
    }
    return NextResponse.json({ error: "Aucune photo du protocole signé pour cette série." }, { status: 404 });
  }

  await logAudit({
    actorId: session.id,
    action: "SERIE_PHOTO_VIEWED",
    entity: "Serie",
    entityId: serie.id,
    metadata: { serialNumber: serie.serialNumber, contentType: image.contentType },
  });

  return new NextResponse(new Uint8Array(image.bytes), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.bytes.length),
      "Content-Disposition": `inline; filename="protocole-signe-${serie.serialNumber.replace("/", "-")}.${image.extension}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
