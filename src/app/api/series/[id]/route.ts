import { NextResponse } from "next/server";
import type { Cadre } from "@/generated/prisma/enums";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { CADRE_CHOICES, formatCadre, futureMessage } from "@/lib/labels";
import { prisma } from "@/lib/prisma";
import { serieSelectFor, serializeSerie } from "@/lib/serie-select";
import { arrivalChangeRefusal, arrivalRefusal } from "@/lib/serie-input";
import { serieStatus } from "@/lib/series";
import { IMAGE_DATA_URI, MAX_IMAGE_CHARS, canSeeProtocolPhoto } from "@/lib/protocol-photo-access";

// Never TECHNICIEN: a série names the client, the site and the interlocutor,
// and the bench works blind (as for the protocol photo).
const CIRCUIT_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "VALIDATEUR",
  "DIRECTION",
  "GESTIONNAIRE",
  "COMPTABLE",
  "ADMIN",
] as const;

/**
 * Whether the série carries a photo of its signed protocol (C6) — counted,
 * never read: the LongText is served alone by …/protocol-photo.
 */
async function hasSignedProtocol(id: string) {
  return (await prisma.serie.count({ where: { id, signedProtocolData: { not: null } } })) > 0;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole(...CIRCUIT_ROLES);
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  // The photo's existence only for the roles that may open it (never the bench).
  const showPhoto = canSeeProtocolPhoto(session.role);
  const [serie, photo] = await Promise.all([
    prisma.serie.findUnique({
      where: { id },
      select: serieSelectFor(session.role),
    }),
    showPhoto ? hasSignedProtocol(id) : Promise.resolve(false),
  ]);
  if (!serie) return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  if (session.role === "PRELEVEUR" && serie.createdBy.id !== session.id) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }
  return NextResponse.json({
    ...serializeSerie(serie, serieStatus(serie.samples)),
    ...(showPhoto ? { hasSignedProtocol: photo } : {}),
  });
}

