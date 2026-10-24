import type { Prisma } from "@/generated/prisma/client";
import { formatReportNumber, nextNumber, setCounter } from "./counters";
import { documentYear } from "./invoice-number";

/**
 * Official analysis report numbers « RAP-AAAA-NNNNN » (HANDOFF §9, lot 2D
 * item 5).
 *
 * Drawn from the counters table (kind RAPPORT, one row per year), inside
 * the transaction that issues the report: the counter row stays locked
 * until it commits, so simultaneous approvals draw distinct consecutive
 * numbers, and an issue that fails rolls back without burning one.
 *
 * The former `generateReportNumber()` (highest number + 1, read outside any
 * transaction) let two approvals at the same instant pick the same number:
 * the unique index refused the second, retried up to ten times — four
 * simultaneous approvals had left one report-less with three tries.
 *
 * No migration and no data write at deploy: each issue first seats the
 * year's counter at the highest report already issued (`GREATEST`, never
 * lower) — on the first approval after the deploy the row is created there,
 * so the numbers continue (RAP-2026-00009 → RAP-2026-00010), and on 1st
 * January the new year's row starts at RAP-AAAA-00001. Not on the
 * « Compteurs » screen (`COUNTER_KINDS`): nobody types it.
 */

/** An open transaction — or the client itself, for the seat committed on its own. */
type Tx = Prisma.TransactionClient;

/**
 * The highest sequence among `numbers` for `year` — « RAP-2026-00009 » → 9.
 * Read leniently, from the head of the number: whatever follows the digits
 * (an « -A1 », a hand fix, an import's suffix) does not hide them — read
 * strictly, such a top record would seat the counter at 0, every draw of
 * the year would clash with a number already issued, and no report could be
 * issued until it was fixed. Another year or free text is skipped. The
 * strict `parseReportNumber` stays the rule for showing and checking one.
 */
export function highestReportSequence(year: number, numbers: readonly (string | null)[]): number {
  let highest = 0;
  for (const number of numbers) {
    const match = number ? /^\s*RAP-(\d{4})-(\d+)/.exec(number) : null;
    if (match && Number(match[1]) === year) highest = Math.max(highest, Number(match[2]));
  }
  return highest;
}

/**
 * The highest report number of `year` already on a record. The unique index
 * on `Report.number` serves the prefix and the order: one row read. The
 * number is zero-padded to five digits, so the text order is the numeric
 * one up to 99 999 a year — and past it the counter, which `GREATEST`
 * never lowers, stays the reference anyway.
 */
async function highestIssued(db: Tx, year: number): Promise<number> {
  const last = await db.report.findFirst({
    where: { number: { startsWith: `RAP-${year}-` } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  return highestReportSequence(year, [last?.number ?? null]);
}

/**
 * Seats the RAPPORT row of the issue's year at the highest report already
 * issued (`GREATEST`: never lower), creating it on first use. Inside the
 * draw it is the repair (a number written outside the counter); on its
 * own, committed at once, it creates the year's row before any issuing
 * transaction locks it (`ensureReportCounter`).
 */
export async function seatReportCounter(db: Tx, at: Date = new Date()): Promise<void> {
  const year = documentYear(at);
  // A plain (non-locking) read: a stale value is harmless, the counter
  // read under the lock by `nextNumber` is the reference.
  await setCounter(db, "RAPPORT", year, await highestIssued(db, year));
}

/**
 * Creates the RAPPORT row of the issue's year if it is missing — called on
 * its own just before each attempt's issuing transaction (`createReportFor`,
 * inside its retry: a deadlock on the row is run again too), so the
 * transaction only ever locks a row that exists: on the first approval of a
 * year, an issue rolling back the row it had just inserted can no longer
 * deadlock the approvals queued behind it. Once the row exists this is one
 * plain read that waits on no lock: a seat on every approval wrote the row
 * — queueing on its lock, a pooled connection held — twice per issue.
 */
export async function ensureReportCounter(db: Tx, at: Date = new Date()): Promise<void> {
  const year = documentYear(at);
  const row = await db.counter.findUnique({ where: { kind_year: { kind: "RAPPORT", year } }, select: { last: true } });
  if (!row) await seatReportCounter(db, at);
}

/**
 * Draws the next « RAP-AAAA-NNNNN ». Call inside the `$transaction` that
 * creates the report, before anything else is written: the counter row is
 * the lock every issue waits on. `at` is the issue instant — the year
 * printed in the number is the year of the « Date d'édition ». Seats the
 * counter itself too, so a draw is right even without `seatReportCounter`.
 */
export async function drawReportNumber(tx: Tx, at: Date = new Date()): Promise<string> {
  const year = documentYear(at);
  await seatReportCounter(tx, at);
  const { sequence } = await nextNumber(tx, "RAPPORT", year);
  return formatReportNumber(sequence, year);
}
