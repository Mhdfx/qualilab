import { NextResponse } from "next/server";
import type { Prisma, SampleStatus } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { pageParams, toPage } from "@/lib/pagination";
import { getLabSettings } from "@/lib/lab-settings";
import {
  evaluateReception,
  justifyAcceptanceMessage,
  parameterSpellings,
  receptionChecklist,
  rowToJustify,
  type ChecklistRow,
  type ReceptionLine,
} from "@/lib/reception-rules";
import { complementaryChecklist, complementaryRefusal } from "@/lib/reception-complementary";
import { notifyDestroyed } from "@/lib/destruction-notice";
import { createSerie, planSerieSamples, SerieCreationError } from "@/lib/serie-create";
import { sampleLineMessage, sampleQuantity, validateSerie, type NatureRef } from "@/lib/serie-input";
import { serieSelectFor, serializeSerie } from "@/lib/serie-select";
import { serieStatus, type SerieStatus } from "@/lib/series";

// Never TECHNICIEN: a série names the client, the site and the interlocutor,
// and the bench works blind — it reads its own samples through /api/samples.
const CIRCUIT_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "PROGRAMMATEUR",
  "VALIDATEUR",
  "DIRECTION",
  "GESTIONNAIRE",
  "COMPTABLE",
  "ADMIN",
] as const;

const STATUSES: SerieStatus[] = ["A_RECEPTIONNER", "EN_COURS", "TERMINEE", "ANNULEE"];

