import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { validateReception, type ReceptionCandidate } from "@/lib/reception-input";
import { assignControlCode } from "@/lib/sample-code";

/**
 * Reception of a série in one go — WORKFLOW.md rule 4.
 *
 * One button, one transaction: every line still `PRELEVE` gets its
 * N° de contrôle (yearly counter, locked), its temperature, quantity,
 * conformity with a coded motif and its technician; the série records who
 * received it and when. Either every line is received or none is — two
 * réceptionnistes on the same série cannot half-number it (P2025 → 409).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const serie = await prisma.serie.findUnique({
    where: { id },
    select: {
      id: true,
      serialNumber: true,
      arrivedAt: true,
      coolerTemperature: true,
      receivedAt: true,
      samples: {
        select: {
          id: true,
          lineNumber: true,
          status: true,
          lineKind: true,
          unitCount: true,
          quantity: true,
          quantityUnit: true,
          receptionTemperature: true,
          nature: { select: { family: true } },
          parameters: { select: { parameter: { select: { name: true } } } },
        },
        orderBy: { lineNumber: "asc" },
      },
    },
  });

  if (!serie) {
    return NextResponse.json({ error: "Série introuvable." }, { status: 404 });
  }
  if (!serie.samples.some((s) => s.status === "PRELEVE")) {
    return NextResponse.json({ error: "Cette série est déjà réceptionnée." }, { status: 409 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const settings = await getLabSettings();
  const candidates: ReceptionCandidate[] = serie.samples.map((s) => ({
    id: s.id,
    lineNumber: s.lineNumber,
    status: s.status,
    lineKind: s.lineKind,
    family: s.nature.family,
    parameterNames: s.parameters.map((p) => p.parameter.name),
    quantity: s.quantity === null ? null : Number(s.quantity),
    quantityUnit: s.quantityUnit,
    receptionTemperature: s.receptionTemperature,
    unitCount: s.unitCount,
  }));

  const validation = validateReception(body, candidates, settings, {
    blockNonConform: settings.blockNonConformAtReception,
  });
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, lineNumber: validation.lineNumber ?? null },
      { status: 400 }
    );
  }
  const input = validation.value;

  // Every technician named must exist and be active — one query for all.
  const technicianIds = [
    ...new Set(input.lines.map((l) => l.technicianId).filter((t): t is string => t !== null)),
  ];
  const technicians =
    technicianIds.length === 0
      ? []
      : await prisma.user.findMany({
          where: { id: { in: technicianIds }, role: "TECHNICIEN", banned: { not: true } },
          select: { id: true, name: true },
        });
  if (technicians.length !== technicianIds.length) {
    return NextResponse.json({ error: "Technicien invalide." }, { status: 400 });
  }
  const technicianName = new Map(technicians.map((t) => [t.id, t.name]));

  const receivedAt = new Date();
  const year = receivedAt.getFullYear();

  try {
    const rows = await prisma.$transaction(
      async (tx) => {
        const received = [];
        for (const line of input.lines) {
          // The counter row stays locked until the série is written: two
          // receptions can never share a N° de contrôle.
          const controlCode = await assignControlCode(tx, year);
          received.push(
            await tx.sample.update({
              // Re-checking the status makes the write atomic against a
              // second réceptionniste handling the same série right now.
              where: { id: line.sampleId, status: "PRELEVE" },
              data: {
                controlCode,
                status: "RECU",
                receivedById: session.id,
                receivedAt,
                receptionTemperature: line.receptionTemperature,
                ...(line.quantity !== null
                  ? { quantity: line.quantity, quantityUnit: line.quantityUnit }
                  : {}),
                conformity: line.conformity,
                conformityReason: line.conformityReason,
                conformityNote: line.conformityNote,
                analysisBlocked: line.analysisBlocked,
                technicianId: line.technicianId,
                assignedAt: line.technicianId ? receivedAt : null,
              },
              select: {
                id: true,
                code: true,
                lineNumber: true,
                controlCode: true,
                unitCount: true,
                conformity: true,
                conformityReason: true,
                analysisBlocked: true,
                produit: true,
                surfaceLabel: true,
                personName: true,
                nature: { select: { label: true } },
                technician: { select: { id: true, name: true } },
              },
            })
          );
        }

        await tx.serie.update({
          where: { id: serie.id },
          data: {
            // The série is received from its first line onwards; a later
            // reception of remaining lines keeps the original stamp.
            ...(serie.receivedAt ? {} : { receivedById: session.id, receivedAt }),
            ...(input.arrivedAt
              ? { arrivedAt: input.arrivedAt }
              : serie.arrivedAt
                ? {}
                : { arrivedAt: receivedAt }),
            ...(input.coolerTemperature !== null ? { coolerTemperature: input.coolerTemperature } : {}),
          },
        });

        return received;
      },
      { timeout: 20_000 }
    );

    await Promise.all([
      ...input.lines.map((line, index) =>
        logAudit({
          actorId: session.id,
          action: "SAMPLE_RECEIVED",
          entity: "Sample",
          entityId: line.sampleId,
          metadata: {
            from: "PRELEVE",
            to: "RECU",
            code: rows[index].code,
            controlCode: rows[index].controlCode,
            serialNumber: serie.serialNumber,
            lineNumber: line.lineNumber,
            conformity: line.conformity,
            conformityReason: line.conformityReason,
            conformityNote: line.conformityNote,
            analysisBlocked: line.analysisBlocked,
            receptionTemperature: line.receptionTemperature,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            checks: line.checks.filter((c) => c.level !== "OK"),
            technicianId: line.technicianId,
            technicianName: line.technicianId ? technicianName.get(line.technicianId) ?? null : null,
          },
        })
      ),
      logAudit({
        actorId: session.id,
        action: "SERIE_RECEIVED",
        entity: "Serie",
        entityId: serie.id,
        metadata: {
          serialNumber: serie.serialNumber,
          lines: rows.length,
          controlCodes: rows.map((r) => r.controlCode),
          arrivedAt: input.arrivedAt,
          coolerTemperature: input.coolerTemperature,
        },
      }),
    ]);

    return NextResponse.json({
      serie: { id: serie.id, serialNumber: serie.serialNumber, receivedAt },
      lines: rows,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    // P2025: a line left PRELEVE between our check and the write.
    if (code === "P2025") {
      return NextResponse.json(
        { error: "Une ligne vient d'être réceptionnée par quelqu'un d'autre — rechargez la série." },
        { status: 409 }
      );
    }
    console.error("[reception] failed to receive série", { serieId: serie.id, error });
    return NextResponse.json({ error: "Impossible de réceptionner la série." }, { status: 500 });
  }
}
