import "server-only";
import type { Family, Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { nextNumber } from "./counters";
import { logAudit } from "./audit";
import { sampleCodeFor, type SampleTwin } from "./sample-code";
import {
  normalizeLabel,
  planLineSamples,
  type CleanSerie,
  type NatureRow,
  type ParameterRef,
  type PlannedSample,
} from "./serie-input";
import type { Role } from "./roles";

/**
 * Creating a série with all its lines — ONE transaction (WORKFLOW.md, rule 4).
 *
 * The N° de série is drawn inside the transaction, so a failed creation
 * never burns a number. A deposit (kind DEPOT) is received on the spot: its
 * samples are born RECU with their N° de contrôle, their conformity and their
 * technician; a visit's samples are born PRELEVE and get theirs at reception.
 *
 * A line becomes one sample per ticked family (RETOUR-LABO-06-10.md §5, V3):
 * the two samples of a two-family line share the line number and everything
 * the préleveur typed (désignation, lot, lieu, quantities, temperatures,
 * remarks), and differ by their code (« 1/26-1M » / « 1/26-1P »), their
 * nature, their analyses and — for a deposit — their N° de contrôle. The
 * série's two boxes « Analyses à effectuer » are the union of the lines.
 *
 * Places and products are memorised per client: the same label, however it
 * is capitalised or accented, always resolves to the same row, so the
 * history of « Poste froid » or « Salade composée » stays comparable.
 * A line is counted once in that memory, whatever its number of samples.
 */

/** One sample written, and the line it comes from. */
export type CreatedSample = {
  id: string;
  /** Index of the line in `CleanSerie.lines` (0-based). */
  lineIndex: number;
  lineNumber: number;
  family: Family;
  twin: SampleTwin | null;
};

export type CreateSerieResult = {
  id: string;
  serialNumber: string;
  kind: CleanSerie["kind"];
  /** Every sample written, in line order (microbiology first within a line). */
  sampleIds: string[];
  samples: CreatedSample[];
};

export class SerieCreationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
    /** The line the message is about, when there is one. */
    readonly line?: number
  ) {
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

/**
 * The samples of every line, from the catalogue as it stands: natures still
 * active, analyses that exist, each one in its family and its domain. Throws
 * a SerieCreationError naming the line otherwise.
 */
export async function planSerieSamples(lines: CleanSerie["lines"]): Promise<PlannedSample[][]> {
  const natureIds = [...new Set(lines.flatMap((l) => l.natures.map((n) => n.natureId)))];
  const natureRows = await prisma.analysisNature.findMany({
    where: { id: { in: natureIds }, active: true },
    select: { id: true, legacyType: true, family: true },
  });
  const natures = new Map<string, NatureRow>(natureRows.map((n) => [n.id, n]));

  const parameterIds = [...new Set(lines.flatMap((l) => l.parameterIds))];
  const parameterRows =
    parameterIds.length === 0
      ? []
      : await prisma.analysisParameter.findMany({
          where: { id: { in: parameterIds } },
          select: { id: true, name: true, family: true, category: true },
        });
  if (parameterRows.length !== parameterIds.length) {
    throw new SerieCreationError("Une des analyses demandées n'existe pas.");
  }
  const parameters = new Map<string, ParameterRef>(parameterRows.map((p) => [p.id, p]));

  return lines.map((line, index) => {
    const plan = planLineSamples(line, index + 1, natures, parameters);
    if (!plan.ok) throw new SerieCreationError(plan.error, 400, plan.line);
    return plan.samples;
  });
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

  // « Siège » (no site) is always a valid answer on the paper, whatever the
  // client's other sites (WORKFLOW.md §13, point 2).
  const siteId = input.siteId;
  if (siteId && !client.sites.some((s) => s.id === siteId)) {
    throw new SerieCreationError("Ce site n'appartient pas à ce client.");
  }

  const plans = await planSerieSamples(input.lines);

  // A product type is the catalogue's or the client's own — never another client's.
  const productTypeIds = [...new Set(input.lines.map((l) => l.productTypeId).filter((v): v is string => v !== null))];
  if (productTypeIds.length > 0) {
    const types = await prisma.productType.findMany({
      where: { id: { in: productTypeIds }, active: true, OR: [{ clientId: null }, { clientId: input.clientId }] },
      select: { id: true },
    });
    if (types.length !== productTypeIds.length) throw new SerieCreationError("Un des types de produit n'existe pas.");
  }

  const isDeposit = input.kind === "DEPOT";

  // « Prélèvement effectué par »: a sampler always enters his own visits —
  // one account per person, no shared tablet (29/09, point 13). The
  // réception keying in a paper protocol names the sampler who signed it.
  let samplerUserId: string | null = null;
  if (input.samplerKind === "QUALILAB") {
    if (actor.role === "PRELEVEUR" && input.samplerUserId && input.samplerUserId !== actor.id) {
      throw new SerieCreationError("Chaque préleveur saisit ses prélèvements avec son propre compte.");
    }
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

  // The two boxes of the paper are a summary of the samples' families (V3).
  const families = new Set(plans.flat().map((s) => s.family));
  const analysesMicro = families.has("MICRO");
  const analysesChimie = families.has("CHIMIE");

  // A deposit's lines may name an indicative technician (PROGRAMME.md §6 —
  // the responsable des paramètres assigns the bench): every one named must
  // exist and be active — one query for all.
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
          cadreNote: input.cadre === "AUTRE" ? input.cadreNote : null,
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

      const samples: CreatedSample[] = [];
      for (const [index, line] of input.lines.entries()) {
        const lineNumber = index + 1;
        // Once per line: the memory counts what the préleveur typed, not
        // the number of samples it becomes.
        const product = line.produit ? await resolveProduct(tx, client.id, line.produit) : null;
        const place = await resolvePlace(tx, client.id, siteId, line.lieu);
        const produit = product?.label ?? line.produit;
        // A destroyed line is received, numbered and cancelled at once. A
        // line received without a technician is no longer held: it waits in
        // the programmation queue (RECU) for the responsable des paramètres,
        // who assigns the bench (PROGRAMME.md §1 — the deposit follows the
        // same path as a visit).
        const destroyed = isDeposit && line.destroy;
        const technicianId = isDeposit && !destroyed ? line.technicianId : null;

        for (const planned of plans[index]) {
          const controlCode = isDeposit ? (await nextNumber(tx, "CONTROLE", year)).formatted : null;
          const sample = await tx.sample.create({
            data: {
              code: sampleCodeFor(serie.serialNumber, lineNumber, planned.twin ?? undefined),
              serieId: serie.id,
              lineNumber,
              clientId: client.id,
              userId: actor.id,
              natureId: planned.natureId,
              lineKind: line.lineKind,
              type: planned.type,
              lieu: place?.label ?? line.lieu,
              placeId: place?.id ?? null,
              productId: product?.id ?? null,
              // La désignation suit le type de ligne : la surface pour une
              // ligne Surface, la personne pour une ligne Mains.
              produit:
                produit ??
                (line.lineKind === "SURFACE"
                  ? line.surfaceLabel
                  : line.lineKind === "MAINS"
                    ? line.personName
                    : null),
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
              surfaceState: line.surfaceState,
              personName: line.personName,
              personRole: line.personRole,
              handsState: line.handsState,
              airMethod: line.airMethod,
              remarks: line.remarks,
              unitCount: line.unitCount,
              productTypeId: line.productTypeId,
              sampledAt: input.startedAt,
              status: destroyed ? "ANNULE" : isDeposit ? "RECU" : "PRELEVE",
              ...(destroyed ? { cancelledAt: now, cancelledById: actor.id, cancelReason: "DETRUIT_A_RECEPTION" as const } : {}),
              controlCode,
              receivedById: isDeposit ? actor.id : null,
              receivedAt: isDeposit ? now : null,
              conformity: isDeposit ? line.conformity : null,
              conformityReason: isDeposit ? line.conformityReason : null,
              conformityNote: isDeposit ? line.conformityNote : null,
              analysisBlocked: false,
              technicianId,
              assignedAt: technicianId ? now : null,
              parameters: { create: planned.parameterIds.map((parameterId) => ({ parameterId })) },
            },
            select: { id: true },
          });
          samples.push({ id: sample.id, lineIndex: index, lineNumber, family: planned.family, twin: planned.twin });
        }
      }

      return { id: serie.id, serialNumber: serie.serialNumber, samples };
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
      samples: result.samples.length,
      samplerKind: input.samplerKind,
      samplerUserId,
      cadre: input.cadre,
      cadreNote: input.cadre === "AUTRE" ? input.cadreNote : null,
      analysesMicro,
      analysesChimie,
      ...(isDeposit
        ? {
            nonConform: input.lines.filter((l) => !l.conformity).length,
            destroyed: input.lines.flatMap((l, i) => (l.destroy ? [i + 1] : [])),
            advanceAmount: input.advanceAmount,
            advanceMode: input.advanceMode,
          }
        : {}),
    },
  });

  // A sample destroyed at the counter is a cancellation like any other.
  await Promise.all(
    result.samples.flatMap((sample) =>
      isDeposit && input.lines[sample.lineIndex].destroy
        ? [
            logAudit({
              actorId: actor.id,
              action: "SAMPLE_CANCELLED",
              entity: "Sample",
              entityId: sample.id,
              metadata: {
                from: "RECU",
                to: "ANNULE",
                serialNumber: result.serialNumber,
                lineNumber: sample.lineNumber,
                twin: sample.twin,
                reason: "DETRUIT_A_RECEPTION",
                note: input.lines[sample.lineIndex].conformityNote,
              },
            }),
          ]
        : []
    )
  );

  return {
    id: result.id,
    serialNumber: result.serialNumber,
    kind: input.kind,
    sampleIds: result.samples.map((s) => s.id),
    samples: result.samples,
  };
}
