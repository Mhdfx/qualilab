import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseLabNumber, type CounterKind } from "@/lib/counters";

/**
 * Go-live tool (DEPLOY.md): removes the demonstration clients and everything
 * that hangs off them — séries, samples, results, reports, invoices, e-mail
 * logs, memory — then brings the yearly counters back to the highest number
 * still in use. ADMIN only, explicit client ids, a dry run first, the word
 * « SUPPRIMER » to commit, one journal entry. The journal itself is never
 * touched: what happened stays written. No screen on purpose — a single
 * click must not be able to erase a client's history.
 */

const CONFIRM = "SUPPRIMER";

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: { mode?: unknown; clientIds?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const mode = body.mode === "commit" ? "commit" : "analyse";
  const clientIds = Array.isArray(body.clientIds) ? body.clientIds.filter((v): v is string => typeof v === "string" && v.length > 0) : [];
  if (clientIds.length === 0) return NextResponse.json({ error: "Indiquez les clients à supprimer." }, { status: 400 });

  const clients = await prisma.client.findMany({
    where: { id: { in: clientIds } },
    select: {
      id: true,
      name: true,
      _count: { select: { series: true, samples: true, invoices: true, emails: true, sites: true, products: true, places: true } },
    },
  });
  if (clients.length !== clientIds.length) {
    return NextResponse.json({ error: "Un des clients est introuvable." }, { status: 404 });
  }
  const [series, reports, emailLogs, invoices] = await Promise.all([
    prisma.serie.findMany({ where: { clientId: { in: clientIds } }, select: { serialNumber: true }, orderBy: { createdAt: "asc" } }),
    prisma.report.count({ where: { sample: { clientId: { in: clientIds } } } }),
    prisma.emailLog.count({ where: { report: { sample: { clientId: { in: clientIds } } } } }),
    prisma.invoice.findMany({ where: { clientId: { in: clientIds } }, select: { number: true } }),
  ]);
  const summary = {
    clients: clients.map((c) => ({ id: c.id, name: c.name, ...c._count })),
    series: series.map((s) => s.serialNumber),
    reports,
    emailLogs,
    invoices: invoices.map((i) => i.number),
  };
  if (mode === "analyse") return NextResponse.json({ mode, ...summary });
  if (body.confirm !== CONFIRM) {
    return NextResponse.json({ error: `Pour confirmer, envoyez confirm = « ${CONFIRM} ».` }, { status: 400 });
  }

  const counters: Record<string, { year: number; last: number }[]> = {};
  try {
    await prisma.$transaction(
      async (tx) => {
        // In dependency order: a série or a client cannot go while a sample
        // points at it; the rest cascades.
        await tx.emailLog.deleteMany({ where: { report: { sample: { clientId: { in: clientIds } } } } });
        await tx.invoice.deleteMany({ where: { clientId: { in: clientIds } } });
        await tx.sample.deleteMany({ where: { clientId: { in: clientIds } } });
        await tx.serie.deleteMany({ where: { clientId: { in: clientIds } } });
        await tx.client.deleteMany({ where: { id: { in: clientIds } } });

        // The counters fall back to the highest number still in use, so the
        // next série after a purge does not continue the deleted ones.
        const rows = await tx.counter.findMany();
        for (const row of rows) {
          const kind = row.kind as CounterKind;
          const used =
            kind === "SERIE"
              ? (await tx.serie.findMany({ where: { year: row.year }, select: { serialNumber: true } })).map((s) => parseLabNumber(s.serialNumber)?.sequence ?? 0)
              : kind === "CONTROLE"
                ? (await tx.sample.findMany({ where: { controlCode: { endsWith: `/${String(row.year % 100).padStart(2, "0")}` } }, select: { controlCode: true } })).map((s) => parseLabNumber(s.controlCode ?? "")?.sequence ?? 0)
                : null;
          if (used === null) continue;
          const last = used.length ? Math.max(...used) : 0;
          if (last !== row.last) await tx.counter.update({ where: { kind_year: { kind: row.kind, year: row.year } }, data: { last } });
          counters[kind] = [...(counters[kind] ?? []), { year: row.year, last }];
        }
      },
      { timeout: 120_000 }
    );
  } catch (error) {
    console.error("[purge-clients] failed", { error });
    return NextResponse.json({ error: "La suppression a échoué — rien n'a été supprimé." }, { status: 500 });
  }

  await logAudit({
    actorId: session.id,
    action: "DEMO_DATA_PURGED",
    entity: "Client",
    entityId: null,
    metadata: { ...summary, counters },
  });
  return NextResponse.json({ mode, ...summary, counters });
}
