import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkMerge, mergeFill, type ClientFacts, type FillableField } from "@/lib/client-merge-rules";
import { moveEmails, movePlaces, moveProducts, moveTypesAndProfiles } from "@/lib/client-transfer";
import { normalizeSiteName } from "@/lib/sites-import";

/**
 * « Fusionner avec… » (CLIENTS-FUSION.md §2, ADMIN) — `[id]` = B, the
 * duplicate fiche that disappears into A (`targetId`), the fiche kept.
 *
 *   POST { targetId, mode: "preview" } → what would move, nothing kept;
 *   POST { targetId, mode: "commit" }  → written in one transaction.
 *
 * The preview runs the very same writes inside a transaction that is then
 * rolled back, so its counts are exactly those of the commit. The decision
 * (allowed or not, warnings) is `checkMerge` (src/lib/client-merge-rules.ts),
 * taken on the records as read inside the transaction, rows locked.
 *
 * Moved from B to A: séries, samples and invoices (same company: its
 * documents now carry A's name); B's sites (merged into A's site of the same
 * normalised name, else moved); addresses, places and products memory
 * (src/lib/client-transfer.ts, the rules of the sites import); own product
 * types and profiles; the links that targeted B (`Client.billedForId`,
 * `Site.billingClientId`); A's empty fields completed by B's. B is archived
 * with `mergedIntoId = A` — never deleted.
 */

type Mode = "preview" | "commit";

const FACTS_SELECT = {
  id: true,
  name: true,
  archived: true,
  ice: true,
  billedForId: true,
  contact: true,
  email: true,
  phone: true,
  address: true,
  _count: { select: { sites: true, billingClients: true, billedSites: true, invoices: true } },
} as const;

const SITE_FIELDS = {
  id: true,
  name: true,
  code: true,
  address: true,
  city: true,
  phone: true,
  contact: true,
  legacyId: true,
  billingClientId: true,
} as const;

/** What the preview and the commit report — the keys the client fiche reads. */
type MergeCounts = {
  series: number;
  samples: number;
  invoices: number;
  /** B's sites moved to A as they are. */
  sites: number;
  /** B's sites merged into A's site of the same name (then deleted). */
  sitesMerged: number;
  /** Addresses moved to A. */
  emails: number;
  /** Addresses A already had, deleted on B. */
  emailsDeleted: number;
  /** Places memory given by B (moved + merged). */
  places: number;
  placesMerged: number;
  /** Products memory given by B (moved + merged). */
  products: number;
  productsMerged: number;
  productTypes: number;
  profiles: number;
  /** Clients billed for B, now billed for A. */
  billingClients: number;
  /** Sites billed to B, now billed to A. */
  billedSites: number;
};

type MergeOutcome = {
  source: { id: string; name: string };
  target: { id: string; name: string };
  warnings: string[];
  counts: MergeCounts;
  /** A's empty fields completed by B's. */
  filled: FillableField[];
  /** The principal client A is billed for afterwards, when it took B's link. */
  adoptedBilledForId: string | null;
};

/** Thrown inside the transaction: a refusal (rolled back) or the preview (rolled back on purpose). */
class Stop extends Error {
  constructor(
    readonly status: number,
    readonly body: Record<string, unknown>
  ) {
    super("stop");
  }
}

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
    invoices: row._count.invoices,
    contact: row.contact,
    email: row.email,
    phone: row.phone,
    address: row.address,
  };
}

const blank = (value: string | null | undefined) => (value ?? "").trim() === "";

