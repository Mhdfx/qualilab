import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateSampleCode } from "@/lib/sample-code";
import { retryOnDuplicate } from "@/lib/retry-unique";
import { sampleSelectFor } from "@/lib/sample-select";
import { pageParams, toPage } from "@/lib/pagination";
import { SAMPLE_TYPES } from "@/lib/parameter-validation";
import type { SampleType } from "@/generated/prisma/client";

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

export async function POST(request: Request) {
  const session = await requireApiRole("PRELEVEUR");
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const { clientId, lieu, type, notes, parameterIds } = body as {
      clientId: string;
      lieu: string;
      type: SampleType;
      notes?: string;
      parameterIds: string[];
    };

    if (type && !SAMPLE_TYPES.includes(type)) {
      return NextResponse.json({ error: "Domaine d'analyse invalide." }, { status: 400 });
    }
    if (typeof lieu === "string" && lieu.trim().length > 191) {
      return NextResponse.json(
        { error: "Le lieu de prélèvement est trop long (191 caractères maximum)." },
        { status: 400 }
      );
    }
    if (!clientId || !lieu || !type || !parameterIds?.length) {
      return NextResponse.json(
        { error: "Veuillez remplir tous les champs obligatoires." },
        { status: 400 }
      );
    }

    const sample = await retryOnDuplicate(async () =>
      prisma.sample.create({
      data: {
        code: await generateSampleCode(),
        clientId,
        userId: session.id,
        lieu,
        type,
        notes: notes || null,
        sampledAt: new Date(),
        status: "PRELEVE",
        parameters: {
          create: parameterIds.map((parameterId) => ({ parameterId })),
        },
      },
      select: sampleSelectFor(session.role),
      })
    );

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_CREATED",
      entity: "Sample",
      entityId: sample.id,
      metadata: { code: sample.code, type: sample.type, clientId },
    });

    return NextResponse.json(sample, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Impossible de créer le prélèvement." },
      { status: 500 }
    );
  }
}
