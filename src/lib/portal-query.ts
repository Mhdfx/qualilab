import type { Prisma } from "@/generated/prisma/client";
import type { AirMethod, LineKind, SampleStatus, SurfaceState } from "@/generated/prisma/enums";
import { sampleDesignation } from "./document-html";
import {
  PORTAL_STAGES,
  isPortalStage,
  portalStage,
  portalStageFilter,
  reportAvailableOnPortal,
  type PortalStage,
} from "./portal-status";
import { amendedNumber } from "./report-amendment";

/**
 * The portal's queries (PORTAIL.md §2) — pure: filters read from the URL,
 * the Prisma `where` that ALWAYS starts with the account's client, and the
 * shape a row takes before it leaves the server. Nothing here reads a client
 * id from the request: the only scope is the one `portalAccess` resolved from
 * the signed-in account.
 */

export const PORTAL_PAGE_SIZE = 50;
/** Highest page number accepted from a URL (50 × 2 000 = 100 000 samples). */
const MAX_PAGE = 2000;

/** The `site` value meaning « Siège »: the séries recorded without a site. */
export const PORTAL_SIEGE = "siege";

export type PortalFilters = {
  q: string | null;
  /** A site id, or `PORTAL_SIEGE`. A site of another client simply matches nothing. */
  siteId: string | null;
  stage: PortalStage | null;
  /** Inclusive day bounds on the sampling date, the lab's wall clock. */
  from: Date | null;
  to: Date | null;
  page: number;
};

/** « 2026-09-01 » → the start (or end) of that day; anything else → null. */
function day(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** « 2026-09-01 » of a date, for the form fields and the links. */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function parsePortalFilters(params: URLSearchParams): PortalFilters {
  const text = (key: string) => params.get(key)?.trim() || null;
  let from = day(text("du"), false);
  let to = day(text("au"), true);
  // A period typed backwards is still the period the client meant.
  if (from && to && from > to) [from, to] = [day(text("au"), false), day(text("du"), true)];
  const stage = text("etat");
  const site = text("site");
  const page = Number.parseInt(text("page") ?? "1", 10);
  return {
    q: text("q")?.slice(0, 100) ?? null,
    siteId: site && site.length <= 191 ? site : null,
    stage: isPortalStage(stage) ? stage : null,
    from,
    to,
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
  };
}

/** The query string of a filter set, for the pagination links and the dashboard cards. */
export function portalQueryString(filters: Partial<PortalFilters>, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.siteId) params.set("site", filters.siteId);
  if (filters.stage) params.set("etat", filters.stage);
  if (filters.from) params.set("du", isoDay(filters.from));
  if (filters.to) params.set("au", isoDay(filters.to));
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params.toString();
}

/**
 * The `where` of the list. The client is a top-level equality that no filter
 * can widen: every other condition is AND-ed under it.
 */
export function portalSampleWhere(clientId: string, filters: Omit<PortalFilters, "page">): Prisma.SampleWhereInput {
  if (!clientId) throw new Error("portalSampleWhere: client manquant");
  const and: Prisma.SampleWhereInput[] = [];
  if (filters.stage) and.push({ status: { in: portalStageFilter(filters.stage) } });
  if (filters.siteId) {
    and.push({ serie: { siteId: filters.siteId === PORTAL_SIEGE ? null : filters.siteId } });
  }
  if (filters.from || filters.to) {
    and.push({
      sampledAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) },
    });
  }
  const q = filters.q;
  if (q) {
    and.push({
      OR: [
        { controlCode: { contains: q } },
        { serie: { serialNumber: { contains: q } } },
        { serie: { site: { name: { contains: q } } } },
        { produit: { contains: q } },
        { surfaceLabel: { contains: q } },
        { personName: { contains: q } },
        { numeroLot: { contains: q } },
        { lieu: { contains: q } },
        // Never the blind serial number (Sample.serialNumber): the analysis
        // stays blind, for the client too.
      ],
    });
  }
  return { clientId, ...(and.length > 0 ? { AND: and } : {}) };
}

/** One sample of the client, by id — anything else (another client's) is not found. */
export function portalSampleByIdWhere(clientId: string, sampleId: string): Prisma.SampleWhereInput {
  if (!clientId) throw new Error("portalSampleByIdWhere: client manquant");
  return { id: sampleId, clientId };
}

/** Newest sampling first; the id breaks ties so the pages never overlap. */
export const PORTAL_ORDER_BY: Prisma.SampleOrderByWithRelationInput[] = [{ sampledAt: "desc" }, { id: "desc" }];

