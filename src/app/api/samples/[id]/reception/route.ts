import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateReceptionNumbers } from "@/lib/sample-code";
import { canTransition } from "@/lib/sample-status";
import { getLabSettings } from "@/lib/lab-settings";

/**
 * Reception of a sample at the laboratory: `PRELEVE → RECU`.
 *
 * This single action does four things that must succeed or fail together:
 * records who received it, states its conformity, assigns the technician, and
 * mints the official numbering (control code + blind serial number). The
 * numbering is created *here* and nowhere else — a sample carries no
 * laboratory number until it physically reaches the lab.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const sample = await prisma.sample.findUnique({
    where: { id },
    select: { id: true, code: true, status: true },
  });

  if (!sample) {
    return NextResponse.json(
      { error: "Échantillon introuvable." },
      { status: 404 }
    );
  }

  // The state machine is the only authority on whether this move is legal.
  const transition = canTransition(sample.status, "RECU", session.role);
  if (!transition.ok) {
    return NextResponse.json({ error: transition.error }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { conformity, conformityNote, technicianId, produit, numeroLot } =
    (body ?? {}) as {
      conformity?: unknown;
      conformityNote?: unknown;
      technicianId?: unknown;
      produit?: unknown;
      numeroLot?: unknown;
    };

  if (typeof conformity !== "boolean") {
    return NextResponse.json(
      { error: "Veuillez indiquer la conformité de l'échantillon." },
      { status: 400 }
    );
  }

  const note =
    typeof conformityNote === "string" ? conformityNote.trim() : "";

  // A non-conformity without a reason would be untraceable.
  if (!conformity && !note) {
    return NextResponse.json(
      { error: "Le motif est obligatoire pour une non-conformité." },
      { status: 400 }
    );
  }

  // Pending client decision n°10 (LabSettings): when the lab blocks
  // non-conform samples, this one is received — numbered, traced — but held
  // unassigned until an ADMIN releases it to a technician.
  const settings = await getLabSettings();
  const blocked = settings.blockNonConformAtReception && !conformity;

  let technician: { id: string; name: string } | null = null;
  if (!blocked) {
    if (typeof technicianId !== "string" || !technicianId) {
      return NextResponse.json(
        { error: "Veuillez attribuer l'échantillon à un technicien." },
        { status: 400 }
      );
    }

    const found = await prisma.user.findUnique({
      where: { id: technicianId },
      select: { id: true, name: true, role: true, banned: true },
    });

    if (!found || found.role !== "TECHNICIEN" || found.banned) {
      return NextResponse.json(
        { error: "Technicien invalide." },
        { status: 400 }
      );
    }
    technician = { id: found.id, name: found.name };
  }

  const receivedAt = new Date();

  // Retry only guards against the improbable case of two receptions minting the
  // same number concurrently; the unique constraints are the real safety net.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const numbers = await generateReceptionNumbers();

    try {
      const updated = await prisma.sample.update({
        // Re-checking the status here makes the write itself atomic against a
        // second réceptionniste handling the same sample at the same moment.
        where: { id: sample.id, status: "PRELEVE" },
        data: {
          controlCode: numbers.controlCode,
          serialNumber: numbers.serialNumber,
          status: "RECU",
          receivedById: session.id,
          receivedAt,
          conformity,
          conformityNote: note || null,
          analysisBlocked: blocked,
          produit: typeof produit === "string" && produit.trim() ? produit.trim() : null,
          numeroLot: typeof numeroLot === "string" && numeroLot.trim() ? numeroLot.trim() : null,
          technicianId: technician?.id ?? null,
          assignedAt: technician ? receivedAt : null,
        },
        select: {
          id: true,
          code: true,
          controlCode: true,
          serialNumber: true,
          status: true,
          conformity: true,
          analysisBlocked: true,
        },
      });

      await logAudit({
        actorId: session.id,
        action: "SAMPLE_RECEIVED",
        entity: "Sample",
        entityId: updated.id,
        metadata: {
          from: "PRELEVE",
          to: "RECU",
          code: updated.code,
          controlCode: updated.controlCode,
          conformity,
          conformityNote: note || null,
          analysisBlocked: blocked,
          produit: typeof produit === "string" && produit.trim() ? produit.trim() : null,
          numeroLot: typeof numeroLot === "string" && numeroLot.trim() ? numeroLot.trim() : null,
          technicianId: technician?.id ?? null,
          technicianName: technician?.name ?? null,
        },
      });

      return NextResponse.json(updated);
    } catch (error) {
      const code = (error as { code?: string }).code;

      // P2025: the sample left PRELEVE between our check and the write.
      if (code === "P2025") {
        return NextResponse.json(
          { error: "Cet échantillon vient d'être réceptionné." },
          { status: 409 }
        );
      }

      // P2002: numbering collision — draw a new pair and try again.
      if (code === "P2002" && attempt < 2) continue;

      console.error("[reception] failed to receive sample", {
        sampleId: sample.id,
        error,
      });
      return NextResponse.json(
        { error: "Impossible de réceptionner l'échantillon." },
        { status: 500 }
      );
    }
  }

  return NextResponse.json(
    { error: "Impossible d'attribuer un numéro unique. Réessayez." },
    { status: 500 }
  );
}
