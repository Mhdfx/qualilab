import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { groupQueue } from "@/lib/programmation-queue";

/**
 * The responsable des paramètres' queue (PROGRAMME.md §5): the received
 * (still to programme) and programmed lines, grouped by série, the RECU
 * first and the oldest receptions at the head. A cancelled line has left
 * the circuit and never appears; a line held at reception is listed but
 * flagged — the admin releases it before it can be programmed.
 */

/** A ceiling, not a page: the queue is the current work, never the history. */
const QUEUE_LIMIT = 1000;

export async function GET() {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const rows = await prisma.sample.findMany({
    where: { status: { in: ["RECU", "PROGRAMME"] } },
    select: {
      id: true,
      code: true,
      controlCode: true,
      lineNumber: true,
      lineKind: true,
      produit: true,
      lieu: true,
      status: true,
      unitCount: true,
      priority: true,
      dueAt: true,
      programmedAt: true,
      programmedBy: { select: { id: true, name: true } },
      receivedAt: true,
      analysisBlocked: true,
      nature: { select: { id: true, label: true, family: true } },
      productType: { select: { id: true, name: true } },
      technician: { select: { id: true, name: true } },
      client: { select: { id: true, name: true } },
      serie: { select: { id: true, serialNumber: true, kind: true, receivedAt: true } },
      parameters: { select: { parameterId: true } },
    },
    orderBy: [{ receivedAt: "asc" }, { serieId: "asc" }, { lineNumber: "asc" }],
    take: QUEUE_LIMIT,
  });

  const lines = rows.map(({ parameters, ...row }) => ({
    ...row,
    parameterCount: parameters.length,
  }));

  return NextResponse.json({
    groups: groupQueue(lines),
    counts: {
      aProgrammer: lines.filter((line) => line.status === "RECU").length,
      programmees: lines.filter((line) => line.status === "PROGRAMME").length,
      bloquees: lines.filter((line) => line.analysisBlocked).length,
    },
    truncated: rows.length === QUEUE_LIMIT,
  });
}