/** The 12 months of the dashboard (PORTAIL.md §2): from the same day one year ago, 00:00. */
export function dashboardWindowStart(now: Date): Date {
  const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  // 29 February one year on rolls to 1 March: keep the day before instead.
  if (start.getMonth() !== now.getMonth() && now.getMonth() === 1) start.setDate(0);
  return start;
}

export type StageCounts = Record<PortalStage, number> & { total: number };

/** Turns a `groupBy(status)` into the dashboard's counts per portal state. */
export function countByStage(groups: { status: SampleStatus; count: number }[]): StageCounts {
  const counts = Object.fromEntries(PORTAL_STAGES.map((stage) => [stage, 0])) as Record<PortalStage, number>;
  let total = 0;
  for (const group of groups) {
    counts[portalStage(group.status)] += group.count;
    total += group.count;
  }
  return { ...counts, total };
}

/** The select of a portal row: nothing about prices, results or the laboratory's staff. */
export const PORTAL_SAMPLE_SELECT = {
  id: true,
  controlCode: true,
  status: true,
  lineKind: true,
  produit: true,
  surfaceLabel: true,
  surfaceState: true,
  personName: true,
  airMethod: true,
  numeroLot: true,
  sampledAt: true,
  receivedAt: true,
  serie: { select: { serialNumber: true, site: { select: { name: true } } } },
  report: { select: { number: true, version: true, sentAt: true, amendedAt: true, amendmentPending: true } },
} as const;

export type PortalSampleRecord = {
  id: string;
  controlCode: string | null;
  status: SampleStatus;
  lineKind: LineKind;
  produit: string | null;
  surfaceLabel: string | null;
  surfaceState: SurfaceState | null;
  personName: string | null;
  airMethod: AirMethod | null;
  numeroLot: string | null;
  sampledAt: Date;
  receivedAt: Date | null;
  serie: { serialNumber: string; site: { name: string } | null };
  report: {
    number: string;
    version: number;
    sentAt: Date | null;
    amendedAt: Date | null;
    /** « Amendement en cours »: the report being redone is never offered meanwhile. */
    amendmentPending?: boolean;
  } | null;
};

export type PortalRow = {
  id: string;
  controlCode: string | null;
  serialNumber: string;
  /** The série's site, null for the « Siège ». */
  siteName: string | null;
  designation: string | null;
  numeroLot: string | null;
  sampledAt: Date;
  receivedAt: Date | null;
  stage: PortalStage;
  /** Set only once the report is available: before that nothing of it leaves the laboratory. */
  report: { number: string; sentAt: Date | null; amended: boolean } | null;
};

/**
 * The row a client sees. The report (its printed number, its date, whether
 * it was amended) appears only at « Rapport disponible »; a sample reopened
 * for amendment shows none until the amended report is sent.
 */
export function toPortalRow(sample: PortalSampleRecord): PortalRow {
  // Same rule as the download route: sent, and not reopened for amendment
  // (the reopening also moves the sample back to « En analyse »; this is the
  // second lock should the two ever disagree).
  const available =
    reportAvailableOnPortal(sample.status) && sample.report !== null && sample.report.amendmentPending !== true;
  return {
    id: sample.id,
    controlCode: sample.controlCode,
    serialNumber: sample.serie.serialNumber,
    siteName: sample.serie.site?.name ?? null,
    designation: sampleDesignation(sample),
    numeroLot: sample.numeroLot,
    sampledAt: sample.sampledAt,
    receivedAt: sample.receivedAt,
    stage: portalStage(sample.status),
    report:
      available && sample.report
        ? {
            number: amendedNumber(sample.report.number, sample.report.version),
            sentAt: sample.report.sentAt,
            amended: sample.report.version > 0,
          }
        : null,
  };
}

/**
 * « Rapports amendés en tête de liste » (PORTAIL.md §2): the recent reports
 * of the dashboard, amended ones first, then the most recently sent.
 */
export function recentReportsFirst(rows: PortalRow[]): PortalRow[] {
  const time = (date: Date | null) => (date ? date.getTime() : 0);
  return rows
    .filter((row) => row.report !== null)
    .sort((a, b) => {
      const amended = Number(b.report!.amended) - Number(a.report!.amended);
      return amended !== 0 ? amended : time(b.report!.sentAt) - time(a.report!.sentAt);
    });
}

/** The portal's download link of a sample's report. */
export function portalReportHref(sampleId: string): string {
  return `/api/portail/echantillons/${encodeURIComponent(sampleId)}/rapport`;
}
