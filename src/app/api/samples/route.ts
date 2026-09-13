import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sampleSelectFor } from "@/lib/sample-select";
import { pageParams, toPage } from "@/lib/pagination";

/** The roles that work the sample circuit — stock and (future) portal do not. */
const CIRCUIT_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "TECHNICIEN",
  "VALIDATEUR",
  "GESTIONNAIRE",
  "COMPTABLE",
  "ADMIN",
] as const;

const STATUSES = [
  "PRELEVE",
  "RECU",
  "EN_ANALYSE",
  "RESULTATS_SAISIS",
  "VALIDE",
  "RAPPORT_ENVOYE",
] as const;

export async function GET(request: Request) {
  const session = await requireApiRole(...CIRCUIT_ROLES);
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const rawStatus = params.get("status");
  if (rawStatus && !(STATUSES as readonly string[]).includes(rawStatus)) {
    return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
  }
  const status = rawStatus as (typeof STATUSES)[number] | null;

  // A préleveur only ever sees their own field work; the lab roles see all.
  // The search runs in the database, not on the loaded page — otherwise a
  // code typed by the réceptionniste would only match the 50 newest samples.
  //
  // The préleveur's search deliberately excludes the laboratory numbering:
  // a hit on a serial number would tell them which of their samples carries
  // it, and the whole point of the blind numbering is that they cannot know.
  const searchable = [
    { code: { contains: q } },
    { serie: { serialNumber: { contains: q } } },
    { produit: { contains: q } },
    { numeroLot: { contains: q } },
    { lieu: { contains: q } },
    { client: { name: { contains: q } } },
    ...(session.role !== "PRELEVEUR"
      ? [
          { controlCode: { contains: q } },
          { serialNumber: { contains: q } },
        ]
      : []),
  ];

  const where = {
    ...(session.role === "PRELEVEUR" ? { userId: session.id } : {}),
    // A technician's bench is their own: the list API mirrors sample-access.
    ...(session.role === "TECHNICIEN" ? { technicianId: session.id } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: searchable } : {}),
  };

  // Never load the whole table: this list grows for the life of the laboratory.
  const { take, cursor, skip } = pageParams(request);

  const rows = await prisma.sample.findMany({
    where,
    // The préleveur's payload deliberately excludes the laboratory numbering.
    select: sampleSelectFor(session.role),
    orderBy: { createdAt: "desc" },
    take: take + 1,
    cursor,
    skip,
  });

  return NextResponse.json(toPage(rows, take));
}
