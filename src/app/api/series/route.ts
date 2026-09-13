import { NextResponse } from "next/server";
import type { Prisma, SampleStatus } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pageParams, toPage } from "@/lib/pagination";
import { getLabSettings } from "@/lib/lab-settings";
import { evaluateReception } from "@/lib/reception-rules";
import { createSerie, SerieCreationError } from "@/lib/serie-create";
import { validateSerie, type NatureRef } from "@/lib/serie-input";
import { serieSelectFor, serializeSerie } from "@/lib/serie-select";
import { serieStatus, type SerieStatus } from "@/lib/series";

const CIRCUIT_ROLES = [
  "PRELEVEUR",
  "RECEPTIONNISTE",
  "TECHNICIEN",
  "VALIDATEUR",
  "GESTIONNAIRE",
  "COMPTABLE",
  "ADMIN",
] as const;

const STATUSES: SerieStatus[] = ["A_RECEPTIONNER", "EN_COURS", "TERMINEE", "ANNULEE"];

/** A derived status, expressed as a query on the lines. */
function whereForStatus(status: SerieStatus): Prisma.SerieWhereInput {
  const open = { in: ["RECU", "EN_ANALYSE", "RESULTATS_SAISIS"] as SampleStatus[] };
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
 * Creates a série with all its lines in one transaction.
 *
 * A PRELEVEUR creates a VISITE (their own field work). The réception and the
 * admin may create either kind: a VISITE keyed in from a paper protocol, or
 * a DEPOT brought to the counter, received on the spot.
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

  const natures = await prisma.analysisNature.findMany({
    select: { id: true, defaultLineKind: true, active: true },
  });
  const natureMap = new Map<string, NatureRef>(natures.map((n) => [n.id, n]));

  const checked = validateSerie(body, natureMap, { kind });
  if (!checked.ok) {
    return NextResponse.json(
      { error: checked.error, ...(checked.line ? { line: checked.line } : {}) },
      { status: 400 }
    );
  }

  // A deposit is received on the spot: the acceptance rules run here, as
  // they do for a visit at reception — a blocking rule cannot be declared
  // conform whatever the form sent.
  let blockNonConform = false;
  if (kind === "DEPOT") {
    const settings = await getLabSettings();
    blockNonConform = settings.blockNonConformAtReception;
    const [families, parameters] = await Promise.all([
      prisma.analysisNature.findMany({
        where: { id: { in: [...new Set(checked.value.lines.map((l) => l.natureId))] } },
        select: { id: true, family: true },
      }),
      prisma.analysisParameter.findMany({
        where: { id: { in: [...new Set(checked.value.lines.flatMap((l) => l.parameterIds))] } },
        select: { id: true, name: true },
      }),
    ]);
    const familyOf = new Map(families.map((n) => [n.id, n.family]));
    const nameOf = new Map(parameters.map((p) => [p.id, p.name]));
    for (const [index, line] of checked.value.lines.entries()) {
      const checks = evaluateReception(
        {
          lineKind: line.lineKind,
          family: familyOf.get(line.natureId) ?? "AUTRE",
          parameterNames: line.parameterIds.map((id) => nameOf.get(id) ?? ""),
          quantity: line.quantity,
          quantityUnit: line.quantityUnit,
          receptionTemperature: line.receptionTemperature,
          unitCount: line.unitCount,
        },
        settings
      );
      const blocking = checks.find((c) => c.level === "BLOQUANT");
      if (blocking && line.conformity) {
        return NextResponse.json(
          { error: `${blocking.message} La ligne ne peut pas être déclarée conforme.`, line: index + 1 },
          { status: 400 }
        );
      }
    }
  }

  try {
    const created = await createSerie(
      checked.value,
      { id: session.id, role: session.role },
      { blockNonConform }
    );
    const serie = await prisma.serie.findUniqueOrThrow({
      where: { id: created.id },
      select: serieSelectFor(session.role),
    });
    return NextResponse.json(serializeSerie(serie, serieStatus(serie.samples)), { status: 201 });
  } catch (error) {
    if (error instanceof SerieCreationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[series] creation failed", { error });
    return NextResponse.json({ error: "Impossible d'enregistrer la série." }, { status: 500 });
  }
}
