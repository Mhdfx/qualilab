import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { checkAttachAsSite, type ClientFacts } from "@/lib/client-merge-rules";
import { moveEmails, movePlaces, moveProducts, moveTypesAndProfiles } from "@/lib/client-transfer";
import { normalizeSiteName } from "@/lib/sites-import";

/**
 * « Rattacher comme site de… » (CLIENTS-FUSION.md §3, ADMIN) — `[id]` = B, a
 * point of sale recorded as a client, becomes a site of A (`parentId`).
 *
 *   POST { parentId, siteName?, existingSiteId?, mode: "preview" | "commit" }
 *
 * The site: `existingSiteId` (a site of A), else A's site of the same
 * normalised name, else a new site `{ name: siteName ?? B.name, address,
 * phone, city: null }`. B's séries (onto that site when they had none) and
 * samples go to A; its places (on the site), products, addresses (on the
 * site, labelled with its name, « Rapports » and « Alertes » unticked — the
 * sending by site waits for Q45, like the sites import), product types and
 * profiles too. **The invoices stay with B**: documents issued in its name.
 * B is archived with `mergedIntoId = A`.
 *
 * The preview runs the same writes in a transaction rolled back on purpose,
 * so its counts are those of the commit; the decision is `checkAttachAsSite`
 * (src/lib/client-merge-rules.ts) on the records read inside it.
 */

type Mode = "preview" | "commit";

const FACTS_SELECT = {
  id: true,
  name: true,
  archived: true,
  ice: true,
  billedForId: true,
  address: true,
  phone: true,
  _count: { select: { sites: true, billingClients: true, billedSites: true, invoices: true } },
} as const;

/** What the preview and the commit report — the keys the client fiche reads. */
type AttachCounts = {
  series: number;
  samples: number;
  /** Addresses moved onto the site, plus B's record address when not in its list. */
  emails: number;
  /** Places memory given by B (moved + merged), on the site. */
  places: number;
  /** Products memory given by B (moved + merged). */
  products: number;
  productTypes: number;
  profiles: number;
  /** B's invoices, which stay in its name. */
  invoicesKept: number;
};

type AttachOutcome = {
  source: { id: string; name: string };
  parent: { id: string; name: string };
  site: { id: string; name: string; created: boolean };
  warnings: string[];
  counts: AttachCounts;
};

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
  };
}

