/**
 * Cursor pagination.
 *
 * Lists that grow with time — samples, invoices, the audit journal — are never
 * loaded whole. Cursor paging is used rather than page numbers because its cost
 * does not grow with depth: page 500 is as fast as page 1, which is the
 * difference between a system that stays quick after three years and one that
 * does not.
 */

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;

export type PageParams = {
  take: number;
  cursor?: { id: string };
  skip?: number;
};

/** Reads `?limit=` and `?cursor=` from a request, clamped to a sane range. */
export function pageParams(request: Request): PageParams {
  const url = new URL(request.url);

  const requested = Number(url.searchParams.get("limit"));
  const take =
    Number.isFinite(requested) && requested > 0
      ? Math.min(Math.trunc(requested), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  const cursor = url.searchParams.get("cursor");

  return cursor
    ? { take, cursor: { id: cursor }, skip: 1 }
    : { take };
}

export type Page<T> = {
  items: T[];
  /** Pass back as `?cursor=` to get the next page; null when there is no more. */
  nextCursor: string | null;
};

/**
 * Fetch one more row than asked for: its presence is what tells us whether a
 * next page exists, without a second COUNT query.
 */
export function toPage<T extends { id: string }>(
  rows: T[],
  take: number
): Page<T> {
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;

  return {
    items,
    nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null,
  };
}
