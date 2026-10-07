import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { moveEmails, movePlaces, moveProducts, moveTypesAndProfiles } from "@/lib/client-transfer";
import { detectDelimiter, parseCsv } from "@/lib/csv";
import {
  guessSiteColumns,
  planSiteImport,
  planWrites,
  readSiteRows,
  sitesByParent,
  type PlannedSite,
  type SiteImportPlan,
} from "@/lib/sites-import";

/**
 * « Sites de l'ancien logiciel » (RETOUR-LABO-06-10.md §5, V5) — the sites
 * of each client, exported from the old database, attached to their client;
 * the clients the import of 01/10 created by mistake for those sites are
 * emptied into the site and archived. The decisions are made by the pure
 * `planSiteImport` (src/lib/sites-import.ts); this route reads the database
 * and writes the plan.
 *
 *   mode=analyse → what would be written, nothing written;
 *   mode=commit  → written parent by parent, one transaction each,
 *                  idempotent (Site.legacyId; an archived client is never
 *                  matched again), so re-running changes nothing.
 *
 * What moves from a client created by mistake to its parent: its places
 * (onto the site, merged by label), its products (merged by label), its
 * addresses (onto the site, labelled with its name), its own product types
 * and profiles. The addresses arrive with the report and alert boxes
 * unticked: the reports are not sent per site yet (Q45, `recipientsFor`
 * ignores the site), and a ticked box would send every report of the client
 * to every one of its sites.
 */

const MAX_CSV_CHARS = 5 * 1024 * 1024;
const REASON = "Site de l'ancien logiciel importé comme client";

type Written = {
  created: number;
  completed: number;
  attached: number;
  /** Clients that gained a history between the analysis and the writing. */
  withHistory: number;
  places: { moved: number; merged: number };
  products: { moved: number; merged: number };
  emails: number;
  productTypes: number;
  profiles: number;
};

type AuditEntry = Omit<Parameters<typeof logAudit>[0], "actorId">;

const emptyWritten = (): Written => ({
  created: 0,
  completed: 0,
  attached: 0,
  withHistory: 0,
  places: { moved: 0, merged: 0 },
  products: { moved: 0, merged: 0 },
  emails: 0,
  productTypes: 0,
  profiles: 0,
});

function addWritten(total: Written, part: Written) {
  total.created += part.created;
  total.completed += part.completed;
  total.attached += part.attached;
  total.withHistory += part.withHistory;
  total.places.moved += part.places.moved;
  total.places.merged += part.places.merged;
  total.products.moved += part.products.moved;
  total.products.merged += part.products.merged;
  total.emails += part.emails;
  total.productTypes += part.productTypes;
  total.profiles += part.profiles;
}

