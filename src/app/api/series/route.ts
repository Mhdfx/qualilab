import { NextResponse } from "next/server";
import type { Prisma, SampleStatus } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { pageParams, toPage } from "@/lib/pagination";
import { getLabSettings } from "@/lib/lab-settings";
import {
  evaluateReception,
  parameterSpellings,
  receptionChecklist,
  type ChecklistRow,
  type ReceptionLine,
} from "@/lib/reception-rules";
import { notifyDestroyed } from "@/lib/destruction-notice";
import { createSerie, planSerieSamples, SerieCreationError } from "@/lib/serie-create";
import { sampleLineMessage, validateSerie, type NatureRef } from "@/lib/serie-input";
import { serieSelectFor, serializeSerie } from "@/lib/serie-select";
import { serieStatus, type SerieStatus } from "@/lib/series";

const CIRCUIT_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "PROGRAMMATEUR",
  "TECHNICIEN",
  "VALIDATEUR",
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
 * A deposit runs the seven rules of the bon de réception as a checklist on
 * each sample (retour du 08/10): rule (1), exploitable or not, is answered
 * for every line (`validateSerie`); the measurable rules are recomputed here
 * with the laboratory's thresholds — histamine and Salmonella recognised on
 * the analyses' names and aliases — and each sample's checklist goes to its
 * SAMPLE_RECEIVED audit, as at the reception of a visit.
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
  // from its type × the ticked family (RETOUR-LABO-06-10.md §5, V3).
  const natures = await prisma.analysisNature.findMany({
    select: { id: true, code: true, family: true, defaultLineKind: true, active: true },
  });
  const natureMap = new Map<string, NatureRef>(natures.map((n) => [n.id, n]));

  const checked = validateSerie(body, natureMap, { kind });
  if (!checked.ok) {
    return NextResponse.json(
      { error: checked.error, ...(checked.line ? { line: checked.line } : {}) },
      { status: 400 }
    );
  }
  const lines = checked.value.lines;

  // A deposit sample's checklist, keyed « lineIndex:family » — for its audit.
  const checklists = new Map<string, ChecklistRow[]>();

  try {
    // A deposit is received on the spot: the acceptance rules run here, as
    // they do for a visit at reception, on each sample the line becomes (the
    // minimal quantity differs between microbiology and physico-chemistry) —
    // a blocking rule cannot be declared conform whatever the form sent.
    if (kind === "DEPOT") {
      const plans = await planSerieSamples(lines);
      const settings = await getLabSettings();
      const parameterIds = [...new Set(lines.flatMap((l) => l.parameterIds))];
      const parameters =
        parameterIds.length === 0
          ? []
          : await prisma.analysisParameter.findMany({
              where: { id: { in: parameterIds } },
              select: { id: true, name: true, aliases: true },
            });
      const spellingsOf = new Map(parameters.map((p) => [p.id, parameterSpellings(p)]));
      for (const [index, line] of lines.entries()) {
        for (const planned of plans[index]) {
          const measured: ReceptionLine = {
            lineKind: line.lineKind,
            family: planned.family,
            parameterNames: planned.parameterIds.flatMap((id) => spellingsOf.get(id) ?? []),
            quantity: line.quantity,
            quantityUnit: line.quantityUnit,
            receptionTemperature: line.receptionTemperature,
            unitCount: line.unitCount,
          };
          checklists.set(
            `${index}:${planned.family}`,
            receptionChecklist(measured, settings, { exploitable: line.exploitable })
          );
          if (!line.conformity) continue;
          const blocking = evaluateReception(measured, settings).find((c) => c.level === "BLOQUANT");
          if (blocking) {
            return NextResponse.json(
              {
                error: sampleLineMessage(
                  `${index + 1}${planned.twin ?? ""}`,
                  `${blocking.message} L'échantillon ne peut pas être déclaré conforme.`
                ),
                line: index + 1,
              },
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
      // the seven rules of the bon as checked at the counter.
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
              destroyed: line.destroy,
              receptionTemperature: line.receptionTemperature,
              quantity: line.quantity,
              quantityUnit: line.quantityUnit,
              checklist: checklists.get(`${sample.lineIndex}:${sample.family}`) ?? null,
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
