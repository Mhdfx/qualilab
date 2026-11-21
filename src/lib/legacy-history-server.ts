import "server-only";
import type { Interpretation } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { LEGACY_HISTORY_FLAG_NON_SATISFYING } from "./lab-proposals";
import {
  LEGACY_ORDER_BY,
  LEGACY_PAGE_SIZE,
  legacyHistoryWhere,
  legacyNonSatisfyingMark,
  legacySampleByIdWhere,
  storedReadings,
  type LegacyHistoryFilters,
  type LegacyReading,
} from "./legacy-history";

/**
 * Lot 5B (RETOUR-LABO-20-11.md §6, HA4–HA5) — the loaders of the old
 * software's history, shared by the portal (/portail/historique,
 * /api/portail/historique/**) and the fiche client (/commercial/[id]). Each
 * takes the client its caller's guard decided — the portal account's own
 * (`requirePortalPage` / `requirePortalApi`), or the fiche's for the
 * laboratory — and every query starts with it (`legacyHistoryWhere`): a
 * sample of another client is simply not found. Nothing here reads a price,
 * a member of the staff or another client.
 */

const ROW_SELECT = {
  id: true,
  controlNumber: true,
  serieNumber: true,
  designation: true,
  lot: true,
  place: true,
  nature: true,
  sampledAt: true,
  receivedAt: true,
  reportNumber: true,
  reportedAt: true,
  interpretation: true,
  verdictLabel: true,
  site: { select: { name: true } },
} as const;

type RowRecord = { id: number; site: { name: string } | null; interpretation: Interpretation | null };

/**
 * The rows as the screens get them: the site's name, and the mark of a
 * non-conformity without a sample verdict (`legacyNonSatisfyingMark`). The
 * analyses read « non satisfaisant » are looked up for the rows of the page
 * only — those without a sample verdict — through the (legacySampleId, …)
 * index: a relation count in the main query (`_count` with a `where`) would
 * aggregate the whole results table on every page (≈ 4 s measured on the
 * rehearsal copy, 695 572 analyses).
 */
async function toRows<T extends RowRecord>(records: T[]): Promise<(Omit<T, "site"> & { siteName: string | null; nonSatisfyingMark: boolean })[]> {
  const blank = LEGACY_HISTORY_FLAG_NON_SATISFYING ? records.filter((r) => r.interpretation === null).map((r) => r.id) : [];
  const failing =
    blank.length === 0
      ? []
      : await prisma.legacyResult.findMany({
          where: { legacySampleId: { in: blank }, interpretation: "NON_SATISFAISANT" },
          select: { legacySampleId: true },
          distinct: ["legacySampleId"],
        });
  const marked = new Set(failing.map((r) => r.legacySampleId));
  return records.map(({ site, ...row }) => ({
    ...row,
    siteName: site?.name ?? null,
    nonSatisfyingMark: legacyNonSatisfyingMark(row.interpretation, marked.has(row.id) ? 1 : 0, LEGACY_HISTORY_FLAG_NON_SATISFYING),
  }));
}

export type LegacyHistoryRow = {
  id: number;
  controlNumber: string | null;
  serieNumber: string | null;
  siteName: string | null;
  designation: string | null;
  lot: string | null;
  place: string | null;
  nature: string | null;
  sampledAt: Date | null;
  receivedAt: Date | null;
  reportNumber: string | null;
  reportedAt: Date | null;
  interpretation: Interpretation | null;
  verdictLabel: string | null;
  /** No sample verdict, an analysis « non satisfaisant »: « Analyse non satisfaisante » next to the « — ». */
  nonSatisfyingMark: boolean;
};

export type LegacyHistoryPage = { rows: LegacyHistoryRow[]; total: number; page: number; pages: number; pageSize: number };

/** One page (50 rows) of a client's history: one indexed query and its count. */
export async function loadLegacyHistory(clientId: string, filters: LegacyHistoryFilters): Promise<LegacyHistoryPage> {
  const where = legacyHistoryWhere(clientId, filters);
  const [total, records] = await Promise.all([
    prisma.legacySample.count({ where }),
    prisma.legacySample.findMany({
      where,
      select: ROW_SELECT,
      orderBy: LEGACY_ORDER_BY,
      take: LEGACY_PAGE_SIZE,
      skip: (filters.page - 1) * LEGACY_PAGE_SIZE,
    }),
  ]);
  return {
    rows: await toRows(records),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / LEGACY_PAGE_SIZE)),
    pageSize: LEGACY_PAGE_SIZE,
  };
}

export type LegacySampleDetail = LegacyHistoryRow & {
  productType: string | null;
  conclusion: string | null;
  observation: string | null;
  amendmentNote: string | null;
  results: {
    id: number;
    parameter: string;
    method: string | null;
    unit: string | null;
    value: string | null;
    readings: LegacyReading[];
    criterion: string | null;
    interpretation: Interpretation | null;
  }[];
};