/** What the screen shows: the plan without its internal list of sites. */
function summarize(plan: SiteImportPlan) {
  return {
    rows: plan.rows,
    counts: plan.counts,
    inactive: plan.inactive,
    completed: plan.completed,
    examples: plan.examples,
    parents: plan.parents,
  };
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: { csv?: unknown; mode?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const mode = body.mode === "commit" ? "commit" : "analyse";

  // ---- the file ----------------------------------------------------------------------
  const csv = typeof body.csv === "string" ? body.csv.replace(/^﻿/, "") : "";
  if (!csv.trim()) return NextResponse.json({ error: "Choisissez le fichier des sites exporté de l'ancien logiciel." }, { status: 400 });
  if (csv.length > MAX_CSV_CHARS) return NextResponse.json({ error: "Fichier trop volumineux (5 Mo maximum)." }, { status: 400 });
  const table = parseCsv(csv, detectDelimiter(csv));
  const columns = guessSiteColumns(table[0] ?? []);
  if (!columns) {
    return NextResponse.json(
      { error: "Colonnes introuvables : la première ligne doit nommer au moins « legacySiteId », « site » et « client »." },
      { status: 400 }
    );
  }
  const { rows, rejected } = readSiteRows(table.slice(1), columns);
  if (rows.length + rejected.length === 0) return NextResponse.json({ error: "Le fichier ne contient aucun site." }, { status: 400 });

  // ---- what the database already knows ------------------------------------------------
  const [clients, sites] = await Promise.all([
    prisma.client.findMany({
      where: { archived: false },
      select: {
        id: true,
        name: true,
        address: true,
        phone: true,
        _count: { select: { series: true, samples: true, invoices: true, sites: true } },
      },
    }),
    prisma.site.findMany({ select: { id: true, clientId: true, name: true, legacyId: true, address: true, city: true, phone: true } }),
  ]);
  const plan = planSiteImport(
    rows,
    { clients: clients.map((c) => ({ id: c.id, name: c.name, address: c.address, phone: c.phone, history: c._count })), sites },
    rejected
  );
  const summary = summarize(plan);
  if (mode === "analyse") return NextResponse.json({ mode, ...summary });
  if (!planWrites(plan)) return NextResponse.json({ mode, ...summary, written: emptyWritten() });

  // ---- commit, parent by parent ---------------------------------------------------------
  const written = emptyWritten();
  const audit: AuditEntry[] = [];
  let failure: string | null = null;
  for (const group of sitesByParent(plan.sites)) {
    const part = emptyWritten();
    try {
      const entries = await prisma.$transaction((tx) => writeParent(tx, group.parentId, group.parentName, group.sites, part), {
        maxWait: 10_000,
        timeout: 120_000,
      });
      addWritten(written, part);
      audit.push(...entries);
    } catch (error) {
      console.error("[import/sites] failed", { parent: group.parentName, error });
      failure =
        (error as { code?: string }).code === "P2002"
          ? `Un site de « ${group.parentName} » porte déjà ce nom à la casse ou aux accents près : corrigez le nom dans le fichier ou sur la fiche du client, puis relancez. Les clients précédents sont enregistrés.`
          : `L'écriture s'est arrêtée au client « ${group.parentName} » ; les clients précédents sont enregistrés. Relancez l'import : il reprendra sans doublon.`;
      break;
    }
  }

  // The journal: one entry per site created or completed and per client archived,
  // then the summary. Written in small batches so a large file stays quick.
  for (let i = 0; i < audit.length; i += 25) {
    await Promise.all(audit.slice(i, i + 25).map((entry) => logAudit({ actorId: session.id, ...entry })));
  }
  await logAudit({
    actorId: session.id,
    action: "SITES_IMPORTED",
    entity: "Site",
    entityId: null,
    metadata: { rows: plan.rows, counts: plan.counts, written, interrupted: failure !== null },
  });

  if (failure) return NextResponse.json({ error: failure, written }, { status: 500 });
  return NextResponse.json({ mode, ...summary, written });
}

/**
 * One parent's sites, inside its transaction: the new sites, the missing
 * fields of those already there, then the clients created by mistake.
 * Fills `written` and returns the journal entries to record once committed.
 */
async function writeParent(
  tx: Prisma.TransactionClient,
  parentId: string,
  parentName: string,
  sites: PlannedSite[],
  written: Written
): Promise<AuditEntry[]> {
  const audit: AuditEntry[] = [];

  // ---- the new sites --------------------------------------------------------------------
  const toCreate = sites.filter((s) => s.create !== null);
  const idByLegacy = new Map<number, string>();
  if (toCreate.length > 0) {
    await tx.site.createMany({ data: toCreate.map((s) => ({ clientId: parentId, ...s.create! })) });
    const created = await tx.site.findMany({
      where: { legacyId: { in: toCreate.map((s) => s.legacySiteId) } },
      select: { id: true, legacyId: true },
    });
    for (const site of created) if (site.legacyId !== null) idByLegacy.set(site.legacyId, site.id);
    for (const s of toCreate) {
      audit.push({
        action: "SITE_CREATED",
        entity: "Site",
        entityId: idByLegacy.get(s.legacySiteId) ?? null,
        metadata: { clientId: parentId, client: parentName, name: s.name, city: s.create!.city, legacyId: s.legacySiteId, active: s.create!.active, source: "import" },
      });
    }
    written.created += toCreate.length;
  }
  const siteIdOf = (s: PlannedSite) => s.existingId ?? idByLegacy.get(s.legacySiteId) ?? null;

  // ---- the fields the sites already there lack ----------------------------------------
  for (const s of sites) {
    if (!s.existingId || Object.keys(s.fill).length === 0) continue;
    await tx.site.update({ where: { id: s.existingId }, data: s.fill });
    written.completed += 1;
    audit.push({
      action: "SITE_UPDATED",
      entity: "Site",
      entityId: s.existingId,
      metadata: { clientId: parentId, client: parentName, name: s.name, filled: Object.keys(s.fill), source: "import" },
    });
  }

  // ---- the clients created by mistake ---------------------------------------------------
  const planned = sites.filter((s) => s.pseudo !== null && siteIdOf(s) !== null);
  if (planned.length === 0) return audit;
  // Checked again inside the transaction: a série recorded since the analysis
  // makes the client real, and it is then left alone.
  const current = await tx.client.findMany({
    where: { id: { in: planned.map((s) => s.pseudo!.id) } },
    select: { id: true, archived: true, _count: { select: { series: true, samples: true, invoices: true, sites: true } } },
  });
  const real = (c: (typeof current)[number]) => c._count.series + c._count.samples + c._count.invoices + c._count.sites > 0;
  const stillPseudo = new Map(current.filter((c) => !c.archived && !real(c)).map((c) => [c.id, c]));
  // (A client archived meanwhile — by hand or by a parallel run — is simply skipped.)
  written.withHistory += current.filter((c) => !c.archived && real(c)).length;
  const attached = planned.filter((s) => stillPseudo.has(s.pseudo!.id));
  if (attached.length === 0) return audit;

  const ids = attached.map((s) => s.pseudo!.id);
  const siteFor = new Map(attached.map((s) => [s.pseudo!.id, { id: siteIdOf(s)!, name: s.name }]));
  const siteIdFor = (clientId: string) => siteFor.get(clientId)!.id;
  // The shared moves of src/lib/client-transfer.ts (same rules as the merge of
  // two clients and « Rattacher comme site de… », CLIENTS-FUSION.md §2–3).

  // Products: one per label and client — merged into the parent's when it has the label.
  const products = await moveProducts(tx, ids, parentId);
  written.products.moved += products.moved;
  written.products.merged += products.merged;

  // Places: onto the site, merged with a place of the same label already on it.
  const places = await movePlaces(tx, ids, parentId, siteIdFor);
  written.places.moved += places.moved;
  written.places.merged += places.merged;

  // Addresses: onto the site, boxes unticked (see the header). An address the
  // parent already has stays on the archived client. The address on the
  // client record itself is added when it is not in its list.
  const emails = await moveEmails(tx, ids, parentId, {
    siteIdFor,
    label: (clientId) => siteFor.get(clientId)!.name,
    untickBoxes: true,
    duplicates: "keep",
    recordEmail: true,
  });
  written.emails += emails.moved + emails.created;
  const moved = new Map(
    ids.map((id) => [
      id,
      { places: places.byClient.get(id) ?? 0, products: products.byClient.get(id) ?? 0, emails: emails.byClient.get(id) ?? 0 },
    ])
  );

  // The client's own product types and profiles belong to the parent now.
  const owned = await moveTypesAndProfiles(tx, ids, parentId);
  written.productTypes += owned.productTypes;
  written.profiles += owned.profiles;

  // ---- archived, never deleted -------------------------------------------------------------
  // `mergedIntoId`: the fiche says « Rattachée comme site de » its parent (CLIENTS-FUSION.md §6).
  await tx.client.updateMany({ where: { id: { in: ids } }, data: { archived: true, mergedIntoId: parentId } });
  written.attached += ids.length;
  for (const s of attached) {
    const site = siteFor.get(s.pseudo!.id)!;
    audit.push({
      action: "CLIENT_ARCHIVED",
      entity: "Client",
      entityId: s.pseudo!.id,
      metadata: {
        name: s.pseudo!.name,
        reason: REASON,
        parentId,
        parent: parentName,
        siteId: site.id,
        site: site.name,
        moved: moved.get(s.pseudo!.id),
        source: "import",
      },
    });
  }
  return audit;
}
