import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseLabNumber, type CounterKind } from "@/lib/counters";

/**
 * The yearly sequences (« NNNN/AA ») the laboratory continues from its old
 * software: on switch-over day the admin types the last numbers it issued,
 * and the new system carries on from there (WORKFLOW.md §4). A counter can
 * never be set below a number already in use that year.
 */

const KINDS: CounterKind[] = ["SERIE", "CONTROLE"];

async function highestUsed(kind: CounterKind, year: number): Promise<number> {
  const suffix = `/${String(year % 100).padStart(2, "0")}`;
  const numbers =
    kind === "SERIE"
      ? (await prisma.serie.findMany({ where: { year }, select: { serialNumber: true } })).map((s) => s.serialNumber)
      : (await prisma.sample.findMany({ where: { controlCode: { endsWith: suffix } }, select: { controlCode: true } })).map((s) => s.controlCode ?? "");
  return numbers.reduce((max, n) => Math.max(max, parseLabNumber(n)?.sequence ?? 0), 0);
}

export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const year = new Date().getFullYear();
  const rows = await prisma.counter.findMany({ where: { year } });
  const counters = await Promise.all(
    KINDS.map(async (kind) => ({
      kind,
      year,
      last: rows.find((r) => r.kind === kind)?.last ?? 0,
      highestUsed: await highestUsed(kind, year),
    }))
  );
  return NextResponse.json({ year, counters });
}

export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  let body: { kind?: unknown; last?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const kind = KINDS.find((k) => k === body.kind);
  const last = typeof body.last === "number" ? body.last : Number(body.last);
  if (!kind) return NextResponse.json({ error: "Compteur inconnu." }, { status: 400 });
  if (!Number.isInteger(last) || last < 0 || last > 999_999) {
    return NextResponse.json({ error: "Le dernier numéro doit être un entier entre 0 et 999 999." }, { status: 400 });
  }
  const year = new Date().getFullYear();
  const used = await highestUsed(kind, year);
  if (last < used) {
    return NextResponse.json(
      { error: `Le numéro ${used}/${String(year % 100).padStart(2, "0")} est déjà attribué : le compteur ne peut pas descendre en dessous.` },
      { status: 409 }
    );
  }
  const before = await prisma.counter.findUnique({ where: { kind_year: { kind, year } } });
  const row = await prisma.counter.upsert({
    where: { kind_year: { kind, year } },
    create: { kind, year, last },
    update: { last },
  });
  await logAudit({
    actorId: session.id,
    action: "COUNTER_SET",
    entity: "Counter",
    entityId: `${kind}/${year}`,
    metadata: { kind, year, before: before?.last ?? null, after: row.last },
  });
  return NextResponse.json({ kind, year, last: row.last, highestUsed: used });
}
