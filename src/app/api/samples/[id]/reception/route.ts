import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { assignControlCode } from "@/lib/sample-code";
import { canTransition } from "@/lib/sample-status";
import { getLabSettings } from "@/lib/lab-settings";

/**
 * Reception of a sample at the laboratory: `PRELEVE → RECU`.
 *
 * This single action does four things that must succeed or fail together:
 * records who received it, states its conformity, assigns the technician, and
 * draws the official N° de contrôle (« 20353/26 », yearly counter). The number
 * is drawn *here*, inside the same transaction as the status change, and
 * nowhere else — a sample carries no laboratory number until it physically
 * reaches the lab.
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

  const { conformity, conformityNote, technicianId, produit, numeroLot, receptionTemperature } =
    (body ?? {}) as {
      conformity?: unknown;
      conformityNote?: unknown;
      technicianId?: unknown;
      produit?: unknown;
      numeroLot?: unknown;
      receptionTemperature?: unknown;
    };

  let temperature: number | null = null;
  if (receptionTemperature !== undefined && receptionTemperature !== null && receptionTemperature !== "") {
    const t = Number(String(receptionTemperature).replace(",", "."));
    if (!Number.isFinite(t) || t < -80 || t > 300) {
      return NextResponse.json(
        { error: "La température à l'arrivée doit être un nombre plausible." },
        { status: 400 }
      );
    }
    temperature = Math.round(t * 10) / 10;
  }

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
  const cleanProduit = typeof produit === "string" && produit.trim() ? produit.trim() : null;
  const cleanLot = typeof numeroLot === "string" && numeroLot.trim() ? numeroLot.trim() : null;

  {
    try {
      // One transaction: the counter row is locked until the sample is
      // written, so two receptions can never share a N° de contrôle.
      const updated = await prisma.$transaction(async (tx) => {
        const controlCode = await assignControlCode(tx, receivedAt.getFullYear());
        const row = await tx.sample.update({
          // Re-checking the status here makes the write itself atomic against a
          // second réceptionniste handling the same sample at the same moment.
          where: { id: sample.id, status: "PRELEVE" },
          data: {
            controlCode,
            status: "RECU",
            receivedById: session.id,
            receivedAt,
            receptionTemperature: temperature,
            conformity,
            conformityNote: note || null,
            analysisBlocked: blocked,
            // The line already carries what the préleveur wrote; the
            // réception only overwrites what it actually typed.
            ...(cleanProduit ? { produit: cleanProduit } : {}),
            ...(cleanLot ? { numeroLot: cleanLot } : {}),
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
            serieId: true,
            produit: true,
            numeroLot: true,
          },
        });
        // The série is « received » from its first line onwards.
        await tx.serie.updateMany({
          where: { id: row.serieId, receivedAt: null },
          data: { receivedById: session.id, receivedAt },
        });
        return row;
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
          produit: updated.produit,
          numeroLot: updated.numeroLot,
          receptionTemperature: temperature,
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
}
