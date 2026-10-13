import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getLabSettings } from "@/lib/lab-settings";
import { validateReception, type ReceptionCandidate } from "@/lib/reception-input";
import { parameterSpellings } from "@/lib/reception-rules";
import { assignControlCode } from "@/lib/sample-code";
import { notifyDestroyed } from "@/lib/destruction-notice";
import { canTransition } from "@/lib/sample-status";

/** A sample of the série is no longer PRELEVE at the write: rolls the série back, then the 409. */
class StaleReception extends Error {}

/**
 * Reception of a série in one go — WORKFLOW.md rule 4.
 *
 * One button, one transaction: every sample still `PRELEVE` gets its
 * N° de contrôle (yearly counter, locked), its temperature, quantity and
 * conformity with a coded motif; the série records who received it and when.
 * No technician (RETOUR-LABO-06-10.md §9.3): once programmed, the sample
 * waits in « À prendre » until a technician takes it (prise en charge
 * libre, PROGRAMME.md §10) — a `technicianId` still sent by an old page is
 * ignored (`validateReception`), and `Sample.technicianId` is never written
 * here. A non-conform sample the réceptionniste destroys is
 * received and numbered too (it prints on the bon de réception), then
 * cancelled in the same transaction with the motif DETRUIT_A_RECEPTION.
 * Either every sample is received or none is — two réceptionnistes on the
 * same série cannot half-number it (`StaleReception` → 409).
 *
 * The two samples of a two-family line (« 2M », « 2P » — RETOUR-LABO-06-10.md
 * §5, V3) are received like any other, each with its own N° de contrôle,
 * microbiology first.
 *
 * The eight rules of the bon de réception are a checklist (retour du 08/10,
 * rule (8) since 12/10):
 * rule (1) — exploitable or not — is answered for every sample and stored on
 * it (`receptionExploitable`); the whole checklist, recomputed here with the
 * laboratory's thresholds, goes to the SAMPLE_RECEIVED audit. Histamine and
 * Salmonella are recognised on the analyses' names and aliases.
 *
 * The contrôles complémentaires (hors bon) ride along: C3 (emballage) and C5
 * (identification) are ticked for every sample and stored on it; the coded
 * rows go to the same audit entry, beside the checklist. C6, the signed
 * protocol of a visit, is answered once for the série (`Serie.
 * signedProtocolReceived`, null when a photo is attached) and journalled in
 * SERIE_RECEIVED.
 *
 * A non-conform sample may also wait for the client's opinion (« En attente
 * du client », A9): received and numbered like the others (RECU), held
 * (`analysisBlocked`, `awaitingClientSince`) until the reception or the admin
 * releases it (`POST /api/samples/[id]/release`). An analysis decided with
 * the client's agreement records it (`clientConsulted*`, CLIENT_CONSULTED);
 * the laboratory may require it (`LabSettings.consultationRequired`).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const [serie, photos] = await Promise.all([
    prisma.serie.findUnique({
      where: { id },
      select: {
        id: true,
        kind: true,
        serialNumber: true,
        startedAt: true,
        endedAt: true,
        samplingTimeDeclared: true,
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
            // C7: the DLC of a food sample, against the day of reception.
            expiryDate: true,
            // Rule (8): live bivalve molluscs are recognised on these names.
            produit: true,
            productType: { select: { name: true } },
            nature: { select: { family: true, label: true } },
            parameters: { select: { parameter: { select: { name: true, aliases: true } } } },
          },
          orderBy: [{ lineNumber: "asc" }, { code: "asc" }],
        },
      },
    }),
    // C6: whether a photo of the signed protocol is attached — counted, never read.
    prisma.serie.count({ where: { id, signedProtocolData: { not: null } } }),
  ]);
  const hasSignedProtocol = photos > 0;

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
    parameterNames: s.parameters.flatMap((p) => parameterSpellings(p.parameter)),
    quantity: s.quantity === null ? null : Number(s.quantity),
    quantityUnit: s.quantityUnit,
    receptionTemperature: s.receptionTemperature,
    unitCount: s.unitCount,
    expiryDate: s.expiryDate,
    productNames: [s.produit, s.productType?.name, s.nature.label],
  }));

  // The old global switch (blockNonConformAtReception) is retired: each
  // non-conform sample is analysed, held for the client or destroyed, case
  // by case (slice E, A9). One instant for the whole reception: C1's « now »
  // and the stamp written.
  const receivedAt = new Date();
  const validation = validateReception(
    body,
    candidates,
    settings,
    {
      startedAt: serie.startedAt,
      endedAt: serie.endedAt,
      arrivedAt: serie.arrivedAt,
      samplingTimeDeclared: serie.samplingTimeDeclared,
      receivedAt,
      kind: serie.kind,
      hasSignedProtocol,
    },
    { consultationRequired: settings.consultationRequired }
  );
  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.error, lineNumber: validation.lineNumber ?? null, ref: validation.ref ?? null },
      { status: 400 }
    );
  }
  const input = validation.value;

  // Every status written below, checked by the state machine first.
  for (const line of input.lines) {
    const steps = line.destroy ? (["RECU", "ANNULE"] as const) : (["RECU"] as const);
    let from: "PRELEVE" | "RECU" = "PRELEVE";
    for (const to of steps) {
      const transition = canTransition(from, to, session.role);
      if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: 403 });
      from = "RECU";
    }
  }

  const year = receivedAt.getFullYear();

  try {
    const rows = await prisma.$transaction(
      async (tx) => {
        const received = [];
        for (const line of input.lines) {
          // The counter row stays locked until the série is written: two
          // receptions can never share a N° de contrôle.
          const controlCode = await assignControlCode(tx, year);
          // Re-checking the status in the UPDATE itself makes the write
          // atomic against a second réceptionniste handling the same série,
          // or a « Annuler » of one of its samples, right now: 0 rows
          // changed rolls the whole série back (no number burnt).
          const moved = await tx.sample.updateMany({
            where: { id: line.sampleId, status: "PRELEVE" },
            data: {
              controlCode,
              status: "RECU",
              receivedById: session.id,
              receivedAt,
              receptionTemperature: line.receptionTemperature,
              receptionTemperatureSource: line.temperatureSource,
              storageClass: line.storageClass,
              ...(line.quantity !== null
                ? { quantity: line.quantity, quantityUnit: line.quantityUnit }
                : {}),
              receptionExploitable: line.exploitable,
              receptionPackagingOk: line.packagingOk,
              receptionIdentificationOk: line.identificationOk,
              conformity: line.conformity,
              conformityReason: line.conformityReason,
              conformityNote: line.conformityNote,
              receptionNote: line.receptionNote,
              // A9: « En attente du client » holds the sample until it is released.
              analysisBlocked: line.awaitClient,
              awaitingClientSince: line.awaitClient ? receivedAt : null,
              ...(line.consultation
                ? {
                    clientConsultedAt: line.consultation.at,
                    clientConsultedName: line.consultation.name,
                    clientConsultationChannel: line.consultation.channel,
                    clientConsultationNote: line.consultation.note,
                  }
                : {}),
              ...(line.destroy
                ? { status: "ANNULE" as const, cancelledAt: receivedAt, cancelledById: session.id, cancelReason: "DETRUIT_A_RECEPTION" as const }
                : {}),
            },
          });
          if (moved.count === 0) throw new StaleReception();
          received.push(
            await tx.sample.findUniqueOrThrow({
              where: { id: line.sampleId },
              select: {
                id: true,
                code: true,
                lineNumber: true,
                controlCode: true,
                unitCount: true,
                conformity: true,
                conformityReason: true,
                receptionNote: true,
                analysisBlocked: true,
                awaitingClientSince: true,
                produit: true,
                surfaceLabel: true,
                surfaceState: true,
                airMethod: true,
                personName: true,
                nature: { select: { label: true } },
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
            // C6, a visit only: the answer (null with a photo, or unanswered).
            ...(serie.kind === "VISITE" ? { signedProtocolReceived: input.signedProtocolReceived } : {}),
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
            exploitable: line.exploitable,
            conformity: line.conformity,
            conformityReason: line.conformityReason,
            conformityNote: line.conformityNote,
            // A7: the observation — the justification of an accepted doubt.
            receptionNote: line.receptionNote,
            destroyed: line.destroy,
            // A9: the decision, and the client's agreement when recorded.
            decision: line.decision,
            consultation: line.consultation,
            receptionTemperature: line.receptionTemperature,
            temperatureSource: line.temperatureSource,
            storageClass: line.storageClass,
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            checks: line.checks.filter((c) => c.level !== "OK"),
            // The eight rules of the bon, as received (retour du 08/10, 12/10).
            checklist: line.checklist,
            // The contrôles complémentaires (hors bon), C1 … C7, as received.
            complementary: line.complementary,
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
      // A9: a sample held for the client's opinion, and an analysis agreed with the client.
      ...input.lines
        .filter((line) => line.awaitClient)
        .map((line) =>
          logAudit({
            actorId: session.id,
            action: "SAMPLE_AWAITING_CLIENT",
            entity: "Sample",
            entityId: line.sampleId,
            metadata: {
              serialNumber: serie.serialNumber,
              ref: line.ref,
              controlCode: rows.find((r) => r.id === line.sampleId)?.controlCode ?? null,
              conformityReason: line.conformityReason,
              since: receivedAt,
            },
          })
        ),
      ...input.lines
        .filter((line) => line.consultation)
        .map((line) =>
          logAudit({
            actorId: session.id,
            action: "CLIENT_CONSULTED",
            entity: "Sample",
            entityId: line.sampleId,
            metadata: {
              serialNumber: serie.serialNumber,
              ref: line.ref,
              decision: "ANALYSER",
              name: line.consultation?.name,
              channel: line.consultation?.channel,
              at: line.consultation?.at,
              note: line.consultation?.note,
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
          awaitingClient: input.lines.filter((l) => l.awaitClient).map((l) => l.ref),
          arrivedAt: input.arrivedAt,
          coolerTemperature: input.coolerTemperature,
          // C6 — the signed protocol of a visit: a photo, or the paper answer.
          signedProtocol:
            serie.kind === "VISITE" ? { photo: hasSignedProtocol, received: input.signedProtocolReceived } : undefined,
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
      // Each line with the checklist as decided — the summary shows it at once (A8).
      lines: rows.map((row, index) => ({
        ...row,
        checklist: input.lines[index].checklist,
        complementary: input.lines[index].complementary,
      })),
      destruction,
    });
  } catch (error) {
    // A sample left PRELEVE between our check and the write.
    if (error instanceof StaleReception) {
      return NextResponse.json(
        { error: "Un échantillon de la série vient d'être réceptionné ou annulé par quelqu'un d'autre — rechargez la série." },
        { status: 409 }
      );
    }
    console.error("[reception] failed to receive série", { serieId: serie.id, error });
    return NextResponse.json({ error: "Impossible de réceptionner la série." }, { status: 500 });
  }
}
