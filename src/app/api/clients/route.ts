import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";
import { findSimilarClients } from "@/lib/client-identity";
import { LOCK_RETRIES, isLockConflict, lockRetryPause } from "@/lib/billing";
import {
  ARCHIVED_SCAN_LIMIT,
  ARCHIVING_ACTIONS,
  CLIENT_SEARCH_LIMIT,
  MAX_PARENT_HOPS,
  SITE_SCAN_LIMIT,
  clientSearchRows,
  directMatches,
  ficheOrigins,
  firstParentId,
  mergeTargets,
  missingParents,
  type ArchivedFiche,
  type JournalEntry,
} from "@/lib/client-search";
import type { Prisma } from "@/generated/prisma/client";

/** What every client of the list carries. */
const CLIENT_INCLUDE = {
  // Phase 9: the préleveur picks the site from the client's list.
  sites: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
  // CLIENTS-FUSION.md §4 and §6: « client facturé de » and « fusionnée dans ».
  billedFor: { select: { id: true, name: true } },
  mergedInto: { select: { id: true, name: true } },
} as const;

/**
 * The client base.
 *
 * Every circuit role may read it — a préleveur has to pick a client in the
 * field — but only the gestionnaire commercial and the admin may change it.
 * The stock module and the future portal have no business here. Archived
 * clients are hidden unless asked for, so the pickers stay short.
 *
 * `GET` without `q` is the whole list (archived clients with
 * `archived=true`), by name, uncapped as before the 14/10: the owner's
 * scripts read the base through it (relecture du lot 1).
 *
 * `GET ?q=` is the pickers' search, at most `CLIENT_SEARCH_LIMIT` rows, the
 * closest matches first. Besides the clients whose name, ICE or contact
 * matches, it answers the clients one of whose active sites matches, and
 * the live client of an archived fiche that matches — merged, attached as a
 * site, archived by the import of the sites (retour du 14/10, C7): such a
 * row carries
 * `matchedSiteId` (the site to preselect, null for the siège) and
 * `matchedLabel` (« Client — label » in the picker). The rules are
 * `clientSearchRows` (src/lib/client-search.ts); this handler reads.
 */
