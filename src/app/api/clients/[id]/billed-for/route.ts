import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkBilledFor, type ClientFacts } from "@/lib/client-merge-rules";

/**
 * « Client facturé de » (CLIENTS-FUSION.md §4, GESTIONNAIRE and ADMIN) —
 * `[id]` = F, the client that receives the invoices (a franchisee, a
 * holding, a management company) for its principal client P.
 *
 *   PUT { parentId: P }   → F becomes a billing client of P;
 *   PUT { parentId: null } → the link is removed.
 *
 * The decision is `checkBilledFor` (src/lib/client-merge-rules.ts). When F
 * stops being a billing client of its former principal (link removed, or
 * moved to another one), the sites billed to F go back to their own client:
 * their `billingClientId` is cleared in the same transaction.
 *
 * Answers `{ id, name, billedFor: { id, name } | null, warnings, sitesReleased }`.
 */

const FACTS_SELECT = {
  id: true,
  name: true,
  archived: true,
  ice: true,
  billedForId: true,
  billedFor: { select: { id: true, name: true } },
  _count: { select: { sites: true, billingClients: true, billedSites: true } },
} as const;

type Row = Prisma.ClientGetPayload<{ select: typeof FACTS_SELECT }>;

function facts(row: Row): ClientFacts {
  return {
    id: row.id,
    name: row.name,
    archived: row.archived,
    ice: row.ice,
    billedForId: row.billedForId,
    sites: row._count.sites,
    billingClients: row._count.billingClients,
    billedSites: row._count.billedSites,
  };
}

class Stop extends Error {
  constructor(
    readonly status: number,
    readonly error: string
  ) {
    super(error);
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const raw = (body ?? {}) as { parentId?: unknown };
  if (raw.parentId !== null && raw.parentId !== "" && typeof raw.parentId !== "string") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parentId = typeof raw.parentId === "string" && raw.parentId.trim() ? raw.parentId.trim() : null;

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Both records locked: two links edited at once must not build a chain.
      await tx.$queryRaw`SELECT \`id\` FROM \`Client\` WHERE \`id\` IN (${id}, ${parentId ?? id}) FOR UPDATE`;
      const child = await tx.client.findUnique({ where: { id }, select: FACTS_SELECT });
      if (!child) throw new Stop(404, "Client introuvable.");
      const parent = parentId ? await tx.client.findUnique({ where: { id: parentId }, select: FACTS_SELECT }) : null;
      if (parentId && !parent) throw new Stop(404, "Client principal introuvable.");

      const rule = checkBilledFor(facts(child), parent ? facts(parent) : null);
      if (!rule.ok) throw new Stop(400, rule.error);

      const previous = child.billedFor;
      if ((previous?.id ?? null) === parentId) {
        return { child, previous, parent, warnings: [] as string[], sitesReleased: 0, changed: false };
      }
      // The sites of the former principal billed to F go back to their own client.
      const sitesReleased = previous
        ? (await tx.site.updateMany({ where: { billingClientId: id }, data: { billingClientId: null } })).count
        : 0;
      await tx.client.update({ where: { id }, data: { billedForId: parentId } });
      return { child, previous, parent, warnings: rule.warnings, sitesReleased, changed: true };
    });

    const { child, previous, parent, warnings, sitesReleased, changed } = outcome;
    if (changed) {
      await logAudit({
        actorId: session.id,
        action: parent ? "CLIENT_BILLED_FOR_SET" : "CLIENT_BILLED_FOR_CLEARED",
        entity: "Client",
        entityId: id,
        metadata: {
          name: child.name,
          parentId: parent?.id ?? null,
          parent: parent?.name ?? null,
          previousParentId: previous?.id ?? null,
          previousParent: previous?.name ?? null,
          sitesReleased,
        },
      });
    }

    return NextResponse.json({
      id: child.id,
      name: child.name,
      billedFor: parent ? { id: parent.id, name: parent.name } : null,
      warnings,
      sitesReleased,
    });
  } catch (error) {
    if (error instanceof Stop) return NextResponse.json({ error: error.error }, { status: error.status });
    console.error("[clients/billed-for] failed", { id, parentId, error });
    return NextResponse.json({ error: "Le lien n'a pas pu être enregistré." }, { status: 500 });
  }
}
