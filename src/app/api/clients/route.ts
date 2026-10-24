import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { benchHidesClient } from "@/lib/bench-access";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
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
  type FicheOrigin,
  type JournalEntry,
} from "@/lib/client-search";
import {
  clientCreationInput,
  exactNameDecision,
  exactNameRefusal,
  isCounterCreator,
  nearDuplicateMessage,
} from "@/lib/quick-client";
import type { Prisma } from "@/generated/prisma/client";

/** What every client of the list carries. */
const CLIENT_INCLUDE = {
  // Phase 9: the préleveur picks the site from the client's list.
  sites: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
  // CLIENTS-FUSION.md §4 and §6: « client facturé de » and « fusionnée dans ».
  billedFor: { select: { id: true, name: true } },
  mergedInto: { select: { id: true, name: true } },
} as const;

type LoadedClient = Prisma.ClientGetPayload<{ include: typeof CLIENT_INCLUDE }>;

/**
 * The clients a search (or a refused name) may stand for, each read once:
 * `load` reads those not read yet, `read` remembers every id asked for —
 * found or not — so a link to a missing client is not asked twice.
 */
function clientLoader(initial: readonly LoadedClient[]) {
  const clients = new Map<string, LoadedClient>(initial.map((client) => [client.id, client]));
  const read = new Set(clients.keys());
  const load = async (ids: Iterable<string>) => {
    const wanted = [...new Set(ids)].filter((id) => !read.has(id));
    if (wanted.length === 0) return;
    for (const id of wanted) read.add(id);
    const rows = await prisma.client.findMany({ where: { id: { in: wanted } }, include: CLIENT_INCLUDE });
    for (const row of rows) clients.set(row.id, row);
  };
  return { clients, read, load };
}