export async function GET(request: Request) {
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const includeArchived = params.get("archived") === "true";
  const search = params.get("q")?.trim();
  const archivedFilter = includeArchived ? {} : { archived: false };

  if (!search) {
    const clients = await prisma.client.findMany({ where: archivedFilter, orderBy: { name: "asc" }, include: CLIENT_INCLUDE });
    return NextResponse.json(clients);
  }

  // Four reads at once: the clients whose name starts with the text (the
  // closest matches, read apart so twenty names that merely contain it never
  // cut them); the clients by name, ICE or contact; the active sites by
  // name; the archived fiches by name — not read when archived clients are
  // asked for, since they then answer themselves.
  const [prefixed, contained, sites, fiches] = await Promise.all([
    prisma.client.findMany({
      where: { ...archivedFilter, name: { startsWith: search } },
      orderBy: { name: "asc" },
      take: CLIENT_SEARCH_LIMIT,
      include: CLIENT_INCLUDE,
    }),
    prisma.client.findMany({
      where: {
        ...archivedFilter,
        OR: [{ name: { contains: search } }, { ice: { contains: search } }, { contact: { contains: search } }],
      },
      orderBy: { name: "asc" },
      take: CLIENT_SEARCH_LIMIT,
      include: CLIENT_INCLUDE,
    }),
    prisma.site.findMany({
      where: { active: true, name: { contains: search }, ...(includeArchived ? {} : { client: { archived: false } }) },
      select: { id: true, name: true, clientId: true },
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
      take: SITE_SCAN_LIMIT,
    }),
    includeArchived
      ? Promise.resolve<ArchivedFiche[]>([])
      : prisma.client.findMany({
          where: { archived: true, name: { contains: search } },
          select: { id: true, name: true, mergedIntoId: true },
          orderBy: { name: "asc" },
          take: ARCHIVED_SCAN_LIMIT,
        }),
  ]);

  // The name matches, each client once, by name.
  const direct = directMatches(prefixed, contained);

  // Every client a row may stand for, each read once.
  const clients = new Map<string, (typeof direct)[number]>(direct.map((client) => [client.id, client]));
  const read = new Set(clients.keys());
  const load = async (ids: Iterable<string>) => {
    const wanted = [...new Set(ids)].filter((id) => !read.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) read.add(id);
    const rows = await prisma.client.findMany({ where: { id: { in: wanted } }, include: CLIENT_INCLUDE });
    for (const row of rows) clients.set(row.id, row);
  };
  /** The journal entries that tell where these clients went, latest first. */
  const readJournal = (ids: readonly string[]): Promise<JournalEntry[]> =>
    ids.length > 0
      ? prisma.auditLog.findMany({
          where: { entity: "Client", entityId: { in: [...ids] }, action: { in: [...ARCHIVING_ACTIONS] } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { entityId: true, action: true, metadata: true },
        })
      : Promise.resolve([]);

  // Where each fiche went (its journal: the import of 07/10 wrote its parent
  // there only), alongside the clients of the sites and the fiches' parents.
  const [journal] = await Promise.all([
    readJournal(fiches.map((fiche) => fiche.id)),
    load([...sites.map((site) => site.clientId), ...fiches.flatMap((fiche) => (fiche.mergedIntoId ? [fiche.mergedIntoId] : []))]),
  ]);
  const origins = ficheOrigins(journal);

  // A parent merged since leads further (B into A, A into C): one link per round.
  const starts = fiches.map((fiche) => firstParentId(fiche, origins.get(fiche.id)));
  for (let round = 0; round <= MAX_PARENT_HOPS; round += 1) {
    const missing = missingParents(starts, clients).filter((id) => !read.has(id));
    if (missing.length === 0) break;
    await load(missing);
  }

  // A fiche merged into a client that became a site since (attached, or
  // archived by the import of the sites) stands for that site: the journal
  // of the client it was merged into names it (`mergedFicheSite`). Added
  // to the origins, never over a fiche's own; one link per round.
  const asked = new Set(fiches.map((fiche) => fiche.id));
  for (let round = 0; round <= MAX_PARENT_HOPS; round += 1) {
    const via = mergeTargets(origins, clients).filter((id) => !asked.has(id));
    if (via.length === 0) break;
    for (const id of via) asked.add(id);
    for (const [id, origin] of ficheOrigins(await readJournal(via))) {
      if (!origins.has(id)) origins.set(id, origin);
    }
  }

  return NextResponse.json(clientSearchRows({ direct, sites, fiches, origins, clients, includeArchived, query: search }));
}

export async function POST(request: Request) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { emails, confirmDuplicate, ...fields } = (body ?? {}) as {
    emails?: unknown;
    confirmDuplicate?: unknown;
    [key: string]: unknown;
  };

  const validated = validateClient(fields);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const list = validateClientEmails(emails);
  if (!list.ok) {
    return NextResponse.json({ error: list.error }, { status: 400 });
  }

  type Outcome = { client: Prisma.ClientGetPayload<{ include: { emails: true } }> } | { refusal: NextResponse };
  const createOnce = () =>
    prisma.$transaction(async (tx): Promise<Outcome> => {
      // Two clients with the same name would be indistinguishable in every
      // picker. Client.name has no unique index (the imported base predates
      // the rule), so the check is a locking read on the name (index
      // archived + name, case and accents ignored by the collation): two
      // requests creating at the same instant cannot both pass it.
      const duplicate = await tx.$queryRaw<{ id: string }[]>`
        SELECT \`id\` FROM \`Client\`
        WHERE \`archived\` IN (0, 1) AND \`name\` = ${validated.value.name}
        FOR UPDATE`;
      if (duplicate.length > 0) {
        return {
          refusal: NextResponse.json({ error: "Un client porte déjà cette raison sociale." }, { status: 409 }),
        };
      }

      // A near-duplicate (same name under another spelling, same ICE, a typing
      // error away) is only a warning: the gestionnaire checks the list and
      // confirms « Ce n'est pas le même client » (CLIENTS-FUSION.md §5).
      if (confirmDuplicate !== true) {
        const candidates = await tx.client.findMany({
          where: { archived: false },
          select: { id: true, name: true, ice: true },
        });
        const similar = findSimilarClients({ name: validated.value.name, ice: validated.value.ice }, candidates);
        if (similar.length > 0) {
          return {
            refusal: NextResponse.json(
              { error: "Des clients très proches existent déjà : vérifiez avant de créer.", similar },
              { status: 409 }
            ),
          };
        }
      }

      const client = await tx.client.create({
        data: {
          ...validated.value,
          emails: list.value.length > 0 ? { create: list.value } : undefined,
        },
        include: { emails: true },
      });
      return { client };
    });

  let outcome: Outcome | null = null;
  for (let attempt = 1; outcome === null; attempt += 1) {
    try {
      outcome = await createOnce();
    } catch (error) {
      // Two creations at the same instant: InnoDB rolls one back (the gap
      // locks of their reads deadlock). Nothing was written; it runs again,
      // and then sees the other's row if it carried the same name.
      if (!isLockConflict(error)) throw error;
      if (attempt >= LOCK_RETRIES) {
        return NextResponse.json(
          { error: "Une autre création de client était en cours. Rien n'a été enregistré : réessayez." },
          { status: 409 }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, lockRetryPause(attempt)));
    }
  }
  if ("refusal" in outcome) return outcome.refusal;
  const { client } = outcome;

  await logAudit({
    actorId: session.id,
    action: "CLIENT_CREATED",
    entity: "Client",
    entityId: client.id,
    metadata: {
      name: client.name,
      emails: list.value.length,
      ...(confirmDuplicate === true ? { confirmedNotDuplicate: true } : {}),
    },
  });

  return NextResponse.json(client, { status: 201 });
}
