import type { Prisma } from "@/generated/prisma/client";
import { parseLabNumber } from "./counters";
import { TAKE_LIST_BY_NUMBER } from "./lab-proposals";

/**
 * The order of « À prendre » at the bench — lot 5A, J8 (Q106 of 20/11 : « par
 * n° de série ou code d'échantillon », RETOUR-LABO-20-11.md §1 n° 15).
 *
 * The shared list is ranked by N° de série by default, with a choice « Trier
 * par : N° de série · N° de contrôle » kept in the address (`?tri=controle`,
 * next to `?vue=` and `?recus=`). The urgent samples keep their badge but no
 * longer lead the list: the answer does not name them — hypothèse, à
 * confirmer par D-2 (RETOUR-LABO-20-11.md §8). « Mes analyses » and the other
 * views keep the bench order (`BENCH_ORDER`: the urgent first, then the
 * oldest receptions).
 *
 * `Serie.serialNumber` (« 2780/26 ») and `Sample.controlCode` (« 40001/26 »)
 * are strings: an alphabetical sort puts « 100/26 » before « 99/26 ». Both
 * are drawn from a yearly counter under a row lock (`counters.ts`), the série
 * number at the série's creation and the control number at the sample's
 * reception. The database is asked for the order of those moments — by the
 * série's year, then the instant it was created, then the sample's line;
 * by the reception instant, then the line, for the control number — which
 * is the numeric order NEARLY always: the instant is stamped before the
 * transaction that locks the counter (`series/[id]/reception`,
 * `serie-create.ts`), so two receptions that overlap may stamp in one order
 * and draw in the other (review of lot 5A). So the rows loaded are sorted
 * again by the number itself, parsed (`parseLabNumber`: year, then
 * sequence — right even after a jump of the counter, Q19 « Compteurs »),
 * then the line; `code` and `id` break the last ties (« 1M », « 1P » of one
 * échantillon). A number that cannot be read comes last, by reception.
 * Pure.
 */

/**
 * The switch `TAKE_LIST_BY_NUMBER` (`lab-proposals.ts`) gives the way back:
 * off, « À prendre » follows the bench order again and offers no choice
 * (`takeListOrder`).
 */

/** The address parameter: `/technicien?tri=controle`. */
export const TAKE_SORT_PARAM = "tri";

/** The two orders of « À prendre », in the order the choice offers them. */
export const TAKE_SORTS = {
  serie: "N° de série",
  controle: "N° de contrôle",
} as const;
export type TakeSort = keyof typeof TAKE_SORTS;

/** The default — the laboratory's first words, « par n° de série ». */
export const DEFAULT_TAKE_SORT: TakeSort = "serie";

/** The order asked for in the address; anything else is the default. */
export function parseTakeSort(raw: unknown): TakeSort {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === "controle" ? "controle" : DEFAULT_TAKE_SORT;
}

/** What the address carries for an order: nothing for the default. */
export function takeSortQuery(sort: TakeSort): Record<string, string> {
  return sort === DEFAULT_TAKE_SORT ? {} : { [TAKE_SORT_PARAM]: sort };
}

/** The keys a loaded sample is ranked by (`compareTakeOrder`): its numbers, its line, its reception. */
export type TakeOrderKeys = {
  id: string;
  code: string;
  lineNumber: number;
  receivedAt: Date | null;
  controlCode: string | null;
  serie: { serialNumber: string };
};

/** The Prisma order of « À prendre » for a choice. */
export function takeOrderBy(sort: TakeSort): Prisma.SampleOrderByWithRelationInput[] {
  if (sort === "controle") {
    return [{ receivedAt: "asc" }, { lineNumber: "asc" }, { code: "asc" }, { id: "asc" }];
  }
  return [
    { serie: { year: "asc" } },
    { serie: { createdAt: "asc" } },
    { lineNumber: "asc" },
    { code: "asc" },
    { id: "asc" },
  ];
}

/** The bench order: the urgent samples first, then the oldest receptions (« Mes analyses », the views). */
export const BENCH_ORDER: Prisma.SampleOrderByWithRelationInput[] = [{ priority: "desc" }, { receivedAt: "asc" }];

/**
 * The order « À prendre » is listed in: by number (`takeOrderBy`) while the
 * switch is on, the bench order otherwise. `enabled` is the switch, passed by
 * the tests.
 */
export function takeListOrder(
  sort: TakeSort,
  enabled: boolean = TAKE_LIST_BY_NUMBER
): Prisma.SampleOrderByWithRelationInput[] {
  return enabled ? takeOrderBy(sort) : BENCH_ORDER;
}

/**
 * The order of « À prendre » on the rows loaded — by the number itself
 * (« 9/26, 10/26, 100/26 », the year first), never by the instant it was
 * drawn at (see above). A number that cannot be read comes after every one
 * that can, by reception (MySQL's place for a missing one: first).
 */
export function compareTakeOrder(sort: TakeSort, a: TakeOrderKeys, b: TakeOrderKeys): number {
  const keys = (row: TakeOrderKeys): (number | string)[] => {
    const number = parseLabNumber((sort === "controle" ? row.controlCode : row.serie.serialNumber) ?? "");
    const received = row.receivedAt ? row.receivedAt.getTime() : -Infinity;
    return number
      ? [0, number.year, number.sequence, 0, row.lineNumber, row.code, row.id]
      : [1, 0, 0, received, row.lineNumber, row.code, row.id];
  };
  const left = keys(a);
  const right = keys(b);
  for (let i = 0; i < left.length; i++) {
    if (left[i] < right[i]) return -1;
    if (left[i] > right[i]) return 1;
  }
  return 0;
}

/** The sentence under the list's title, for the order in force. */
export function takeListDescription(sort: TakeSort, enabled: boolean = TAKE_LIST_BY_NUMBER): string {
  if (!enabled) return "Programme confirmé, personne ne les a pris : les urgents d'abord, puis les plus anciens.";
  return sort === "controle"
    ? "Programme confirmé, personne ne les a pris : par N° de contrôle. Les urgents sont signalés."
    : "Programme confirmé, personne ne les a pris : par N° de série, puis par échantillon. Les urgents sont signalés.";
}

/**
 * « À prendre » as listed: the rows the database gave (`takeListOrder`)
 * sorted again by their numbers (`compareTakeOrder`) while the switch is on;
 * as given otherwise. `enabled` is the switch, passed by the tests.
 */
export function takeListRows<T extends TakeOrderKeys>(
  sort: TakeSort,
  rows: readonly T[],
  enabled: boolean = TAKE_LIST_BY_NUMBER
): T[] {
  return enabled ? [...rows].sort((a, b) => compareTakeOrder(sort, a, b)) : [...rows];
}

/**
 * What « À prendre » says when it is cut at `limit` rows: the urgent samples
 * no longer lead it (hypothèse D-2), so an urgent one past the limit would
 * not show — the notice counts them (review of lot 5A). Null when the list
 * is whole.
 */
export function truncatedTakeNotice(shown: number, limit: number, urgentShown: number, urgentTotal: number): string | null {
  if (shown < limit) return null;
  const base = `La liste est limitée aux ${limit} premiers échantillons.`;
  const hidden = urgentTotal - urgentShown;
  if (hidden <= 0) return base;
  return hidden > 1
    ? `${base} Attention : ${hidden} échantillons urgents à prendre n'y figurent pas.`
    : `${base} Attention : 1 échantillon urgent à prendre n'y figure pas.`;
}