/**
 * Header fields the préleveur completes after the sampling (end time,
 * arrival at the lab, cooler temperature, photo of the signed sheet, the
 * cadre and its precision), and that the réception may correct. The lines themselves are corrected through
 * the sample routes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const serie = await prisma.serie.findUnique({
    where: { id },
    select: {
      id: true,
      createdById: true,
      cadre: true,
      cadreNote: true,
      startedAt: true,
      endedAt: true,
      arrivedAt: true,
      receivedAt: true,
      serialNumber: true,
    },
  });
  if (!serie || (session.role === "PRELEVEUR" && serie.createdById !== session.id)) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const data: Record<string, unknown> = {};
  const fail = (error: string) => NextResponse.json({ error }, { status: 400 });

  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const date = (v: unknown): Date | null | "invalid" => {
    if (v === undefined) return "skip" as never;
    if (v === null || v === "") return null;
    const d = new Date(String(v));
    return Number.isNaN(d.getTime()) ? "invalid" : d;
  };

  const endedAt = date(input.endedAt);
  const arrivedAt = date(input.arrivedAt);
  if (endedAt === "invalid") return fail("L'heure de fin n'est pas valide.");
  if (arrivedAt === "invalid") return fail("L'heure d'arrivée n'est pas valide.");
  // Never in the future, as at creation (`validateSerie`, 5 min tolerance):
  // « 12345 » or « +010000-01-01 » read as dates past the DATETIME range (500).
  const latest = Date.now() + 5 * 60 * 1000;
  if (endedAt instanceof Date && endedAt.getTime() > latest) return fail(futureMessage("L'heure de fin"));
  if (arrivedAt instanceof Date && arrivedAt.getTime() > latest) return fail(futureMessage("L'heure d'arrivée"));

  const finalEnded = (endedAt as unknown) === "skip" ? serie.endedAt : (endedAt as Date | null);
  const finalArrived = (arrivedAt as unknown) === "skip" ? serie.arrivedAt : (arrivedAt as Date | null);
  if (finalEnded && finalEnded < serie.startedAt) return fail("L'heure de fin précède le début du prélèvement.");
  // Never before the end of the sampling — nor before its start when no end was typed.
  const arrivalProblem = finalArrived ? arrivalRefusal(finalArrived, serie.startedAt, finalEnded) : null;
  if (arrivalProblem) return fail(arrivalProblem);
  // The arrival is the report's « Date et heure de réception » (lot 1b) and
  // C1's end: a change of it is checked (`arrivalChangeRefusal`) — once the
  // série is received, the laboratory's only, never emptied, never after the
  // reception; 30 days back at most. Sent unchanged, it is not written.
  const arrivalChanged =
    (arrivedAt as unknown) !== "skip" && (finalArrived?.getTime() ?? null) !== (serie.arrivedAt?.getTime() ?? null);
  if (arrivalChanged) {
    const refusal = arrivalChangeRefusal({
      next: finalArrived,
      receivedAt: serie.receivedAt,
      byPreleveur: session.role === "PRELEVEUR",
    });
    if (refusal) return fail(refusal);
  }
  if ((endedAt as unknown) !== "skip") data.endedAt = endedAt;
  if (arrivalChanged) data.arrivedAt = finalArrived;

  if (input.coolerTemperature !== undefined) {
    if (input.coolerTemperature === null || input.coolerTemperature === "") data.coolerTemperature = null;
    else {
      const t = Number(String(input.coolerTemperature).replace(",", "."));
      if (!Number.isFinite(t) || t < -80 || t > 300) return fail("La température à l'arrivée doit être un nombre plausible.");
      data.coolerTemperature = Math.round(t * 10) / 10;
    }
  }

  for (const key of ["interlocutor", "clientReference"] as const) {
    if (input[key] !== undefined) {
      const v = text(input[key]);
      if (v.length > 191) return fail("Texte trop long (191 caractères maximum).");
      data[key] = v || null;
    }
  }
  if (input.notes !== undefined) data.notes = text(input.notes).slice(0, 2000) || null;

  if (input.signedProtocolData !== undefined) {
    const v = input.signedProtocolData;
    if (v === null || v === "") data.signedProtocolData = null;
    else if (typeof v !== "string" || v.length > MAX_IMAGE_CHARS || !IMAGE_DATA_URI.test(v)) {
      return fail("La photo du protocole doit être une image PNG, JPEG ou WebP de moins de 1,5 Mo.");
    } else data.signedProtocolData = v;
  }

  // Le cadre se corrige : par le préleveur tant que la série n'est pas
  // réceptionnée, par le laboratoire ensuite (retour du 19/09). Quatre
  // valeurs depuis le 07/10 ; la précision n'existe que pour « Autre ».
  let nextCadre = serie.cadre;
  if (input.cadre !== undefined) {
    if (typeof input.cadre !== "string" || !(CADRE_CHOICES as readonly string[]).includes(input.cadre)) {
      return fail("Cadre invalide.");
    }
    nextCadre = input.cadre as Cadre;
  }
  let nextNote = serie.cadreNote;
  if (input.cadreNote !== undefined) {
    if (input.cadreNote !== null && typeof input.cadreNote !== "string") return fail("Précision du cadre invalide.");
    const note = text(input.cadreNote);
    if (note.length > 191) return fail("La précision du cadre est trop longue (191 caractères maximum).");
    nextNote = note || null;
  }
  if (nextCadre !== "AUTRE") nextNote = null;
  const cadreChanged = nextCadre !== serie.cadre;
  const noteChanged = nextNote !== serie.cadreNote;
  if (cadreChanged || noteChanged) {
    if (session.role === "PRELEVEUR" && serie.receivedAt) {
      return fail("La série est réceptionnée : le laboratoire seul peut changer le cadre.");
    }
    if (cadreChanged) data.cadre = nextCadre;
    if (noteChanged) data.cadreNote = nextNote;
  }

  if (Object.keys(data).length === 0) return fail("Rien à modifier.");

  const updated = await prisma.serie.update({
    where: { id: serie.id },
    data,
    select: serieSelectFor(session.role),
  });

  await logAudit({
    actorId: session.id,
    action: "SERIE_UPDATED",
    entity: "Serie",
    entityId: serie.id,
    metadata: {
      serialNumber: serie.serialNumber,
      fields: Object.keys(data).filter((k) => k !== "signedProtocolData"),
      // Le cadre (Autre, Devis validé, BC, Convention) dit à quel titre la
      // série est analysée : la valeur avant/après est écrite en clair.
      cadre:
        cadreChanged || noteChanged
          ? { avant: formatCadre(serie.cadre, serie.cadreNote), apres: formatCadre(nextCadre, nextNote) }
          : undefined,
      // The arrival is printed on the report (lot 1b): before / after too.
      arrivedAt: arrivalChanged
        ? { avant: serie.arrivedAt?.toISOString() ?? null, apres: finalArrived?.toISOString() ?? null }
        : undefined,
      photo: "signedProtocolData" in data ? (data.signedProtocolData ? "ajoutée" : "retirée") : undefined,
    },
  });

  const photo =
    "signedProtocolData" in data ? Boolean(data.signedProtocolData) : await hasSignedProtocol(serie.id);
  return NextResponse.json({ ...serializeSerie(updated, serieStatus(updated.samples)), hasSignedProtocol: photo });
}
