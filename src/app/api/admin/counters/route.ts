import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { COUNTER_KINDS, formatCounterNumber } from "@/lib/counters";
import { highestUsedNumber, loadCounterRows } from "@/lib/counter-rows";

/**
 * The yearly sequences the laboratory continues from its old software: on
 * switch-over day the admin types the last numbers it issued, and the new
 * system carries on from there (WORKFLOW.md §4) — N° de série and N° de
 * contrôle (« NNNN/AA »), invoices (« FAC-AAAA-NNNN ») and credit notes
 * (« AV-AAAA-NNNN »). A counter can never be set below a number already in
 * use that year (409).
 */

export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const year = new Date().getFullYear();
  return NextResponse.json({ year, counters: await loadCounterRows(year) });
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
  // A JSON `null` (or any non-object) parsed fine and crashed on `body.x` (500).
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const kind = COUNTER_KINDS.find((k) => k === body.kind);
  const last = typeof body.last === "number" ? body.last : Number(body.last);
  if (!kind) return NextResponse.json({ error: "Compteur inconnu." }, { status: 400 });
  if (!Number.isInteger(last) || last < 0 || last > 999_999) {
    return NextResponse.json({ error: "Le dernier numéro doit être un entier entre 0 et 999 999." }, { status: 400 });
  }
  const year = new Date().getFullYear();
  const used = await highestUsedNumber(kind, year);
  if (last < used) {
    return NextResponse.json(
      {
        error: `Le numéro ${formatCounterNumber(kind, used, year)} est déjà attribué : le compteur ne peut pas descendre en dessous.`,
      },
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
