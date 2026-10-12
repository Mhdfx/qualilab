import type { Prisma } from "@/generated/prisma/client";
import { parseLabDayRange } from "./lab-day-range";

/**
 * The audit journal's filters (/admin/journal) — pure: the address read into
 * filters, the filters turned into a Prisma `where`, and the links that keep
 * them. « Qui a fait quoi sur l'échantillon X » is answered by filtering on
 * indexed columns only (`action`, `actorId`, `createdAt`, `entity` +
 * `entityId`); the metadata text is never searched.
 *
 * Paged by a keyset cursor on (createdAt, id), newest first, like every list
 * that grows with time (`lib/pagination.ts`): page 500 costs what page 1 does.
 *
 * Days are cut on the laboratory's clock (`lib/lab-day-range.ts`), the one
 * each entry's time is printed with: an entry shown « 09/10 23:40 » is in a
 * period ending on 09/10 even on a runtime with stale time zone data.
 */

export const JOURNAL_PATH = "/admin/journal";
export const JOURNAL_PAGE_SIZE = 50;

/** The `acteur` value for entries written with no signed-in user (« Système »). */
export const SYSTEM_ACTOR = "systeme";

/** Longest « Référence » read from the address (an N° is far shorter). */
export const MAX_REFERENCE_LENGTH = 100;

export type JournalCursor = { createdAt: Date; id: string };

export type JournalFilters = {
  /** One action code, among the known ones. */
  action: string | null;
  /** A known user id, or `SYSTEM_ACTOR`. */
  actor: string | null;
  /** « AAAA-MM-JJ » as asked (after putting a backwards period right). */
  fromDay: string | null;
  toDay: string | null;
  /** Start of `fromDay`, and start of the day AFTER `toDay` (exclusive), lab clock. */
  from: Date | null;
  until: Date | null;
  /** The « Référence » typed, trimmed; resolved to records by the page. */
  reference: string | null;
  /** Where the page starts: strictly older than this entry. */
  cursor: JournalCursor | null;
};

export type JournalKnown = {
  actions: ReadonlySet<string> | readonly string[];
  actorIds: ReadonlySet<string> | readonly string[];
};

type RawParams = URLSearchParams | Record<string, string | string[] | undefined>;

function reader(params: RawParams) {
  return (key: string): string | null => {
    const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
    // A repeated parameter reads its first value, like the other lists.
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
}

const has = (known: ReadonlySet<string> | readonly string[], value: string) =>
  known instanceof Set ? known.has(value) : (known as readonly string[]).includes(value);

const CURSOR_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CURSOR_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** `createdAt|id` — the last entry of a page, for « Actions plus anciennes ». */
export function encodeJournalCursor(entry: JournalCursor): string {
  return `${entry.createdAt.toISOString()}|${entry.id}`;
}

/** The cursor of the address; null for anything that is not one. */
export function decodeJournalCursor(raw: string | null): JournalCursor | null {
  if (!raw) return null;
  const bar = raw.indexOf("|");
  if (bar < 0) return null;
  const iso = raw.slice(0, bar);
  const id = raw.slice(bar + 1);
  if (!CURSOR_ISO.test(iso) || !CURSOR_ID.test(id)) return null;
  const createdAt = new Date(iso);
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id };
}

/**
 * `?action=&acteur=&du=&au=&ref=&curseur=` → filters. An unknown action or
 * user, a day that does not exist or a damaged cursor is ignored (the rest
 * of the filters still apply), never an error.
 */
export function parseJournalFilters(params: RawParams, known: JournalKnown): JournalFilters {
  const text = reader(params);

  const rawAction = text("action");
  const action = rawAction && has(known.actions, rawAction) ? rawAction : null;

  const rawActor = text("acteur");
  const actor =
    rawActor && (rawActor === SYSTEM_ACTOR || has(known.actorIds, rawActor)) ? rawActor : null;

  // A day that does not exist is ignored; a period typed backwards is the one meant.
  const { fromDay, toDay, from, until } = parseLabDayRange(text("du"), text("au"));

  const reference = text("ref")?.slice(0, MAX_REFERENCE_LENGTH).trim() || null;

  return {
    action,
    actor,
    fromDay,
    toDay,
    from,
    until,
    reference,
    cursor: decodeJournalCursor(text("curseur")),
  };
}