/** One sample of the client's history with its analyses, or null — another client's too. */
export async function loadLegacySample(clientId: string, id: number): Promise<LegacySampleDetail | null> {
  const record = await prisma.legacySample.findFirst({
    where: legacySampleByIdWhere(clientId, id),
    select: {
      ...ROW_SELECT,
      productType: true,
      conclusion: true,
      observation: true,
      amendmentNote: true,
      results: {
        select: { id: true, parameter: true, method: true, unit: true, value: true, readings: true, criterion: true, interpretation: true },
        orderBy: [{ position: "asc" }, { id: "asc" }],
      },
    },
  });
  if (!record) return null;
  const { results, ...rest } = record;
  const [row] = await toRows([rest]);
  return { ...row, results: results.map((r) => ({ ...r, readings: storedReadings(r.readings) })) };
}

/** Whether the client has any history (the portal's menu shows the screen only then). */
export async function hasLegacyHistory(clientId: string): Promise<boolean> {
  const found = await prisma.legacySample.findFirst({ where: { clientId, cancelled: false }, select: { id: true } });
  return found !== null;
}

/** The sites the client's history was taken at, for the list's filter. */
export async function loadLegacySites(clientId: string): Promise<{ id: string; name: string }[]> {
  const ids = await prisma.legacySample.findMany({
    where: { clientId, cancelled: false, siteId: { not: null } },
    select: { siteId: true },
    distinct: ["siteId"],
  });
  const siteIds = ids.flatMap((row) => (row.siteId ? [row.siteId] : []));
  if (siteIds.length === 0) return [];
  return prisma.site.findMany({ where: { id: { in: siteIds }, clientId }, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export type LegacyHistorySummary = {
  total: number;
  byYear: { year: number; count: number }[];
  latest: LegacyHistoryRow[];
  links: { legacyClientId: number; legacyName: string; matchedBy: string; siteName: string | null; createdAt: Date }[];
};

const LATEST = 10;

/** The fiche client's card (HA5): samples per year, the ten latest, the links. */
export async function loadLegacyHistorySummary(clientId: string): Promise<LegacyHistorySummary> {
  const where = { clientId, cancelled: false };
  const [groups, latest, links] = await Promise.all([
    prisma.legacySample.groupBy({ by: ["year"], where, _count: { _all: true }, orderBy: { year: "desc" } }),
    prisma.legacySample.findMany({ where, select: ROW_SELECT, orderBy: LEGACY_ORDER_BY, take: LATEST }),
    prisma.legacyClientLink.findMany({
      where: { clientId },
      select: { legacyClientId: true, legacyName: true, matchedBy: true, createdAt: true, site: { select: { name: true } } },
      orderBy: { legacyName: "asc" },
    }),
  ]);
  const byYear = groups.map((g) => ({ year: g.year, count: g._count._all }));
  return {
    total: byYear.reduce((sum, y) => sum + y.count, 0),
    byYear,
    latest: await toRows(latest),
    links: links.map(({ site, ...link }) => ({ ...link, siteName: site?.name ?? null })),
  };
}

// ---- the import's follow-up (HA3) -------------------------------------------------------

type RunMetadata = { month?: string; part?: number; parts?: number; counts?: Record<string, number>; written?: Record<string, number>; durationMs?: number };

export type LegacyImportFollowUp = {
  byYear: { year: number; count: number }[];
  links: Partial<Record<"ICE" | "NOM" | "MAIN", number>>;
  excluded: number;
  /** The last run of each file (month and part), newest month first. */
  months: { month: string; part: number; parts: number; at: string; counts: Record<string, number>; written: Record<string, number>; durationMs: number | null }[];
};

/** « Importer l'historique » — samples per year, links, the months imported (the journal's LEGACY_HISTORY_IMPORTED). */
export async function loadLegacyImportFollowUp(): Promise<LegacyImportFollowUp> {
  const [byYear, links, excluded, runs] = await Promise.all([
    prisma.legacySample.groupBy({ by: ["year"], where: { cancelled: false }, _count: { _all: true }, orderBy: { year: "asc" } }),
    prisma.legacyClientLink.groupBy({ by: ["matchedBy"], where: { clientId: { not: null } }, _count: { _all: true } }),
    prisma.legacyClientLink.count({ where: { clientId: null } }),
    prisma.auditLog.findMany({
      where: { action: "LEGACY_HISTORY_IMPORTED" },
      select: { createdAt: true, metadata: true },
      orderBy: { createdAt: "desc" },
      take: 1000,
    }),
  ]);
  const months = new Map<string, LegacyImportFollowUp["months"][number]>();
  for (const run of runs) {
    let meta: RunMetadata = {};
    try {
      meta = run.metadata ? (JSON.parse(run.metadata) as RunMetadata) : {};
    } catch {
      continue;
    }
    if (typeof meta.month !== "string") continue;
    const key = `${meta.month}#${meta.part ?? 1}`;
    if (months.has(key)) continue;
    months.set(key, {
      month: meta.month,
      part: meta.part ?? 1,
      parts: meta.parts ?? 1,
      at: run.createdAt.toISOString(),
      counts: meta.counts ?? {},
      written: meta.written ?? {},
      durationMs: typeof meta.durationMs === "number" ? meta.durationMs : null,
    });
  }
  return {
    byYear: byYear.map((y) => ({ year: y.year, count: y._count._all })),
    links: Object.fromEntries(links.map((l) => [l.matchedBy, l._count._all])),
    excluded,
    months: [...months.values()].sort((a, b) => (a.month === b.month ? a.part - b.part : a.month < b.month ? 1 : -1)),
  };
}