async function attach(
  tx: Prisma.TransactionClient,
  sourceId: string,
  parentId: string,
  siteName: string | null,
  existingSiteId: string | null
): Promise<AttachOutcome> {
  await tx.$queryRaw`SELECT \`id\` FROM \`Client\` WHERE \`id\` IN (${sourceId}, ${parentId}) FOR UPDATE`;
  const [sourceRow, parentRow] = [
    await tx.client.findUnique({ where: { id: sourceId }, select: FACTS_SELECT }),
    await tx.client.findUnique({ where: { id: parentId }, select: FACTS_SELECT }),
  ];
  if (!sourceRow || !parentRow) throw new Stop(404, { error: "Client introuvable." });

  const existing = existingSiteId
    ? await tx.site.findUnique({ where: { id: existingSiteId }, select: { id: true, clientId: true, name: true, active: true } })
    : null;
  if (existingSiteId && !existing) throw new Stop(404, { error: "Site introuvable." });

  const rule = checkAttachAsSite(facts(sourceRow), facts(parentRow), existing);
  if (!rule.ok) throw new Stop(400, { error: rule.error });
  const warnings = [...rule.warnings];

  // ---- the site ---------------------------------------------------------------------------------
  const name = siteName ?? sourceRow.name.trim();
  let site: { id: string; name: string; active: boolean } | null = existing;
  if (!site) {
    const key = normalizeSiteName(name);
    const parentSites = await tx.site.findMany({
      where: { clientId: parentId },
      select: { id: true, name: true, active: true },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });
    site = (key && parentSites.find((s) => normalizeSiteName(s.name) === key)) || null;
  }
  let created = false;
  if (!site) {
    site = await tx.site.create({
      data: { clientId: parentId, name: name.slice(0, 191), address: sourceRow.address, phone: sourceRow.phone, city: null },
      select: { id: true, name: true, active: true },
    });
    created = true;
  }
  if (!site.active) {
    warnings.push(`Le site « ${site.name} » est désactivé : réactivez-le pour qu'il soit proposé au prélèvement.`);
  }
  const siteId = site.id;
  const siteLabelName = site.name;

  // ---- séries and samples: onto the site when the série had none -------------------------------
  const onSite = await tx.serie.updateMany({ where: { clientId: sourceId, siteId: null }, data: { clientId: parentId, siteId } });
  const others = await tx.serie.updateMany({ where: { clientId: sourceId }, data: { clientId: parentId } });
  const samples = await tx.sample.updateMany({ where: { clientId: sourceId }, data: { clientId: parentId } });

  // ---- the memory (src/lib/client-transfer.ts, the rules of the sites import) -----------------
  const places = await movePlaces(tx, [sourceId], parentId, () => siteId);
  const products = await moveProducts(tx, [sourceId], parentId);
  const emails = await moveEmails(tx, [sourceId], parentId, {
    siteIdFor: () => siteId,
    label: () => siteLabelName,
    untickBoxes: true,
    duplicates: "keep",
    recordEmail: true,
  });
  const owned = await moveTypesAndProfiles(tx, [sourceId], parentId);

  // ---- archived, never deleted; the invoices stay in B's name ----------------------------------
  await tx.client.update({ where: { id: sourceId }, data: { archived: true, mergedIntoId: parentId } });
  // The fiches already merged into (or attached to) B now lead to A, the live record.
  await tx.client.updateMany({ where: { mergedIntoId: sourceId, id: { not: parentId } }, data: { mergedIntoId: parentId } });

  return {
    source: { id: sourceRow.id, name: sourceRow.name },
    parent: { id: parentRow.id, name: parentRow.name },
    site: { id: siteId, name: siteLabelName, created },
    warnings,
    counts: {
      series: onSite.count + others.count,
      samples: samples.count,
      emails: emails.moved + emails.created,
      places: places.moved + places.merged,
      products: products.moved + products.merged,
      productTypes: owned.productTypes,
      profiles: owned.profiles,
      invoicesKept: sourceRow._count.invoices,
    },
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
  const input = (body ?? {}) as { parentId?: unknown; siteName?: unknown; existingSiteId?: unknown; mode?: unknown };
  const parentId = typeof input.parentId === "string" ? input.parentId.trim() : "";
  if (!parentId) return NextResponse.json({ error: "Choisissez le client principal." }, { status: 400 });
  if (input.mode !== "preview" && input.mode !== "commit") {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const mode = input.mode as Mode;
  const siteName = typeof input.siteName === "string" && input.siteName.trim() ? input.siteName.trim() : null;
  if (siteName && siteName.length > 191) {
    return NextResponse.json({ error: "Le nom du site est trop long (191 caractères maximum)." }, { status: 400 });
  }
  const existingSiteId =
    typeof input.existingSiteId === "string" && input.existingSiteId.trim() ? input.existingSiteId.trim() : null;

  let outcome: AttachOutcome;
  try {
    outcome = await prisma.$transaction(
      async (tx) => {
        const result = await attach(tx, id, parentId, siteName, existingSiteId);
        if (mode === "preview") throw new Stop(200, { mode: "preview", ...result });
        return result;
      },
      { maxWait: 10_000, timeout: 120_000 }
    );
  } catch (error) {
    if (error instanceof Stop) return NextResponse.json(error.body, { status: error.status });
    console.error("[clients/attach-as-site] failed", { sourceId: id, parentId, error });
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        {
          error: "Un site de ce client porte déjà ce nom à la casse ou aux accents près : choisissez ce site ou un autre nom. Rien n'a été modifié.",
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Le rattachement a échoué : rien n'a été modifié." }, { status: 500 });
  }

  if (outcome.site.created) {
    await logAudit({
      actorId: session.id,
      action: "SITE_CREATED",
      entity: "Site",
      entityId: outcome.site.id,
      metadata: { clientId: outcome.parent.id, name: outcome.site.name, city: null, source: "attach", fromClientId: outcome.source.id },
    });
  }
  const shared = { siteId: outcome.site.id, site: outcome.site.name, siteCreated: outcome.site.created, counts: outcome.counts };
  await logAudit({
    actorId: session.id,
    action: "CLIENT_ATTACHED_AS_SITE",
    entity: "Client",
    entityId: outcome.source.id,
    metadata: { name: outcome.source.name, parentId: outcome.parent.id, parent: outcome.parent.name, ...shared },
  });
  await logAudit({
    actorId: session.id,
    action: "CLIENT_ATTACHED_AS_SITE",
    entity: "Client",
    entityId: outcome.parent.id,
    metadata: { name: outcome.parent.name, attachedId: outcome.source.id, attached: outcome.source.name, ...shared },
  });

  return NextResponse.json({ mode: "commit", ...outcome });
}
