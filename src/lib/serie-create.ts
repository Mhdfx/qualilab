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
 * lines are born RECU with their N° de contrôle, their conformity and their
 * technician; a visit's lines are born PRELEVE and get theirs at reception.
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

export type CreateSerieOptions = {
  /** LabSettings policy: a non-conform deposit line is held unassigned. */
  blockNonConform?: boolean;
};

export class SerieCreationError extends Error {
  constructor(message: string, readonly status: 400 | 404 = 400) {
    super(message);
  }
}

/**
 * The memory row for a label — and the label the memory already knows: a
 * quasi-duplicate (« poste salades », « Poste  Salades ») resolves to the
 * existing row and takes its spelling, so the history stays comparable.
 */
type Resolved = { id: string; label: string } | null;

async function resolveProduct(tx: Prisma.TransactionClient, clientId: string, label: string): Promise<Resolved> {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return null;
  const existing = await tx.clientProduct.findUnique({
    where: { clientId_normalizedLabel: { clientId, normalizedLabel } },
    select: { id: true, label: true },
  });
  if (existing) {
    await tx.clientProduct.update({
      where: { id: existing.id },
      data: { usageCount: { increment: 1 }, active: true },
    });
    return existing;
  }
  return tx.clientProduct.create({
    data: { clientId, label, normalizedLabel, usageCount: 1 },
    select: { id: true, label: true },
  });
}

async function resolvePlace(
  tx: Prisma.TransactionClient,
  clientId: string,
  siteId: string | null,
  label: string
): Promise<Resolved> {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) return null;
  // The site's own place first; a place recorded without a site (older
  // visits, deposits) belongs to the whole client and is reused as is.
  const existing = await tx.clientPlace.findFirst({
    where: { clientId, normalizedLabel, OR: [{ siteId }, { siteId: null }] },
    select: { id: true, label: true },
    orderBy: { siteId: "desc" },
  });
  if (existing) {
    await tx.clientPlace.update({
      where: { id: existing.id },
      data: { usageCount: { increment: 1 }, active: true },
    });
    return existing;
  }
  return tx.clientPlace.create({
    data: { clientId, siteId, label, normalizedLabel, usageCount: 1 },
    select: { id: true, label: true },
  });
}

export async function createSerie(
  input: CleanSerie,
  actor: { id: string; role: Role },
  options: CreateSerieOptions = {}
): Promise<CreateSerieResult> {
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { id: true, archived: true, sites: { select: { id: true }, where: { active: true } } },
  });
  if (!client || client.archived) throw new SerieCreationError("Client introuvable ou archivé.", 404);

  // « Siège » (no site) is always a valid answer on the paper, whatever the
  // client's other sites (WORKFLOW.md §13, point 2).
  const siteId = input.siteId;
  if (siteId && !client.sites.some((s) => s.id === siteId)) {
    throw new SerieCreationError("Ce site n'appartient pas à ce client.");
  }

  const natureIds = [...new Set(input.lines.map((l) => l.natureId))];
  const natures = await prisma.analysisNature.findMany({
    where: { id: { in: natureIds }, active: true },
    select: { id: true, legacyType: true, family: true },
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

  const isDeposit = input.kind === "DEPOT";
  const blockNonConform = options.blockNonConform === true;

  // « Prélèvement effectué par »: the logged-in account unless the visit is
  // attributed to a colleague (shared tablet, sheet keyed in later).
  let samplerUserId: string | null = null;
  if (input.samplerKind === "QUALILAB") {
    samplerUserId = input.samplerUserId ?? actor.id;
    if (samplerUserId !== actor.id) {
      const preleveur = await prisma.user.findUnique({
        where: { id: samplerUserId },
        select: { id: true, role: true, banned: true },
      });
      if (!preleveur || preleveur.banned || preleveur.role !== "PRELEVEUR") {
        throw new SerieCreationError("Préleveur invalide.");
      }
    }
  }

  // The two boxes of the paper: ticked as sent, or derived from the lines.
  const families = new Set(input.lines.map((l) => natureById.get(l.natureId)!.family));
  const analysesMicro = input.analysesMicro ?? families.has("MICRO");
  const analysesChimie = input.analysesChimie ?? families.has("CHIMIE");

  // A deposit's lines go straight to a technician (unless held): every one
  // named must exist and be active — one query for all.
  const technicianIds = isDeposit
    ? [...new Set(input.lines.map((l) => l.technicianId).filter((t): t is string => t !== null))]
    : [];
  if (isDeposit) {
    const found =
      technicianIds.length === 0
        ? []
        : await prisma.user.findMany({
            where: { id: { in: technicianIds }, role: "TECHNICIEN", banned: { not: true } },
            select: { id: true },
          });
    if (found.length !== technicianIds.length) throw new SerieCreationError("Technicien invalide.");
  }

  const now = new Date();
  const year = now.getFullYear();

  const result = await prisma.$transaction(
    async (tx) => {
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
          samplerUserId,
          samplerName: input.samplerKind === "QUALILAB" ? null : input.samplerName,
          cadre: input.cadre,
          clientReference: input.clientReference,
          startedAt: input.startedAt,
          endedAt: input.endedAt,
          arrivedAt: isDeposit ? (input.arrivedAt ?? now) : input.arrivedAt,
          coolerTemperature: input.coolerTemperature,
          advanceAmount: isDeposit ? input.advanceAmount : null,
          advanceMode: isDeposit ? input.advanceMode : null,
          analysesMicro,
          analysesChimie,
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
        const product = line.produit ? await resolveProduct(tx, client.id, line.produit) : null;
        const place = await resolvePlace(tx, client.id, siteId, line.lieu);
        const produit = product?.label ?? line.produit;
        const controlCode = isDeposit ? (await nextNumber(tx, "CONTROLE", year)).formatted : null;
        const held = isDeposit && blockNonConform && !line.conformity;
        const technicianId = isDeposit && !held ? line.technicianId : null;

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
            lieu: place?.label ?? line.lieu,
            placeId: place?.id ?? null,
            productId: product?.id ?? null,
            produit: produit ?? line.surfaceLabel ?? line.personName,
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
            conformity: isDeposit ? line.conformity : null,
            conformityReason: isDeposit ? line.conformityReason : null,
            conformityNote: isDeposit ? line.conformityNote : null,
            analysisBlocked: held,
            technicianId,
            assignedAt: technicianId ? now : null,
            parameters: { create: line.parameterIds.map((parameterId) => ({ parameterId })) },
          },
          select: { id: true },
        });
        sampleIds.push(sample.id);
      }

      return { id: serie.id, serialNumber: serie.serialNumber, sampleIds };
    },
    { timeout: 20_000 }
  );

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
      samplerUserId,
      analysesMicro,
      analysesChimie,
      ...(isDeposit
        ? {
            nonConform: input.lines.filter((l) => !l.conformity).length,
            advanceAmount: input.advanceAmount,
            advanceMode: input.advanceMode,
          }
        : {}),
    },
  });

  return { ...result, kind: input.kind };
}
