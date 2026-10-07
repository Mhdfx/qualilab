import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireApiRole, requireRole, type SessionUser } from "./auth";
import { auth } from "./auth-server";
import { AUDIT_ACTIONS, logAudit } from "./audit";
import { prisma } from "./prisma";
import { PORTAL_REFUSAL_MESSAGES, portalAccess, type PortalAccess } from "./portal-access";
import {
  PORTAL_ORDER_BY,
  PORTAL_PAGE_SIZE,
  PORTAL_SAMPLE_SELECT,
  countByStage,
  dashboardWindowStart,
  portalSampleByIdWhere,
  portalSampleWhere,
  recentReportsFirst,
  toPortalRow,
  type PortalFilters,
  type PortalRow,
  type StageCounts,
} from "./portal-query";

/**
 * The client portal's server side (PORTAIL.md): the guards that resolve the
 * signed-in account's client, and the loaders shared by the /portail pages
 * and the /api/portail routes. Every loader takes the clientId the guard
 * returned — never one read from a request.
 */

/** The account's client, read again from the database (never from the session cookie). */
async function resolveAccess(session: SessionUser): Promise<PortalAccess> {
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      role: true,
      clientId: true,
      client: { select: { id: true, name: true, archived: true, mergedIntoId: true } },
    },
  });
  if (!user) return { ok: false, reason: "NO_CLIENT" };
  return portalAccess(user);
}

/**
 * Page guard of /portail. Not signed in → /login; a laboratory account →
 * its own dashboard (`requireRole`). Returns the access decision: a page
 * renders the refusal message — and no data — when it is not `ok`.
 */
export async function requirePortalPage(): Promise<{ session: SessionUser; access: PortalAccess }> {
  const session = await requireRole("CLIENT");
  return { session, access: await resolveAccess(session) };
}

/**
 * API guard of /api/portail. 401 signed out, 403 for a laboratory account,
 * 403 with the explanation for a portal account without an open client.
 */
export async function requirePortalApi(): Promise<
  { session: SessionUser; clientId: string } | NextResponse
> {
  const session = await requireApiRole("CLIENT");
  if (session instanceof NextResponse) return session;
  const access = await resolveAccess(session);
  if (!access.ok) {
    return NextResponse.json({ error: PORTAL_REFUSAL_MESSAGES[access.reason] }, { status: 403 });
  }
  return { session, clientId: access.clientId };
}

/** The 404 every portal route answers for a resource outside the account's client. */
export function portalNotFound() {
  return NextResponse.json({ error: "Échantillon introuvable." }, { status: 404 });
}

/**
 * Journal « PORTAL_LOGIN » once per session (the first portal page it opens).
 * Never breaks the page.
 */
export async function logPortalLogin(userId: string, clientId: string): Promise<void> {
  try {
    const current = await auth.api.getSession({ headers: await headers() });
    const sessionId = current?.session?.id;
    if (!sessionId) return;
    const seen = await prisma.auditLog.findFirst({
      where: { entity: "Session", entityId: sessionId, action: AUDIT_ACTIONS.PORTAL_LOGIN },
      select: { id: true },
    });
    if (seen) return;
    await logAudit({
      actorId: userId,
      action: AUDIT_ACTIONS.PORTAL_LOGIN,
      entity: "Session",
      entityId: sessionId,
      metadata: { clientId },
    });
  } catch (error) {
    console.error("[portail] journal de connexion impossible", { userId, error });
  }
}

export type PortalPage = {
  rows: PortalRow[];
  total: number;
  page: number;
  pages: number;
  pageSize: number;
};

/** One page (50 rows) of the client's samples. */
export async function loadPortalSamples(clientId: string, filters: PortalFilters): Promise<PortalPage> {
  const where = portalSampleWhere(clientId, filters);
  const [total, records] = await Promise.all([
    prisma.sample.count({ where }),
    prisma.sample.findMany({
      where,
      select: PORTAL_SAMPLE_SELECT,
      orderBy: PORTAL_ORDER_BY,
      take: PORTAL_PAGE_SIZE,
      skip: (filters.page - 1) * PORTAL_PAGE_SIZE,
    }),
  ]);
  return {
    rows: records.map(toPortalRow),
    total,
    page: filters.page,
    pages: Math.max(1, Math.ceil(total / PORTAL_PAGE_SIZE)),
    pageSize: PORTAL_PAGE_SIZE,
  };
}

/** One sample of the client, or null — for a sample of another client too. */
export async function loadPortalSample(clientId: string, sampleId: string): Promise<PortalRow | null> {
  const record = await prisma.sample.findFirst({
    where: portalSampleByIdWhere(clientId, sampleId),
    select: PORTAL_SAMPLE_SELECT,
  });
  return record ? toPortalRow(record) : null;
}

export type PortalDashboard = {
  since: Date;
  counts: StageCounts;
  /** The latest available reports, amended ones first. */
  recentReports: PortalRow[];
};

const RECENT_REPORTS = 6;

/** The dashboard: the client's samples of the last 12 months, by portal state. */
export async function loadPortalDashboard(clientId: string, now = new Date()): Promise<PortalDashboard> {
  const since = dashboardWindowStart(now);
  const windowWhere = portalSampleWhere(clientId, { q: null, siteId: null, stage: null, from: since, to: null });
  const [groups, amended, latest] = await Promise.all([
    prisma.sample.groupBy({ by: ["status"], where: windowWhere, _count: { _all: true } }),
    prisma.sample.findMany({
      where: { ...windowWhere, status: "RAPPORT_ENVOYE", report: { version: { gt: 0 }, amendedAt: { gte: since } } },
      select: PORTAL_SAMPLE_SELECT,
      orderBy: [{ report: { amendedAt: "desc" } }, { id: "desc" }],
      take: RECENT_REPORTS,
    }),
    prisma.sample.findMany({
      where: { ...windowWhere, status: "RAPPORT_ENVOYE", report: { isNot: null } },
      select: PORTAL_SAMPLE_SELECT,
      orderBy: [{ report: { sentAt: "desc" } }, { id: "desc" }],
      take: RECENT_REPORTS,
    }),
  ]);
  const seen = new Set<string>();
  const merged = [...amended, ...latest].filter((record) => !seen.has(record.id) && !!seen.add(record.id));
  return {
    since,
    counts: countByStage(groups.map((group) => ({ status: group.status, count: group._count._all }))),
    recentReports: recentReportsFirst(merged.map(toPortalRow)).slice(0, RECENT_REPORTS),
  };
}

/** The client's sampling sites, for the list's filter (inactive ones too: old samples were taken there). */
export async function loadPortalSites(clientId: string): Promise<{ id: string; name: string }[]> {
  return prisma.site.findMany({
    where: { clientId },
    select: { id: true, name: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
}
