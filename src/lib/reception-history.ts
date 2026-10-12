import type { Prisma } from "@/generated/prisma/client";
import { dayRangeFilter, dayRangeParams, parseDayRange, type DayRange } from "./day-range";

/**
 * « Historique des réceptions » (/reception/historique): the séries already
 * received, newest reception first, 50 per page (`lib/pagination.ts`), by
 * period and client. Pure: the page queries with `receptionHistoryWhere`.
 */

export const RECEPTION_HISTORY_PATH = "/reception/historique";

/** The longest client text searched (a name, not a paragraph). */
export const CLIENT_QUERY_MAX = 100;

const CURSOR = /^[a-z0-9]{8,40}$/i;

export type ReceptionHistoryFilters = DayRange & {
  /** Part of the client's name, matched server-side. */
  client: string | null;
  /** `curseur`: continue after this série (newest reception first). */
  cursor: string | null;
};

type Params = URLSearchParams | Record<string, string | string[] | undefined>;

/** Reads `?du=&au=&client=&curseur=`; anything unreadable is ignored. */
export function parseReceptionHistoryFilters(params: Params): ReceptionHistoryFilters {
  const text = (key: string): string | null => {
    const raw = params instanceof URLSearchParams ? params.get(key) : params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const cursor = text("curseur");
  return {
    ...parseDayRange(text("du"), text("au")),
    client: text("client")?.slice(0, CLIENT_QUERY_MAX) ?? null,
    cursor: cursor && CURSOR.test(cursor) ? cursor : null,
  };
}

/** Received séries only, within the period (`Serie.receivedAt`), whose client's name contains the text. */
export function receptionHistoryWhere(filters: ReceptionHistoryFilters): Prisma.SerieWhereInput {
  const period = dayRangeFilter(filters);
  return {
    receivedAt: period ?? { not: null },
    ...(filters.client ? { client: { name: { contains: filters.client } } } : {}),
  };
}

export function hasReceptionHistoryFilter(filters: ReceptionHistoryFilters): boolean {
  return filters.from !== null || filters.to !== null || filters.client !== null;
}

/** /reception/historique with these filters; `cursor` opens the next page. */
export function receptionHistoryHref(filters: ReceptionHistoryFilters, cursor: string | null = null): string {
  const params = new URLSearchParams();
  const { du, au } = dayRangeParams(filters);
  if (du) params.set("du", du);
  if (au) params.set("au", au);
  if (filters.client) params.set("client", filters.client);
  if (cursor) params.set("curseur", cursor);
  const query = params.toString();
  return query ? `${RECEPTION_HISTORY_PATH}?${query}` : RECEPTION_HISTORY_PATH;
}

/**
 * The two counts of a received série: its samples (a two-family line
 * counts twice — two N° de contrôle), and those found non conforme at
 * reception (destroyed ones included). A sample received before the
 * conformity existed (null) is not counted as non conforme.
 */
export function receptionCounts(samples: readonly { conformity: boolean | null }[]): { samples: number; nonConform: number } {
  return { samples: samples.length, nonConform: samples.filter((sample) => sample.conformity === false).length };
}
