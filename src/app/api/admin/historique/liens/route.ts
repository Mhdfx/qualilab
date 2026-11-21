import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseLinkDecision } from "@/lib/legacy-history-links";

/**
 * Lot 5B, HA3 / HA5 (RETOUR-LABO-20-11.md §6) — a correspondence between an
 * old software's client and ours, decided by hand: the administrator only.
 *
 *   PUT { legacyClientId, legacyName?, clientId: string | null, siteId? }
 *     clientId — this client of ours (« Rattacher »): an ambiguous name
 *       decided, a client not found, a link corrected;
 *     null — « Ne pas reprendre »: its samples are never imported, and those
 *       already imported leave the history (a wrong match is undone).
 *   The decision is recorded as MAIN and never rewritten by the import. The
 *   samples already imported through this link follow it in the same
 *   transaction; each decision is journalled (LEGACY_CLIENT_LINKED).
 */
export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const decision = parseLinkDecision(body);
  if ("error" in decision) return NextResponse.json({ error: decision.error }, { status: 400 });
  const { legacyClientId, clientId, siteId } = decision;

  if (clientId) {
    const client = await prisma.client.findUnique({ where: { id: clientId }, select: { archived: true, mergedIntoId: true } });
    if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    if (client.archived) {
      return NextResponse.json(
        { error: client.mergedIntoId ? "Cette fiche est archivée (fusionnée) : choisissez la fiche conservée." : "Cette fiche est archivée : choisissez une fiche active." },
        { status: 400 }
      );
    }
    if (siteId) {
      const site = await prisma.site.findUnique({ where: { id: siteId }, select: { clientId: true } });
      if (!site || site.clientId !== clientId) return NextResponse.json({ error: "Ce site n'appartient pas à ce client." }, { status: 400 });
    }
  }

  let outcome: { before: { clientId: string | null; matchedBy: string } | null; moved: number; removed: number };
  try {
    outcome = await prisma.$transaction(async (tx) => {
      const before = await tx.legacyClientLink.findUnique({ where: { legacyClientId }, select: { clientId: true, matchedBy: true, legacyName: true } });
      const legacyName = decision.legacyName ?? before?.legacyName ?? `Client n° ${legacyClientId} de l'ancien logiciel`;
      await tx.legacyClientLink.upsert({
        where: { legacyClientId },
        create: { legacyClientId, legacyName, clientId, siteId: clientId ? siteId : null, matchedBy: "MAIN", createdById: session.id },
        update: { legacyName, clientId, siteId: clientId ? siteId : null, matchedBy: "MAIN", createdById: session.id },
      });
      let moved = 0;
      let removed = 0;
      if (!clientId) {
        // « Ne pas reprendre »: what this link brought leaves the history (its analyses with it).
        removed = (await tx.legacySample.deleteMany({ where: { legacyClientId } })).count;
      } else {
        // A site of the previous client is no site of this one.
        const sites = await tx.site.findMany({ where: { clientId }, select: { id: true } });
        await tx.legacySample.updateMany({
          where: { legacyClientId, OR: [{ siteId: null }, { siteId: { notIn: sites.map((s) => s.id) } }] },
          data: { siteId },
        });
        moved = (await tx.legacySample.updateMany({ where: { legacyClientId, clientId: { not: clientId } }, data: { clientId } })).count;
      }
      return { before: before ? { clientId: before.clientId, matchedBy: before.matchedBy } : null, moved, removed };
    });
  } catch (error) {
    console.error("[historique/liens] failed", { legacyClientId, error });
    return NextResponse.json({ error: "La correspondance n'a pas été enregistrée. Réessayez." }, { status: 500 });
  }

  await logAudit({
    actorId: session.id,
    action: "LEGACY_CLIENT_LINKED",
    entity: "LegacyClientLink",
    entityId: String(legacyClientId),
    metadata: { legacyClientId, clientId, siteId: clientId ? siteId : null, before: outcome.before, moved: outcome.moved, removed: outcome.removed },
  });
  return NextResponse.json({ ok: true, legacyClientId, clientId, moved: outcome.moved, removed: outcome.removed });
}
