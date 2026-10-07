import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { validateReception, type ReceptionCandidate } from "@/lib/reception-input";
import { assignControlCode } from "@/lib/sample-code";
import { notifyDestroyed } from "@/lib/destruction-notice";

/**
 * Reception of a série in one go — WORKFLOW.md rule 4.
 *
 * One button, one transaction: every sample still `PRELEVE` gets its
 * N° de contrôle (yearly counter, locked), its temperature, quantity,
 * conformity with a coded motif and its technician; the série records who
 * received it and when. A non-conform sample the réceptionniste destroys is
 * received and numbered too (it prints on the bon de réception), then
 * cancelled in the same transaction with the motif DETRUIT_A_RECEPTION.
 * Either every sample is received or none is — two réceptionnistes on the
 * same série cannot half-number it (P2025 → 409).
 *
 * The two samples of a two-family line (« 2M », « 2P » — RETOUR-LABO-06-10.md
 * §5, V3) are received like any other, each with its own N° de contrôle,
 * microbiology first.
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
          code: true,
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
        orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
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
    code: s.code,
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

  // The old global switch (blockNonConformAtReception) is retired: each
  // non-conform sample is analysed or destroyed, case by case (slice E).
  const validation = validateReception(body, candidates, settings);
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, lineNumber: validation.lineNumber ?? null, ref: validation.ref ?? null },
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
                analysisBlocked: false,
                technicianId: line.technicianId,
                assignedAt: line.technicianId ? receivedAt : null,
                ...(line.destroy
                  ? { status: "ANNULE" as const, cancelledAt: receivedAt, cancelledById: session.id, cancelReason: "DETRUIT_A_RECEPTION" as const }
                  : {}),
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
                surfaceState: true,
                airMethod: true,
                personName: true,
                nature: { select: { label: true } },
                technician: { select: { id: true, name: true } },
                status: true,
                cancelReason: true,
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
            ref: line.ref,
            conformity: line.conformity,
            conformityReason: line.conformityReason,
            conformityNote: line.conformityNote,
            destroyed: line.destroy,
            receptionTemperature: line.receptionTemperature,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            checks: line.checks.filter((c) => c.level !== "OK"),
            technicianId: line.technicianId,
            technicianName: line.technicianId ? technicianName.get(line.technicianId) ?? null : null,
          },
        })
      ),
      // A destroyed sample is a cancellation like any other: its own entry.
      ...input.lines
        .filter((line) => line.destroy)
        .map((line) =>
          logAudit({
            actorId: session.id,
            action: "SAMPLE_CANCELLED",
            entity: "Sample",
            entityId: line.sampleId,
            metadata: {
              from: "RECU",
              to: "ANNULE",
              code: rows.find((r) => r.id === line.sampleId)?.code ?? null,
              controlCode: rows.find((r) => r.id === line.sampleId)?.controlCode ?? null,
              serialNumber: serie.serialNumber,
              reason: "DETRUIT_A_RECEPTION",
              note: line.conformityNote,
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
          destroyed: input.lines.filter((l) => l.destroy).map((l) => l.ref),
          arrivedAt: input.arrivedAt,
          coolerTemperature: input.coolerTemperature,
        },
      }),
    ]);

    // The client is told about the destroyed samples (Q35) — never at the
    // cost of the reception itself.
    const destruction = await notifyDestroyed(
      input.lines.filter((line) => line.destroy).map((line) => line.sampleId),
      session.id
    ).catch((error) => {
      console.error("[reception] destruction notice failed", { serieId: serie.id, error });
      return null;
    });

    return NextResponse.json({
      serie: { id: serie.id, serialNumber: serie.serialNumber, receivedAt },
      lines: rows,
      destruction,
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    // P2025: a sample left PRELEVE between our check and the write.
    if (code === "P2025") {
      return NextResponse.json(
        { error: "Un échantillon vient d'être réceptionné par quelqu'un d'autre — rechargez la série." },
        { status: 409 }
      );
    }
    console.error("[reception] failed to receive série", { serieId: serie.id, error });
    return NextResponse.json({ error: "Impossible de réceptionner la série." }, { status: 500 });
  }
}