async function merge(tx: Prisma.TransactionClient, sourceId: string, targetId: string): Promise<MergeOutcome> {
  // The two records cannot change under the decision (a parallel merge, a link edited).
  await tx.$queryRaw`SELECT \`id\` FROM \`Client\` WHERE \`id\` IN (${sourceId}, ${targetId}) FOR UPDATE`;
  const [sourceRow, targetRow] = [
    await tx.client.findUnique({ where: { id: sourceId }, select: FACTS_SELECT }),
    await tx.client.findUnique({ where: { id: targetId }, select: FACTS_SELECT }),
  ];
  if (!sourceRow || !targetRow) throw new Stop(404, { error: "Client introuvable." });
  const source = facts(sourceRow);
  const target = facts(targetRow);

  const rule = checkMerge(source, target);
  if (!rule.ok) throw new Stop(400, { error: rule.error });

  const counts: MergeCounts = {
    series: 0,
    samples: 0,
    invoices: 0,
    sites: 0,
    sitesMerged: 0,
    emails: 0,
    emailsDeleted: 0,
    places: 0,
    placesMerged: 0,
    products: 0,
    productsMerged: 0,
    productTypes: 0,
    profiles: 0,
    billingClients: 0,
    billedSites: 0,
  };

  // ---- sites: merged into A's site of the same normalised name, else moved ---------------
  // First, so that B's places, addresses and séries already point at A's sites
  // when the memory moves (movePlaces then merges per site and label).
  const [targetSites, sourceSites] = [
    await tx.site.findMany({ where: { clientId: targetId }, select: SITE_FIELDS }),
    await tx.site.findMany({ where: { clientId: sourceId }, select: SITE_FIELDS, orderBy: [{ active: "desc" }, { name: "asc" }] }),
  ];
  const siteByName = new Map<string, (typeof targetSites)[number]>();
  for (const site of targetSites) {
    const key = normalizeSiteName(site.name);
    if (key && !siteByName.has(key)) siteByName.set(key, site);
  }
  for (const site of sourceSites) {
    const key = normalizeSiteName(site.name);
    const kept = key ? siteByName.get(key) : undefined;
    if (!kept) {
      await tx.site.update({ where: { id: site.id }, data: { clientId: targetId } });
      if (key) siteByName.set(key, site);
      counts.sites += 1;
      continue;
    }
    await tx.serie.updateMany({ where: { siteId: site.id }, data: { siteId: kept.id } });
    await tx.clientEmail.updateMany({ where: { siteId: site.id }, data: { siteId: kept.id } });
    await tx.clientPlace.updateMany({ where: { siteId: site.id }, data: { siteId: kept.id } });
    // The kept site's empty fields are completed by the merged one's; nothing is overwritten.
    const fill: Prisma.SiteUncheckedUpdateInput = {};
    for (const field of ["code", "address", "city", "phone", "contact"] as const) {
      if (blank(kept[field]) && !blank(site[field])) {
        fill[field] = site[field]!.trim();
        kept[field] = site[field]!.trim();
      }
    }
    if (kept.legacyId === null && site.legacyId !== null) {
      fill.legacyId = site.legacyId;
      kept.legacyId = site.legacyId;
    }
    if (kept.billingClientId === null && site.billingClientId !== null) {
      // A billing client of B, repointed to A below: still a billing client of the site's client.
      fill.billingClientId = site.billingClientId;
      kept.billingClientId = site.billingClientId;
    }
    // Deleted before the update: the legacy id is unique.
    await tx.site.delete({ where: { id: site.id } });
    if (Object.keys(fill).length > 0) await tx.site.update({ where: { id: kept.id }, data: fill });
    counts.sitesMerged += 1;
  }

  // ---- the documents: séries, samples, invoices ---------------------------------------------
  counts.series = (await tx.serie.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })).count;
  counts.samples = (await tx.sample.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })).count;
  counts.invoices = (await tx.invoice.updateMany({ where: { clientId: sourceId }, data: { clientId: targetId } })).count;

  // ---- the memory (src/lib/client-transfer.ts) ------------------------------------------------
  const places = await movePlaces(tx, [sourceId], targetId, null);
  counts.places = places.moved + places.merged;
  counts.placesMerged = places.merged;
  const products = await moveProducts(tx, [sourceId], targetId);
  counts.products = products.moved + products.merged;
  counts.productsMerged = products.merged;
  // Same company: an address A already has is deleted on B, not kept twice.
  const emails = await moveEmails(tx, [sourceId], targetId, { duplicates: "delete" });
  counts.emails = emails.moved;
  counts.emailsDeleted = emails.deleted;
  const owned = await moveTypesAndProfiles(tx, [sourceId], targetId);
  counts.productTypes = owned.productTypes;
  counts.profiles = owned.profiles;

  // ---- the links that targeted B target A --------------------------------------------------
  counts.billingClients = (await tx.client.updateMany({ where: { billedForId: sourceId }, data: { billedForId: targetId } })).count;
  counts.billedSites = (await tx.site.updateMany({ where: { billingClientId: sourceId }, data: { billingClientId: targetId } })).count;
  // The fiches already merged into (or attached to) B now lead to A, the live record.
  await tx.client.updateMany({ where: { mergedIntoId: sourceId, id: { not: targetId } }, data: { mergedIntoId: targetId } });

  // ---- A completed, B archived ------------------------------------------------------------------
  const { fill } = mergeFill(source, target);
  const data: Prisma.ClientUncheckedUpdateInput = { ...fill };
  if (rule.adoptBilledForId) data.billedForId = rule.adoptBilledForId;
  if (Object.keys(data).length > 0) await tx.client.update({ where: { id: targetId }, data });
  // B's link to its principal now belongs to A (adopted, or A already had the same one).
  await tx.client.update({ where: { id: sourceId }, data: { archived: true, mergedIntoId: targetId, billedForId: null } });

  return {
    source: { id: source.id, name: source.name },
    target: { id: target.id, name: target.name },
    warnings: rule.warnings,
    counts,
    filled: Object.keys(fill) as FillableField[],
    adoptedBilledForId: rule.adoptBilledForId,
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { targetId, mode } = (body ?? {}) as { targetId?: unknown; mode?: unknown };
  if (typeof targetId !== "string" || !targetId.trim()) {
    return NextResponse.json({ error: "Choisissez la fiche à garder." }, { status: 400 });
  }
  if (mode !== "preview" && mode !== "commit") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  let outcome: MergeOutcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const result = await merge(tx, id, targetId.trim());
        // The preview: every write undone, the counts kept.
        if ((mode as Mode) === "preview") throw new Stop(200, { mode: "preview", ...result });
        return result;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (error) {
    if (error instanceof Stop) return NextResponse.json(error.body, { status: error.status });
    console.error("[clients/merge] failed", { sourceId: id, targetId, error });
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        {
          error:
            "Deux sites (ou deux adresses) des deux fiches ne diffèrent que par la casse ou les accents : harmonisez-les sur l'une des fiches, puis recommencez. Rien n'a été modifié.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "La fusion a échoué : rien n'a été modifié." }, { status: 500 });
  }

  const shared = { counts: outcome.counts, filled: outcome.filled, adoptedBilledForId: outcome.adoptedBilledForId };
  await logAudit({
    actorId: session.id,
    action: "CLIENT_MERGED",
    entity: "Client",
    entityId: outcome.target.id,
    metadata: { name: outcome.target.name, kept: true, mergedId: outcome.source.id, merged: outcome.source.name, ...shared },
  });
  await logAudit({
    actorId: session.id,
    action: "CLIENT_MERGED",
    entity: "Client",
    entityId: outcome.source.id,
    metadata: { name: outcome.source.name, kept: false, intoId: outcome.target.id, into: outcome.target.name, ...shared },
  });

  return NextResponse.json({ mode: "commit", ...outcome });
}
