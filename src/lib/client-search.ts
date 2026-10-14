import { normalizeSiteName } from "./sites-import";

/**
 * The client search of the pickers (retour du 14/10, réception R1 / R10,
 * critique C7: « Nouveau dépôt : ajouter les sites au client (Afficher) »)
 * — pure, shared by `GET /api/clients?q=` and `ClientPicker`.
 *
 * Since the import of the sites (07/10) a restaurant or a shop is no longer
 * a client of its own: it is a site of its chain, and the client the import
 * of 01/10 had created for it is archived. Typing its name at the counter
 * must still find it. Besides the clients whose name, ICE or contact
 * matches, the search therefore answers:
 *
 *   - one row per active site whose name matches, on its client — shown
 *     « Client — Site », the site preselected in the sampling forms;
 *   - one row per archived fiche whose name matches and that now lives in
 *     another client — merged into it, attached as one of its sites, or
 *     archived by the import of the sites: the live client, with the site
 *     made from the fiche when it can be told. Never the archived fiche.
 *
 * One row per thing a form can pick — a client and one of its sites, or a
 * client and its siège: a name match first, then a site, then a fiche.
 *
 * With the text typed, the closest matches come first — the whole name,
 * then a name that starts with it, then one that contains it — so a
 * restaurant typed at the counter is never pushed out of the list by twenty
 * clients that merely share its first word (`matchRank`).
 */

/** At most this many rows per answer (the picker shows the first ones). */
export const CLIENT_SEARCH_LIMIT = 20;
/** Matching sites read per search, before the cap per client. */
export const SITE_SCAN_LIMIT = 100;
/** Matching archived fiches read per search. */
export const ARCHIVED_SCAN_LIMIT = 50;
/** Rows found through a site or a fiche, per client: a chain of 80 restaurants does not fill the list. */
export const MATCHED_ROWS_PER_CLIENT = 5;
/** Links followed after the first one, from an archived fiche to the live client (B merged into A, A into C). */
export const MAX_PARENT_HOPS = 3;
/** The journal entries that tell where an archived fiche went. */
export const ARCHIVING_ACTIONS = ["CLIENT_ARCHIVED", "CLIENT_ATTACHED_AS_SITE", "CLIENT_MERGED", "CLIENT_RESTORED"] as const;

export type SiteRef = { id: string; name: string };

/** A client as the route loads it: what the search reads, plus whatever the answer carries. */
export type SearchClient = {
  id: string;
  name: string;
  archived: boolean;
  mergedIntoId: string | null;
  /** Its active sites, the only ones a form may pick. */
  sites: SiteRef[];
};

/** An active site whose name matches the search. */
export type MatchedSite = { id: string; name: string; clientId: string };

/** An archived client whose name matches the search. */
export type ArchivedFiche = { id: string; name: string; mergedIntoId: string | null };

/** An entry of the journal about a client (`AuditLog`, entity « Client »). */
export type JournalEntry = { entityId: string | null; action: string; metadata: string | null };

/**
 * Where an archived fiche went, by its journal: merged into a client (a
 * duplicate of it), attached as one of its sites, archived by the import of
 * the sites — with the site named by the entry, when it names one.
 */
export type FicheOrigin = {
  kind: "merged" | "attached" | "imported" | "unknown";
  parentId: string | null;
  siteId: string | null;
};

/** A row of the answer: the client, and — found through a site or a fiche — what matched. */
export type ClientSearchRow<C> = C & {
  /** The site to preselect (« Client — Site »); null: the client's siège. Absent on a name match. */
  matchedSiteId?: string | null;
  /** What matched, as the picker prints it after the client's name. Absent on a name match. */
  matchedLabel?: string;
};

const UNKNOWN_ORIGIN: FicheOrigin = { kind: "unknown", parentId: null, siteId: null };

/** Names compared like the database's collation (utf8mb4_unicode_ci): case and accents ignored. */
const collator = new Intl.Collator("fr", { sensitivity: "base" });