/** A derived status, expressed as a query on the lines. */
function whereForStatus(status: SerieStatus): Prisma.SerieWhereInput {
  // Mirrors `OPEN` in series.ts: a programmed line keeps its série en cours.
  const open = { in: ["RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[] };
  switch (status) {
    case "A_RECEPTIONNER":
      return { samples: { some: { status: "PRELEVE" } } };
    case "EN_COURS":
      return {
        AND: [
          { samples: { none: { status: "PRELEVE" } } },
          { samples: { some: { status: open } } },
        ],
      };
    case "TERMINEE":
      return {
        AND: [
          { samples: { none: { status: "PRELEVE" } } },
          { samples: { none: { status: open } } },
          { samples: { some: { status: { in: ["VALIDE", "RAPPORT_ENVOYE"] } } } },
        ],
      };
    case "ANNULEE":
      return { samples: { none: { status: { not: "ANNULE" } } } };
  }
}

export async function GET(request: Request) {
  const session = await requireApiRole(...CIRCUIT_ROLES);
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const rawStatus = params.get("status");
  if (rawStatus && !(STATUSES as string[]).includes(rawStatus)) {
    return NextResponse.json({ error: "Statut inconnu." }, { status: 400 });
  }
  const status = rawStatus as SerieStatus | null;
  const mine = params.get("mine") === "1" || session.role === "PRELEVEUR";

  const where: Prisma.SerieWhereInput = {
    ...(mine ? { createdById: session.id } : {}),
    ...(status ? whereForStatus(status) : {}),
    ...(q
      ? {
          OR: [
            { serialNumber: { contains: q } },
            { clientReference: { contains: q } },
            { client: { name: { contains: q } } },
            { site: { name: { contains: q } } },
          ],
        }
      : {}),
  };

  const { take, cursor, skip } = pageParams(request);
  const rows = await prisma.serie.findMany({
    where,
    select: serieSelectFor(session.role),
    orderBy: { createdAt: "desc" },
    take: take + 1,
    cursor,
    skip,
  });

  const page = toPage(rows, take);
  return NextResponse.json({
    ...page,
    items: page.items.map((row) => serializeSerie(row, serieStatus(row.samples))),
  });
}

/**
 * Creates a série with all its lines in one transaction — one sample per
 * family ticked on a line (RETOUR-LABO-06-10.md §5, V3).
 *
 * A PRELEVEUR creates a VISITE (their own field work). The réception and the
 * admin may create either kind: a VISITE keyed in from a paper protocol, or
 * a DEPOT brought to the counter, received on the spot.
 *
 * A deposit runs the eight rules of the bon de réception as a checklist on
 * each sample (retour du 08/10, rule (8) since 12/10): rule (1), exploitable
 * or not, is answered for every line (`validateSerie`); the measurable rules
 * are recomputed here with the laboratory's thresholds — histamine and
 * Salmonella recognised on the analyses' names and aliases, live bivalve
 * molluscs on the désignation, the product type and the nature — and each
 * sample's checklist goes to its SAMPLE_RECEIVED audit, as at the reception
 * of a visit. Each sample is judged on its own weight: the « P » sample of a
 * two-family line on « Quantité 2P » when the counter weighed it apart (one
 * container per family, 12/10), and a food received « Ambiant » (a stable
 * food) needs no temperature. The contrôles
 * complémentaires (hors bon) follow: C3 and C5 ticked for every line, a
 * failing one refuses « conforme », the coded rows audited beside. A row
 * « à vérifier » accepted conforme needs the line's « Observation de
 * réception » (A7), refused otherwise.
 */
export async function POST(request: Request) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const requested = (body as { kind?: unknown } | null)?.kind;
  const kind =
    session.role === "PRELEVEUR" ? "VISITE" : requested === "DEPOT" ? "DEPOT" : "VISITE";

  // The whole catalogue of natures (16 rows): the line's nature is deduced
  // from its type × the ticked family (RETOUR-LABO-06-10.md §5, V3). A
  // deposit reads the laboratory's thresholds and policy too.
  const [natures, settings] = await Promise.all([
    prisma.analysisNature.findMany({
      select: { id: true, code: true, label: true, family: true, defaultLineKind: true, active: true },
    }),
    kind === "DEPOT" ? getLabSettings() : Promise.resolve(null),
  ]);
  const natureMap = new Map<string, NatureRef>(natures.map((n) => [n.id, n]));

  const checked = validateSerie(body, natureMap, {
    kind,
    // A9: analysing a non-conform deposit line may need the client's agreement.
    consultationRequired: settings?.consultationRequired ?? false,
  });
  if (!checked.ok) {
    return NextResponse.json(
      { error: checked.error, ...(checked.line ? { line: checked.line } : {}) },
      { status: 400 }
    );
  }
  const lines = checked.value.lines;

  // A deposit sample's checklist and contrôles complémentaires, keyed
  // « lineIndex:family » — for its audit.
  const checklists = new Map<string, ChecklistRow[]>();
  const complementaries = new Map<string, ChecklistRow[]>();

  try {
    // A deposit is received on the spot: the acceptance rules run here, as
    // they do for a visit at reception, on each sample the line becomes (the
    // minimal quantity differs between microbiology and physico-chemistry) —
    // a blocking rule cannot be declared conform whatever the form sent.
    if (kind === "DEPOT" && settings) {
      const plans = await planSerieSamples(lines);
      const parameterIds = [...new Set(lines.flatMap((l) => l.parameterIds))];
      const parameters =
        parameterIds.length === 0
          ? []
          : await prisma.analysisParameter.findMany({
              where: { id: { in: parameterIds } },
              select: { id: true, name: true, aliases: true },
            });
      const spellingsOf = new Map(parameters.map((p) => [p.id, parameterSpellings(p)]));
      // Rule (8) reads the product type's name beside the désignation and the nature.
      const productTypeIds = [...new Set(lines.flatMap((l) => (l.productTypeId ? [l.productTypeId] : [])))];
      const productTypes =
        productTypeIds.length === 0
          ? []
          : await prisma.productType.findMany({ where: { id: { in: productTypeIds } }, select: { id: true, name: true } });
      const typeNameOf = new Map(productTypes.map((t) => [t.id, t.name]));
      const natureLabelOf = new Map(natures.map((n) => [n.id, n.label]));
      // C1: the deposit arrives now (unless an arrival was typed); an empty
      // « Prélevé le » is « heure de prélèvement non déclarée ».
      const receivedAt = new Date();
      const timing = {
        startedAt: checked.value.startedAt,
        endedAt: checked.value.endedAt,
        arrivedAt: checked.value.arrivedAt,
        samplingTimeDeclared: checked.value.samplingTimeDeclared,
        receivedAt,
      };
      for (const [index, line] of lines.entries()) {
        for (const planned of plans[index]) {
          // The weight this sample is written with — the « P » one its own (12/10).
          const weighed = sampleQuantity(line, planned.twin);
          const measured: ReceptionLine = {
            lineKind: line.lineKind,
            family: planned.family,
            parameterNames: planned.parameterIds.flatMap((id) => spellingsOf.get(id) ?? []),
            quantity: weighed.quantity,
            quantityUnit: weighed.quantityUnit,
            receptionTemperature: line.receptionTemperature,
            unitCount: line.unitCount,
            storageClass: line.storageClass,
            productNames: [
              line.produit,
              line.productTypeId ? typeNameOf.get(line.productTypeId) : null,
              natureLabelOf.get(planned.natureId),
            ],
          };
          const checklist = receptionChecklist(measured, settings, {
            exploitable: line.exploitable,
            temperatureSource: line.receptionTemperatureSource,
          });
          checklists.set(`${index}:${planned.family}`, checklist);
          const complementary = complementaryChecklist(
            {
              lineKind: line.lineKind,
              family: planned.family,
              receptionTemperature: line.receptionTemperature,
              storageClass: line.storageClass,
              temperatureSource: line.receptionTemperatureSource,
              expiryDate: line.expiryDate,
            },
            timing,
            settings,
            { packagingOk: line.packagingOk, identificationOk: line.identificationOk }
          );
          complementaries.set(`${index}:${planned.family}`, complementary);
          if (!line.conformity) continue;
          const blocking = evaluateReception(measured, settings).find((c) => c.level === "BLOQUANT");
          // A failing contrôle complémentaire refuses « conforme » like a blocking rule.
          const failingControl = complementary.find((row) => row.status === "NON_CONFORME");
          // A doubt accepted conforme is justified in the observation (A7).
          const doubt = rowToJustify([...checklist, ...complementary], true, line.receptionNote);
          const refusal = blocking
            ? `${blocking.message} L'échantillon ne peut pas être déclaré conforme.`
            : failingControl
              ? complementaryRefusal(failingControl)
              : doubt
                ? justifyAcceptanceMessage(doubt)
                : null;
          if (refusal) {
            return NextResponse.json(
              { error: sampleLineMessage(`${index + 1}${planned.twin ?? ""}`, refusal), line: index + 1 },
              { status: 400 }
            );
          }
        }
      }
    }

    const created = await createSerie(checked.value, { id: session.id, role: session.role });
    // A deposit sample destroyed at the counter is told to the client (Q35).
    if (created.kind === "DEPOT") {
      await notifyDestroyed(
        created.samples.filter((s) => lines[s.lineIndex]?.destroy).map((s) => s.id),
        session.id
      ).catch((error) => console.error("[series] destruction notice failed", { serieId: created.id, error }));
    }
    const serie = await prisma.serie.findUniqueOrThrow({
      where: { id: created.id },
      select: serieSelectFor(session.role),
    });
    if (created.kind === "DEPOT") {
      // Each deposit sample is received at its creation: its own entry, with
      // the eight rules of the bon as checked at the counter.
      const written = new Map(serie.samples.map((s) => [s.id, s]));
      await Promise.all(
        created.samples.map((sample) => {
          const line = lines[sample.lineIndex];
          const row = written.get(sample.id);
          return logAudit({
            actorId: session.id,
            action: "SAMPLE_RECEIVED",
            entity: "Sample",
            entityId: sample.id,
            metadata: {
              from: null,
              to: "RECU",
              deposit: true,
              code: row?.code ?? null,
              controlCode: row && "controlCode" in row ? row.controlCode : null,
              serialNumber: created.serialNumber,
              lineNumber: sample.lineNumber,
              ref: `${sample.lineNumber}${sample.twin ?? ""}`,
              exploitable: line.exploitable,
              conformity: line.conformity,
              conformityReason: line.conformityReason,
              conformityNote: line.conformityNote,
              receptionNote: line.receptionNote,
              destroyed: line.destroy,
              // A9: the decision, and the client's agreement when recorded.
              decision: line.decision,
              consultation: line.consultation,
              receptionTemperature: line.receptionTemperature,
              temperatureSource: line.receptionTemperatureSource,
              storageClass: line.storageClass,
              // The sample's own weight — « Quantité 2P » on the « P » one (12/10).
              ...sampleQuantity(line, sample.twin),
              checklist: checklists.get(`${sample.lineIndex}:${sample.family}`) ?? null,
              packagingOk: line.packagingOk,
              identificationOk: line.identificationOk,
              complementary: complementaries.get(`${sample.lineIndex}:${sample.family}`) ?? null,
            },
          });
        })
      );
    }
    return NextResponse.json(serializeSerie(serie, serieStatus(serie.samples)), { status: 201 });
  } catch (error) {
    if (error instanceof SerieCreationError) {
      return NextResponse.json(
        { error: error.message, ...(error.line ? { line: error.line } : {}) },
        { status: error.status }
      );
    }
    console.error("[series] creation failed", { error });
    return NextResponse.json({ error: "Impossible d'enregistrer la série." }, { status: 500 });
  }
}
