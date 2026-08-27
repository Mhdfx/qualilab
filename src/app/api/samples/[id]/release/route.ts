import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

/**
 * Releases a sample held at reception for non-conformity
 * (LabSettings.blockNonConformAtReception) into analysis.
 *
 * ADMIN only: blocking exists because the direction wants a say on
 * non-conform samples, so the direction is who lets one through. The release
 * is the assignment — the sample was received without a technician, and
 * giving it one is exactly what un-holds it.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const sample = await prisma.sample.findUnique({
    where: { id },
    select: { id: true, code: true, status: true, analysisBlocked: true },
  });

  if (!sample) {
    return NextResponse.json(
      { error: "Échantillon introuvable." },
      { status: 404 }
    );
  }

  if (!sample.analysisBlocked || sample.status !== "RECU") {
    return NextResponse.json(
      { error: "Cet échantillon n'est pas bloqué en réception." },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { technicianId } = (body ?? {}) as { technicianId?: unknown };
  if (typeof technicianId !== "string" || !technicianId) {
    return NextResponse.json(
      { error: "Veuillez choisir le technicien qui reprend l'analyse." },
      { status: 400 }
    );
  }

  const technician = await prisma.user.findUnique({
    where: { id: technicianId },
    select: { id: true, name: true, role: true, banned: true },
  });

  if (!technician || technician.role !== "TECHNICIEN" || technician.banned) {
    return NextResponse.json({ error: "Technicien invalide." }, { status: 400 });
  }

  const updated = await prisma.sample.update({
    // The guard doubles as optimistic concurrency: a second release finds
    // analysisBlocked already false and gets a clean 409 via P2025.
    where: { id: sample.id, analysisBlocked: true },
    data: {
      analysisBlocked: false,
      technicianId: technician.id,
      assignedAt: new Date(),
    },
    select: { id: true, code: true, analysisBlocked: true },
  }).catch((error) => {
    if ((error as { code?: string }).code === "P2025") return null;
    throw error;
  });

  if (!updated) {
    return NextResponse.json(
      { error: "Cet échantillon vient d'être libéré." },
      { status: 409 }
    );
  }

  await logAudit({
    actorId: session.id,
    action: "SAMPLE_RELEASED",
    entity: "Sample",
    entityId: sample.id,
    metadata: {
      code: sample.code,
      technicianId: technician.id,
      technicianName: technician.name,
    },
  });

  return NextResponse.json(updated);
}
