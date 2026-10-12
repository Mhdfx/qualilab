import type { EmailType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { dayRangeFilter, dayRangeParams, parseDayRange, type DayRange } from "./day-range";

/**
 * The send journal (`EmailLog`, finalversion.md:123: date, recipient,
 * status, resend) as /admin/envois lists it, and the words for its codes —
 * the single source for that page and the « Envois » block of the
 * validation page.
 */

/** What `sendEmail` records (`SendResult.status`, src/lib/email.ts). */
export const EMAIL_LOG_STATUSES = ["ENVOYE", "SIMULE", "ECHEC"] as const;
export type EmailLogStatus = (typeof EMAIL_LOG_STATUSES)[number];

export const EMAIL_STATUS_LABELS: Record<EmailLogStatus, string> = {
  ENVOYE: "Envoyé",
  // No mail provider configured yet (RESEND_API_KEY): recorded, not delivered.
  SIMULE: "Simulé — non remis",
  ECHEC: "Échec",
};

export const EMAIL_TYPE_LABELS: Record<EmailType, string> = {
  RAPPORT: "Rapport d'analyse",
  ALERTE_CONTAMINATION: "Alerte de contamination",
  DESTRUCTION: "Destruction à réception",
};

/** The label of a stored status; a value outside the list is shown as stored. */
export function emailStatusLabel(status: string): string {
  return isStatus(status) ? EMAIL_STATUS_LABELS[status] : status;
}

export function isStatus(value: string | null | undefined): value is EmailLogStatus {
  return typeof value === "string" && (EMAIL_LOG_STATUSES as readonly string[]).includes(value);
}

function isType(value: string | null | undefined): value is EmailType {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(EMAIL_TYPE_LABELS, value);
}

/** A cursor is the id of the last row shown (a cuid): anything else is ignored. */
const CURSOR = /^[a-z0-9]{8,40}$/i;

export type EmailLogFilters = DayRange & {
  type: EmailType | null;
  status: EmailLogStatus | null;
  /** `curseur`: continue after this row (`lib/pagination.ts`, newest first). */
  cursor: string | null;
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

function reader(params: Params) {
  return (key: string): string | null => {
    const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
}

/** Reads `?type=&statut=&du=&au=&curseur=`; an unknown value is ignored, never an error. */
export function parseEmailLogFilters(params: Params): EmailLogFilters {
  const text = reader(params);
  const type = text("type");
  const status = text("statut");
  const cursor = text("curseur");
  return {
    type: isType(type) ? type : null,
    status: isStatus(status) ? status : null,
    ...parseDayRange(text("du"), text("au")),
    cursor: cursor && CURSOR.test(cursor) ? cursor : null,
  };
}

/**
 * The filters as a `where`. The list is read newest first along the
 * `createdAt` index (`type` has its own `[type, createdAt]` one); the
 * status, a three-value column, only narrows the rows that walk reaches.
 */
export function emailLogWhere(filters: EmailLogFilters): Prisma.EmailLogWhereInput {
  const createdAt = dayRangeFilter(filters);
  return {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(createdAt ? { createdAt } : {}),
  };
}

/** Whether anything narrows the list (the « Effacer » link). */
export function hasEmailLogFilter(filters: EmailLogFilters): boolean {
  return filters.type !== null || filters.status !== null || filters.from !== null || filters.to !== null;
}

/** /admin/envois with these filters; `cursor` opens the next page. */
export function emailLogHref(filters: EmailLogFilters, cursor: string | null = null): string {
  const params = new URLSearchParams();
  if (filters.type) params.set("type", filters.type);
  if (filters.status) params.set("statut", filters.status);
  const { du, au } = dayRangeParams(filters);
  if (du) params.set("du", du);
  if (au) params.set("au", au);
  if (cursor) params.set("curseur", cursor);
  const query = params.toString();
  return query ? `/admin/envois?${query}` : "/admin/envois";
}