/** The journal entries that tell where these clients went, latest first. */
function readJournal(ids: readonly string[]): Promise<JournalEntry[]> {
  return ids.length > 0
    ? prisma.auditLog.findMany({
        where: { entity: "Client", entityId: { in: [...ids] }, action: { in: [...ARCHIVING_ACTIONS] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { entityId: true, action: true, metadata: true },
      })
    : Promise.resolve([]);
}

/**
 * Where archived fiches went (src/lib/client-search.ts): their journal —
 * the import of 07/10 wrote their parent there only — read alongside the
 * fiches' parents and `alsoLoad`; then the parents merged since (B into A, A
 * into C), one link per round; then the journal of the clients they were
 * merged into, which may have become a site since. Every client met is
 * loaded into `loader.clients`.
 */
async function traceFiches(
  fiches: readonly ArchivedFiche[],
  loader: ReturnType<typeof clientLoader>,
  alsoLoad: readonly string[] = []
): Promise<Map<string, FicheOrigin>> {
  const { clients, read, load } = loader;
  const [journal] = await Promise.all([
    readJournal(fiches.map((fiche) => fiche.id)),
    load([...alsoLoad, ...fiches.flatMap((fiche) => (fiche.mergedIntoId ? [fiche.mergedIntoId] : []))]),
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
  return origins;
}

/**
 * The client base.
 *
 * Every circuit role may read it — a préleveur has to pick a client in the
 * field — but only the gestionnaire commercial and the admin may change it;
 * the reception and the préleveur may create one (`POST`, create only).
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
  // The blind bench (relance 2.15, BLIND_BENCH_SCREENS): no technician screen
  // reads the clients, and this list would hand a technician every name,
  // contact and address the bench screens no longer show.
  if (benchHidesClient(session.role)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

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

  // Every client a row may stand for, each read once: the direct ones, the
  // clients of the sites, and where each fiche went.
  const loader = clientLoader(direct);
  const origins = await traceFiches(fiches, loader, sites.map((site) => site.clientId));

  return NextResponse.json(
    clientSearchRows({ direct, sites, fiches, origins, clients: loader.clients, includeArchived, query: search })
  );
}

/**
 * Creating a client.
 *
 * The gestionnaire commercial and the admin create it from the client base
 * (/commercial/nouveau), with its report recipients. The reception and the
 * préleveur create it at the deposit and the visit (RETOUR-LABO-16-10.md
 * E1 — create only: the fiche, the merge and the attachment as a site stay
 * the gestionnaire's and the admin's): the name alone is required, the
 * e-mail fields are dropped, and the client is « À compléter » (E3). The
 * rules are `clientCreationInput` (src/lib/quick-client.ts).
 *
 * Body: the fiche's fields (`name`, `contact`, `email`, `phone`, `address`,
 * `ice`, and since 20/10 `fiscalId` (IF) and `tradeRegister` (RC) —
 * RETOUR-LABO-19-10.md H2), `emails` (the recipient list; a row's `siteId`
 * is ignored: the client has no site yet), `sites` (created with it, active),
 * `places` (its usual sampling places, under the site when one site is
 * created, else the siège's), `origin` (« DEPOT » / « VISITE »),
 * `confirmDuplicate` (« Ce n'est pas le même client »).
 *
 * 409: the exact name of a client (archived ones included — N1: an archived
 * fiche now part of another client answers that client, and its site), or
 * near-duplicates to confirm (`similar`).
 */
export async function POST(request: Request) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN", "RECEPTIONNISTE", "PRELEVEUR");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const checked = clientCreationInput(body, session.role);
  if (!checked.ok) {
    return NextResponse.json({ error: checked.error }, { status: 400 });
  }
  const input = checked.value;
  const counter = isCounterCreator(session.role);

  type Created = {
    client: Prisma.ClientGetPayload<{ include: { emails: true } }>;
    sites: { id: string; name: string; city: string | null }[];
  };
  type Outcome = Created | { exactName: string[] } | { refusal: NextResponse };
  const createOnce = () =>
    prisma.$transaction(async (tx): Promise<Outcome> => {
      // Two clients with the same name would be indistinguishable in every
      // picker. Client.name has no unique index (the imported base predates
      // the rule), so the check is a locking read on the name (index
      // archived + name, case and accents ignored by the collation): two
      // requests creating at the same instant cannot both pass it.
      const duplicate = await tx.$queryRaw<{ id: string }[]>`
        SELECT \`id\` FROM \`Client\`
        WHERE \`archived\` IN (0, 1) AND \`name\` = ${input.client.name}
        FOR UPDATE`;
      if (duplicate.length > 0) return { exactName: duplicate.map((row) => row.id) };

      // A near-duplicate (same name under another spelling, same ICE, a typing
      // error away) is only a warning: the user checks the list and confirms
      // « Ce n'est pas le même client » (CLIENTS-FUSION.md §5).
      if (!input.confirmDuplicate) {
        const candidates = await tx.client.findMany({
          where: { archived: false },
          select: { id: true, name: true, ice: true },
        });
        const similar = findSimilarClients({ name: input.client.name, ice: input.client.ice }, candidates);
        if (similar.length > 0) {
          return {
            refusal: NextResponse.json({ error: nearDuplicateMessage(counter), similar }, { status: 409 }),
          };
        }
      }

      const client = await tx.client.create({
        data: {
          ...input.client,
          toComplete: input.toComplete,
          emails: input.emails.length > 0 ? { create: input.emails } : undefined,
        },
        include: { emails: true },
      });
      const sites: Created["sites"] = [];
      for (const site of input.sites) {
        sites.push(
          await tx.site.create({ data: { clientId: client.id, ...site }, select: { id: true, name: true, city: true } })
        );
      }
      // The usual places belong to the site the client was created with —
      // to the whole client (the siège's, proposed everywhere) otherwise.
      if (input.places.length > 0) {
        const siteId = sites.length === 1 ? sites[0].id : null;
        await tx.clientPlace.createMany({
          data: input.places.map((place) => ({ clientId: client.id, siteId, ...place, usageCount: 0 })),
        });
      }
      return { client, sites };
    });

  let outcome: Outcome | null = null;
  for (let attempt = 1; outcome === null; attempt += 1) {
    try {
      outcome = await createOnce();
    } catch (error) {
      // Two site names the collation sees as one (validateNewSites compares
      // more strictly, so hardly ever): nothing was written.
      if ((error as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "Deux des sites portent le même nom : renommez l'un d'eux." }, { status: 409 });
      }
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
  if ("exactName" in outcome) {
    return NextResponse.json(exactNameRefusal(await exactNameHolders(outcome.exactName), counter), { status: 409 });
  }
  const { client, sites } = outcome;

  await logAudit({
    actorId: session.id,
    action: "CLIENT_CREATED",
    entity: "Client",
    entityId: client.id,
    metadata: {
      name: client.name,
      emails: input.emails.length,
      role: session.role,
      ...(input.origin ? { origin: input.origin } : {}),
      sites: sites.length,
      places: input.places.length,
      ...(input.toComplete ? { toComplete: true } : {}),
      ...(input.recipientsIgnored ? { recipientsIgnored: true } : {}),
      ...(input.confirmDuplicate ? { confirmedNotDuplicate: true } : {}),
    },
  });
  for (const site of sites) {
    await logAudit({
      actorId: session.id,
      action: "SITE_CREATED",
      entity: "Site",
      entityId: site.id,
      metadata: { clientId: client.id, name: site.name, city: site.city, withClient: true },
    });
  }

  // The new client as the pickers carry it: its sites, to select at once.
  return NextResponse.json({ ...client, sites: sites.map(({ id, name }) => ({ id, name })) }, { status: 201 });
}

/**
 * N1 (RETOUR-LABO-14-10.md §4.5): who bears the exact name refused — a live
 * client, or an archived fiche and the live client it now belongs to (with
 * the site made from it), read the way the search reads them.
 */
async function exactNameHolders(ids: readonly string[]) {
  const holders = await prisma.client.findMany({ where: { id: { in: [...ids] } }, include: CLIENT_INCLUDE, orderBy: { name: "asc" } });
  const loader = clientLoader(holders);
  const fiches = holders.filter((holder) => holder.archived);
  const origins = fiches.length > 0 && !holders.some((holder) => !holder.archived) ? await traceFiches(fiches, loader) : new Map<string, FicheOrigin>();
  return exactNameDecision(holders, origins, loader.clients);
}