/** True when anything narrows the journal (the cursor alone does not). */
export function isFiltered(filters: JournalFilters): boolean {
  return Boolean(filters.action || filters.actor || filters.fromDay || filters.toDay || filters.reference);
}

/** One record the journal's entries can point at. */
export type AuditTarget = { entity: string; entityId: string };

/** What a « Référence » matched, as the page found it. */
export type ReferenceMatches = {
  /** Samples by field code or N° de contrôle, with the id of their report. */
  samples: { id: string; reportId: string | null }[];
  /** Séries by number (« 2780/26 »). */
  series: { id: string }[];
  /** Clients by id or exact name (several homonyms are all kept). */
  clients: { id: string }[];
  /** Invoices and credit notes by number (« FAC-2026-0001 », « AV-… »). */
  invoices: { id: string }[];
};

/**
 * The records a reference designates in the journal. A sample brings its
 * report: the report's downloads, duplicates, sending and amendment are
 * journalled on the report (`entityId` = report id), and the downloads
 * recorded before 08/10 carry the sample id under `Report`.
 */
export function referenceTargets(matches: ReferenceMatches): AuditTarget[] {
  const targets: AuditTarget[] = [];
  const seen = new Set<string>();
  const add = (entity: string, entityId: string | null) => {
    if (!entityId) return;
    const key = `${entity}\u0000${entityId}`;
    if (seen.has(key)) return;
    seen.add(key);
    targets.push({ entity, entityId });
  };
  for (const sample of matches.samples) {
    add("Sample", sample.id);
    add("Report", sample.reportId);
    add("Report", sample.id);
  }
  for (const serie of matches.series) add("Serie", serie.id);
  for (const client of matches.clients) add("Client", client.id);
  for (const invoice of matches.invoices) add("Invoice", invoice.id);
  return targets;
}

/**
 * The `where` of one page. `targets` is null when no reference was asked,
 * the records the reference resolved to otherwise — an empty list matches
 * nothing (the page says the reference was not found instead of querying).
 */
export function journalWhere(
  filters: JournalFilters,
  targets: readonly AuditTarget[] | null
): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (filters.action) and.push({ action: filters.action });
  if (filters.actor) and.push({ actorId: filters.actor === SYSTEM_ACTOR ? null : filters.actor });
  if (filters.from || filters.until) {
    and.push({
      createdAt: {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.until ? { lt: filters.until } : {}),
      },
    });
  }
  if (targets) {
    and.push(
      targets.length > 0
        ? { OR: targets.map((target) => ({ entity: target.entity, entityId: target.entityId })) }
        : { id: { in: [] } }
    );
  }
  if (filters.cursor) {
    const { createdAt, id } = filters.cursor;
    and.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: id } }] });
  }
  return and.length > 0 ? { AND: and } : {};
}

/** Newest first; the id breaks ties between entries of the same millisecond. */
export const JOURNAL_ORDER: Prisma.AuditLogOrderByWithRelationInput[] = [
  { createdAt: "desc" },
  { id: "desc" },
];

/**
 * One page out of `JOURNAL_PAGE_SIZE + 1` rows: the extra row only says that
 * older entries exist, and the cursor is the last row shown.
 */
export function journalPage<T extends { id: string; createdAt: Date }>(
  rows: T[],
  take: number = JOURNAL_PAGE_SIZE
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? encodeJournalCursor(last) : null };
}

/**
 * The journal's address for these filters — written with the names
 * `parseJournalFilters` reads. `cursor` = the page to open (« Actions plus
 * anciennes »); without it, the newest entries.
 */
export function journalHref(filters: JournalFilters, cursor: string | null = null): string {
  const params = new URLSearchParams();
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("acteur", filters.actor);
  if (filters.fromDay) params.set("du", filters.fromDay);
  if (filters.toDay) params.set("au", filters.toDay);
  if (filters.reference) params.set("ref", filters.reference);
  if (cursor) params.set("curseur", cursor);
  const query = params.toString();
  return query ? `${JOURNAL_PATH}?${query}` : JOURNAL_PATH;
}

/**
 * The short reference an entry prints next to its action, read from its
 * metadata (N° de contrôle, code, number or name). Never throws: a damaged
 * or non-object metadata simply prints nothing.
 */
export function entryMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) return {};
  try {
    const parsed: unknown = JSON.parse(metadata);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function entryReference(metadata: Record<string, unknown>): string | null {
  for (const key of ["controlCode", "code", "number", "name"]) {
    const value = metadata[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}
