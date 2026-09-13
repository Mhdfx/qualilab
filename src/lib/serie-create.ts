import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { nextNumber } from "./counters";
import { logAudit } from "./audit";
import { sampleCodeFor } from "./sample-code";
import { normalizeLabel, type CleanSerie } from "./serie-input";
import type { Role } from "./roles";

/**
 * Creating a série with all its lines — ONE transaction (WORKFLOW.md, rule 4).
 *
 * The N° de série is drawn inside the transaction, so a failed creation
 * never burns a number. A deposit (kind DEPOT) is received on the spot: its
 * lines are born RECU with their N° de contrôle; a visit's lines are born
 * PRELEVE and get theirs at reception.
 *
 * Places and products are memorised per client: the same label, however it
 * is capitalised or accented, always resolves to the same row, so the
 * history of « Poste salades » or « Salade Gaillardière » stays comparable.
 */

export type CreateSerieResult = {
  id: string;
  serialNumber: string;
  kind: CleanSerie["kind"];
  sampleIds: string[];
};

export class SerieCreationError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) {
    super(message);
  }
}

async function resolveProduct(tx: Prisma.TransactionClient, clientId: string, label: string) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return null;
  const existing = await tx.clientProduct.findUnique({
    where: { clientId_normalizedLabel: { clientId, normalizedLabel } },
    select: { id: true },
  });
  if (existing) {
    await tx.clientProduct.update({
      where: { id: existing.id },
      data: { usageCount: { increment: 1 }, active: true },
    });
    return existing.id;
  }
  const created = await tx.clientProduct.create({
    data: { clientId, label, normalizedLabel, usageCount: 1 },
    select: { id: true },
  });
  return created.id;
}

async function resolvePlace(
  tx: Prisma.TransactionClient,
  clientId: string,
  siteId: string | null,
  label: string
) {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return null;
  const existing = await tx.clientPlace.findFirst({
    where: { clientId, siteId, normalizedLabel },
    select: { id: true },
  });
  if (existing) {
    await tx.clientPlace.update({
      where: { id: existing.id },
      data: { usageCount: { increment: 1 }, active: true },
    });
    return existing.id;
  }
  const created = await tx.clientPlace.create({
    data: { clientId, siteId, label, normalizedLabel, usageCount: 1 },
    select: { id: true },
  });
  return created.id;
}

export async function createSerie(
  input: CleanSerie,
  actor: { id: string; role: Role }
): Promise<CreateSerieResult> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, archived: true, sites: { select: { id: true }, where: { active: true } } },
  });
  if (!client || client.archived) throw new SerieCreationError("Client introuvable ou archivé.", 404);

  const siteId = input.siteId;
  if (siteId && !client.sites.some((s) => s.id === siteId)) {
    throw new SerieCreationError("Ce site n'appartient pas à ce client.");
  }
  if (!siteId && client.sites.length > 0 && input.kind === "VISITE") {
    throw new SerieCreationError("Choisissez le site de prélèvement de ce client.");
  }

  const natureIds = [...new Set(input.lines.map((l) => l.natureId))];
  const natures = await prisma.analysisNature.findMany({
    where: { id: { in: natureIds }, active: true },
    select: { id: true, legacyType: true },
  });
  const natureById = new Map(natures.map((n) => [n.id, n]));
  for (const line of input.lines) {
    if (!natureById.has(line.natureId)) throw new SerieCreationError("Nature d'analyse inconnue.");
  }

  const parameterIds = [...new Set(input.lines.flatMap((l) => l.parameterIds))];
  const known = await prisma.analysisParameter.findMany({
    where: { id: { in: parameterIds } },
    select: { id: true },
  });
  if (known.length !== parameterIds.length) {
    throw new SerieCreationError("Une des analyses demandées n'existe pas.");
  }

  const now = new Date();
  const year = now.getFullYear();
  const isDeposit = input.kind === "DEPOT";

  const result = await prisma.$transaction(async (tx) => {
    const serial = await nextNumber(tx, "SERIE", year);

    const serie = await tx.serie.create({
      data: {
        kind: input.kind,
        serialNumber: serial.formatted,
        year,
        clientId: client.id,
        siteId,
        interlocutor: input.interlocutor,
        samplerKind: input.samplerKind,
        samplerUserId: input.samplerKind === "QUALILAB" ? actor.id : null,
        samplerName: input.samplerKind === "QUALILAB" ? null : input.samplerName,
        cadre: input.cadre,
        clientReference: input.clientReference,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        arrivedAt: isDeposit ? (input.arrivedAt ?? now) : input.arrivedAt,
        coolerTemperature: input.coolerTemperature,
        notes: input.notes,
        createdById: actor.id,
        receivedById: isDeposit ? actor.id : null,
        receivedAt: isDeposit ? now : null,
      },
      select: { id: true, serialNumber: true },
    });

    const sampleIds: string[] = [];
    for (const [index, line] of input.lines.entries()) {
      const lineNumber = index + 1;
      const nature = natureById.get(line.natureId)!;
      const productId = line.produit ? await resolveProduct(tx, client.id, line.produit) : null;
      const placeId = await resolvePlace(tx, client.id, siteId, line.lieu);
      const controlCode = isDeposit ? (await nextNumber(tx, "CONTROLE", year)).formatted : null;

      const sample = await tx.sample.create({
        data: {
          code: sampleCodeFor(serie.serialNumber, lineNumber),
          serieId: serie.id,
          lineNumber,
          clientId: client.id,
          userId: actor.id,
          natureId: line.natureId,
          lineKind: line.lineKind,
          type: nature.legacyType,
          lieu: line.lieu,
          placeId,
          productId,
          produit: line.produit ?? line.surfaceLabel ?? line.personName,
          numeroLot: line.numeroLot,
          productionDate: line.productionDate,
          expiryDate: line.expiryDate,
          quantity: line.quantity,
          quantityUnit: line.quantityUnit,
          productTemperature: line.productTemperature,
          ambientTemperature: line.ambientTemperature,
          receptionTemperature: isDeposit ? line.receptionTemperature : null,
          surfaceLabel: line.surfaceLabel,
          surfaceAreaCm2: line.surfaceAreaCm2,
          personName: line.personName,
          personRole: line.personRole,
          handsState: line.handsState,
          remarks: line.remarks,
          unitCount: line.unitCount,
          sampledAt: input.startedAt,
          status: isDeposit ? "RECU" : "PRELEVE",
          controlCode,
          receivedById: isDeposit ? actor.id : null,
          receivedAt: isDeposit ? now : null,
          conformity: isDeposit ? true : null,
          parameters: { create: line.parameterIds.map((parameterId) => ({ parameterId })) },
        },
        select: { id: true },
      });
      sampleIds.push(sample.id);
    }

    return { id: serie.id, serialNumber: serie.serialNumber, sampleIds };
  });

  await logAudit({
    actorId: actor.id,
    action: isDeposit ? "DEPOT_CREATED" : "SERIE_CREATED",
    entity: "Serie",
    entityId: result.id,
    metadata: {
      serialNumber: result.serialNumber,
      clientId: client.id,
      siteId,
      lines: input.lines.length,
      samplerKind: input.samplerKind,
    },
  });

  return { ...result, kind: input.kind };
}
