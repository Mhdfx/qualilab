import "server-only";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAGE_SIZE, toPage } from "@/lib/pagination";
import { sampleSelectFor } from "@/lib/sample-select";
import { parseSampleSearch, sampleSearchWhere } from "@/lib/sample-search";
import { serieSelectFor, serializeSerie } from "@/lib/serie-select";
import { serieStatus } from "@/lib/series";
import type { SessionUser } from "@/lib/auth";

/**
 * The first data of the two client dashboards, read with the page (lot
 * performance P2-7) instead of by the browser once the page is there: the
 * table arrives with the document, and the dashboard fetches only when its
 * search changes.
 *
 * Each function asks exactly what the API the dashboard calls would answer
 * for that role and no search — the same `where`, `select`, order and page
 * size — and the page passes it through JSON, as the browser would read it.
 */

/** The headline figures of `GET /api/samples/stats`, counted over the whole table. */
export async function loadSampleStats() {
  const [total, byType, preleveurs] = await Promise.all([
    prisma.sample.count(),
    prisma.sample.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.sample.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);
  return {
    total,
    byType: Object.fromEntries(byType.map((row) => [row.type, row._count._all])) as Record<string, number>,
    activePreleveurs: preleveurs.length,
  };
}

/**
 * The administrator's first page of `GET /api/samples?limit=50`: no search,
 * every sample (the administrator is neither the préleveur, who reads their
 * own, nor the blind bench), the newest first.
 */
export async function adminFirstSamples() {
  const role = "ADMIN" as const;
  const where = sampleSearchWhere(parseSampleSearch(new URLSearchParams()), { blind: false });
  const rows = await prisma.sample.findMany({
    where,
    select: sampleSelectFor(role),
    orderBy: { createdAt: "desc" },
    take: DEFAULT_PAGE_SIZE + 1,
  });
  return toPage(rows, DEFAULT_PAGE_SIZE);
}

/**
 * The préleveur's first page of `GET /api/series?mine=1&limit=50`: their own
 * visits only (`createdById`, which the route forces for a préleveur), no
 * search and no status, the newest first.
 */
export async function preleveurFirstVisits(session: Pick<SessionUser, "id" | "role">, take: number) {
  const rows = await prisma.serie.findMany({
    where: { createdById: session.id },
    select: serieSelectFor(session.role),
    orderBy: { createdAt: "desc" },
    take: take + 1,
  });
  const page = toPage(rows, take);
  return { ...page, items: page.items.map((row) => serializeSerie(row, serieStatus(row.samples))) };
}

/** What the browser would have read: dates as strings, decimals as JSON writes them. */
export function asJson<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value));
}