function metadataOf(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

/**
 * Where an archived fiche went, from its journal entries, latest first.
 *
 * The entries written about the fiche itself count: « fusionnée dans »
 * (`CLIENT_MERGED`, `kept: false`), « rattachée comme site de »
 * (`CLIENT_ATTACHED_AS_SITE` with its `parentId`), the import of the sites
 * (`CLIENT_ARCHIVED`, `source: "import"`, with `parentId` and `siteId`).
 * Those where it was the client kept, and a plain archiving, say nothing of
 * where it went. A reactivation (`CLIENT_RESTORED`) closes the past: the
 * fiche lived on its own afterwards.
 */
export function ficheOrigin(entries: readonly Pick<JournalEntry, "action" | "metadata">[]): FicheOrigin {
  for (const entry of entries) {
    if (entry.action === "CLIENT_RESTORED") break;
    const data = metadataOf(entry.metadata);
    if (!data) continue;
    if (entry.action === "CLIENT_MERGED" && data.kept === false) {
      return { kind: "merged", parentId: text(data.intoId), siteId: null };
    }
    if (entry.action === "CLIENT_ATTACHED_AS_SITE" && text(data.parentId)) {
      return { kind: "attached", parentId: text(data.parentId), siteId: text(data.siteId) };
    }
    if (entry.action === "CLIENT_ARCHIVED" && data.source === "import" && text(data.parentId)) {
      return { kind: "imported", parentId: text(data.parentId), siteId: text(data.siteId) };
    }
  }
  return UNKNOWN_ORIGIN;
}

/** Each fiche's origin, from the journal entries about them (latest first, as read). */
export function ficheOrigins(journal: readonly JournalEntry[]): Map<string, FicheOrigin> {
  const byFiche = new Map<string, Pick<JournalEntry, "action" | "metadata">[]>();
  for (const entry of journal) {
    if (!entry.entityId) continue;
    const list = byFiche.get(entry.entityId);
    if (list) list.push(entry);
    else byFiche.set(entry.entityId, [entry]);
  }
  return new Map([...byFiche].map(([id, entries]) => [id, ficheOrigin(entries)]));
}

/**
 * The client an archived fiche leads to first: its `mergedIntoId` (merge,
 * attach, the import of the sites since 08/10), else the parent its journal
 * names — the import of 07/10 archived its fiches before the column existed
 * (HANDOFF, clients fusion; `importedParentId` on the client fiche).
 */
export function firstParentId(fiche: Pick<ArchivedFiche, "mergedIntoId">, origin: FicheOrigin | undefined): string | null {
  return fiche.mergedIntoId ?? (origin?.kind === "imported" ? origin.parentId : null);
}

/**
 * The live client at the end of the links: an archived client merged into
 * another one leads to it, up to `maxHops` links after the first. Null when
 * the chain ends on a client not loaded, on an archived client that leads
 * nowhere, or loops.
 */
export function liveParent<C extends Pick<SearchClient, "archived" | "mergedIntoId">>(
  startId: string | null,
  clients: ReadonlyMap<string, C>,
  maxHops = MAX_PARENT_HOPS
): C | null {
  const seen = new Set<string>();
  let id = startId;
  for (let hop = 0; id && hop <= maxHops && !seen.has(id); hop += 1) {
    seen.add(id);
    const client = clients.get(id);
    if (!client) return null;
    if (!client.archived) return client;
    id = client.mergedIntoId;
  }
  return null;
}

/** The clients still to load for `liveParent` to finish from these starts — one more link per call. */
export function missingParents(
  startIds: readonly (string | null)[],
  clients: ReadonlyMap<string, Pick<SearchClient, "archived" | "mergedIntoId">>,
  maxHops = MAX_PARENT_HOPS
): string[] {
  const missing = new Set<string>();
  for (const start of startIds) {
    const seen = new Set<string>();
    let id = start;
    for (let hop = 0; id && hop <= maxHops && !seen.has(id); hop += 1) {
      seen.add(id);
      const client = clients.get(id);
      if (!client) {
        missing.add(id);
        break;
      }
      if (!client.archived) break;
      id = client.mergedIntoId;
    }
  }
  return [...missing];
}

/**
 * The site made from an archived fiche, among the live client's active
 * sites: the one its journal names, else — unless the fiche was merged, a
 * duplicate of the client rather than one of its places — the site of the
 * same normalised name, the rule the import of the sites and « Rattacher
 * comme site de… » follow. Null when none is active. (A fiche merged into a
 * client that became a site since: `mergedFicheSite`.)
 */
export function ficheSite(fiche: Pick<ArchivedFiche, "name">, origin: FicheOrigin, sites: readonly SiteRef[]): SiteRef | null {
  if (origin.siteId) {
    const recorded = sites.find((site) => site.id === origin.siteId);
    if (recorded) return recorded;
  }
  if (origin.kind === "merged") return null;
  const key = normalizeSiteName(fiche.name);
  return (key && sites.find((site) => normalizeSiteName(site.name) === key)) || null;
}

/**
 * The clients the fiches were merged into, whose own journal may tell they
 * became a site since (`mergedFicheSite`) — except those known to be live:
 * a fiche merged into a live client is a duplicate of it, nothing more to
 * read. The route reads their journal and adds it to the fiches' origins.
 */
export function mergeTargets(
  origins: ReadonlyMap<string, FicheOrigin>,
  clients: ReadonlyMap<string, Pick<SearchClient, "archived">>
): string[] {
  const targets = new Set<string>();
  for (const origin of origins.values()) {
    if (origin.kind === "merged" && origin.parentId && clients.get(origin.parentId)?.archived !== false) {
      targets.add(origin.parentId);
    }
  }
  return [...targets];
}

/**
 * The site a merged fiche stands for when the client it was merged into
 * became one of the live client's sites since (relecture du lot 1): B
 * merged into A, then A attached as a site of C, or archived by the import
 * of the sites — B's history now lives on that site, so its row preselects
 * it rather than the siège. Read from A's own journal (`origins`, by client),
 * through further merges (A into A2, A2 attached) up to `maxHops` links.
 * Null when the fiche was merged into the live client itself — a duplicate
 * of it, its siège — or the chain cannot be read to a site of the client.
 */
export function mergedFicheSite(
  origin: FicheOrigin,
  parent: Pick<SearchClient, "id" | "sites">,
  origins: ReadonlyMap<string, FicheOrigin>,
  clients: ReadonlyMap<string, Pick<SearchClient, "name">>,
  maxHops = MAX_PARENT_HOPS
): SiteRef | null {
  if (origin.kind !== "merged") return null;
  const seen = new Set<string>();
  let current: FicheOrigin = origin;
  let target = "";
  while (current.kind === "merged") {
    const next = current.parentId;
    if (!next || next === parent.id || seen.has(next) || seen.size > maxHops) return null;
    seen.add(next);
    target = next;
    const found = origins.get(next);
    if (!found) return null;
    current = found;
  }
  if (current.kind !== "attached" && current.kind !== "imported") return null;
  // The site its journal names, else the site bearing its name — when the client is loaded.
  return ficheSite({ name: clients.get(target)?.name ?? "" }, current, parent.sites);
}

/**
 * What a fiche's row prints after the client's name: the site when it bears
 * the fiche's name, the site and the fiche when the site was named otherwise,
 * the fiche alone when no site can be told (« Client — ancienne fiche « X » »).
 */
export function ficheLabel(ficheName: string, site: SiteRef | null): string {
  if (!site) return `ancienne fiche « ${ficheName} »`;
  return normalizeSiteName(site.name) === normalizeSiteName(ficheName)
    ? site.name
    : `${site.name} (ancienne fiche « ${ficheName} »)`;
}

function rowKey(clientId: string, siteId: string | null | undefined) {
  return `${clientId}|${siteId ?? ""}`;
}

type Extra<C> = { client: C; matchedSiteId: string | null; matchedLabel: string; rank: number };

/**
 * How closely a name answers the text typed: 0 the whole name, 1 a name
 * that starts with it, 2 one that contains it, 3 otherwise (a client found
 * by its ICE or its contact). Case, accents and punctuation are ignored, as
 * the database's collation does.
 */
export function matchRank(name: string, query: string | null | undefined): number {
  const q = query ? normalizeSiteName(query) : "";
  if (!q) return 3;
  const n = normalizeSiteName(name);
  if (n === q) return 0;
  if (n.startsWith(q)) return 1;
  return n.includes(q) ? 2 : 3;
}

/** By name as the pickers print it, then by id: one order for every read. */
function byName(a: Pick<SearchClient, "id" | "name">, b: Pick<SearchClient, "id" | "name">): number {
  return collator.compare(a.name, b.name) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * The clients matched on their own name, ICE or contact, from the route's
 * two reads (relecture du lot 1): the names that start with the text — read
 * apart, so a client typed in full is never cut by twenty names that merely
 * contain it and sort before it — and those whose name, ICE or contact
 * contains it. Each client once, by name: the order `clientSearchRows`
 * merges on.
 */
export function directMatches<C extends Pick<SearchClient, "id" | "name">>(...reads: readonly (readonly C[])[]): C[] {
  const byId = new Map<string, C>();
  for (const read of reads) {
    for (const client of read) if (!byId.has(client.id)) byId.set(client.id, client);
  }
  return [...byId.values()].sort(byName);
}

/**
 * The answer of the search. `direct` comes by name (`directMatches`); the
 * rows found through a site or a fiche join it at their client's name —
 * after the client's own row, the closest matches first, then sites before
 * the siège, then by label — at most `MATCHED_ROWS_PER_CLIENT` per client;
 * with a query, the closest matches lead the whole (`matchRank`), and the
 * whole is cut at `limit`. Archived clients are never answered unless
 * `includeArchived` (then the route reads no fiche).
 */
export function clientSearchRows<C extends SearchClient>(input: {
  /** Clients matched on their name, ICE or contact, by name (`directMatches`). */
  direct: readonly C[];
  /** Active sites matched on their name. */
  sites: readonly MatchedSite[];
  /** Archived clients matched on their name. */
  fiches: readonly ArchivedFiche[];
  /** Where each fiche went (`ficheOrigins`) — and the clients they were merged into (`mergeTargets`). */
  origins: ReadonlyMap<string, FicheOrigin>;
  /** Every client loaded: the direct ones, the sites' clients, the fiches' parents. */
  clients: ReadonlyMap<string, C>;
  includeArchived?: boolean;
  limit?: number;
  /** The text typed: the closest matches come first (`matchRank`). Absent: by name only. */
  query?: string | null;
}): ClientSearchRow<C>[] {
  const limit = input.limit ?? CLIENT_SEARCH_LIMIT;
  const taken = new Set(input.direct.map((client) => rowKey(client.id, null)));
  const extras: Extra<C>[] = [];
  const offer = (client: C, siteId: string | null, label: string, matched: string) => {
    const key = rowKey(client.id, siteId);
    if (taken.has(key)) return;
    taken.add(key);
    extras.push({ client, matchedSiteId: siteId, matchedLabel: label, rank: matchRank(matched, input.query) });
  };

  for (const site of input.sites) {
    const client = input.clients.get(site.clientId);
    if (!client || (client.archived && !input.includeArchived)) continue;
    // Offered only while the client lists it: a form preselects nothing else.
    if (!client.sites.some((own) => own.id === site.id)) continue;
    offer(client, site.id, site.name, site.name);
  }

  for (const fiche of input.fiches) {
    const origin = input.origins.get(fiche.id) ?? UNKNOWN_ORIGIN;
    const parent = liveParent(firstParentId(fiche, origin), input.clients);
    // Never the fiche itself, whatever a stale link says.
    if (!parent || parent.id === fiche.id) continue;
    const site = ficheSite(fiche, origin, parent.sites) ?? mergedFicheSite(origin, parent, input.origins, input.clients);
    offer(parent, site?.id ?? null, ficheLabel(fiche.name, site), fiche.name);
  }

  // The closest matches first within each client, so the cap below keeps
  // them (relecture du lot 1): a site typed in full is never dropped for five
  // looser matches of the same chain that sort before it.
  extras.sort(
    (a, b) =>
      byName(a.client, b.client) ||
      a.rank - b.rank ||
      Number(a.matchedSiteId === null) - Number(b.matchedSiteId === null) ||
      collator.compare(a.matchedLabel, b.matchedLabel)
  );
  const perClient = new Map<string, number>();
  const kept = extras.filter((extra) => {
    const count = (perClient.get(extra.client.id) ?? 0) + 1;
    perClient.set(extra.client.id, count);
    return count <= MATCHED_ROWS_PER_CLIENT;
  });

  // Merged by name: on equal names the client's own row comes first.
  const merged: { row: ClientSearchRow<C>; rank: number }[] = [];
  let d = 0;
  let e = 0;
  while (d < input.direct.length || e < kept.length) {
    if (e >= kept.length || (d < input.direct.length && collator.compare(input.direct[d].name, kept[e].client.name) <= 0)) {
      merged.push({ row: input.direct[d], rank: matchRank(input.direct[d].name, input.query) });
      d += 1;
    } else {
      const { client, matchedSiteId, matchedLabel, rank } = kept[e];
      merged.push({ row: { ...client, matchedSiteId, matchedLabel }, rank });
      e += 1;
    }
  }
  // The closest matches first; the name order within each (a stable sort).
  if (input.query) merged.sort((a, b) => a.rank - b.rank);
  return merged.slice(0, limit).map((entry) => entry.row);
}

// ---- the picker --------------------------------------------------------------------------------

/** A row of `ClientPicker`: a client, and the site it was found by when it was. */
export type PickerRow = {
  key: string;
  id: string;
  name: string;
  ice: string | null;
  sites: SiteRef[];
  /** The site to preselect, one of `sites`; null: none (a name match, the siège). */
  siteId: string | null;
  /** What matched, printed « Client — label »; null on a name match. */
  label: string | null;
};

function siteRefs(value: unknown): SiteRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((site) => {
    const row = (site ?? {}) as { id?: unknown; name?: unknown };
    return typeof row.id === "string" && typeof row.name === "string" ? [{ id: row.id, name: row.name }] : [];
  });
}

/**
 * The answer of `GET /api/clients?q=` as `ClientPicker` lists it, minus the
 * clients the screen excludes, at most `max` rows.
 *
 * `siteRows` (the visit and the deposit): one row per client and site, the
 * site to preselect with it. Otherwise (billing clients, merge, attach,
 * invoice): one row per client, at its first row, and no site, since those
 * screens choose a client only — printed without « — label » when its own
 * name matches anywhere in the answer (relecture du lot 1: a site typed in
 * full ranks before its client's own row, yet the client alone is picked).
 */
export function pickerRows(
  data: unknown,
  options: { excluded: ReadonlySet<string>; siteRows: boolean; max: number }
): PickerRow[] {
  if (!Array.isArray(data)) return [];
  const rows: PickerRow[] = [];
  const seen = new Set<string>();
  const labelOf = (raw: Record<string, unknown>) =>
    typeof raw.matchedLabel === "string" && raw.matchedLabel.trim() ? raw.matchedLabel : null;
  // The clients answered on their own name: on a client-only screen, no label.
  const ownRow = new Set<string>();
  if (!options.siteRows) {
    for (const item of data) {
      const raw = (item ?? {}) as Record<string, unknown>;
      if (typeof raw.id === "string" && labelOf(raw) === null) ownRow.add(raw.id);
    }
  }
  for (const item of data) {
    if (rows.length >= options.max) break;
    const raw = (item ?? {}) as Record<string, unknown>;
    if (typeof raw.id !== "string" || typeof raw.name !== "string" || options.excluded.has(raw.id)) continue;
    const sites = siteRefs(raw.sites);
    const matched = typeof raw.matchedSiteId === "string" ? raw.matchedSiteId : null;
    const siteId = options.siteRows && matched && sites.some((site) => site.id === matched) ? matched : null;
    const key = options.siteRows ? rowKey(raw.id, siteId) : raw.id;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      key,
      id: raw.id,
      name: raw.name,
      ice: typeof raw.ice === "string" ? raw.ice : null,
      sites,
      siteId,
      label: ownRow.has(raw.id) ? null : labelOf(raw),
    });
  }
  return rows;
}
