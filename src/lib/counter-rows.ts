import "server-only";
import { prisma } from "./prisma";
import {
  COUNTER_KINDS,
  DOCUMENT_NUMBER_PREFIX,
  highestSequence,
  isDocumentCounter,
  type CounterKind,
  type CounterRow,
} from "./counters";

/**
 * The yearly sequences as the « Compteurs » screen shows them (/admin/reglages
 * and `GET /api/admin/counters`) — one loader, so the page and the route can
 * never disagree on the highest number in use, which is also the floor the
 * route enforces (`PUT /api/admin/counters`).
 */

/** The numbers of a kind already printed on a record of that year. */
async function usedNumbers(kind: CounterKind, year: number): Promise<(string | null)[]> {
  if (isDocumentCounter(kind)) {
    // The unique index on `Invoice.number` serves the prefix.
    const prefix = `${DOCUMENT_NUMBER_PREFIX[kind]}-${year}-`;
    const invoices = await prisma.invoice.findMany({
      where: { kind, number: { startsWith: prefix } },
      select: { number: true },
    });
    return invoices.map((invoice) => invoice.number);
  }
  if (kind === "SERIE") {
    const series = await prisma.serie.findMany({ where: { year }, select: { serialNumber: true } });
    return series.map((serie) => serie.serialNumber);
  }
  const suffix = `/${String(year % 100).padStart(2, "0")}`;
  const samples = await prisma.sample.findMany({
    where: { controlCode: { endsWith: suffix } },
    select: { controlCode: true },
  });
  return samples.map((sample) => sample.controlCode);
}

/** The highest number of a kind already attributed this year: the counter's floor. */
export async function highestUsedNumber(kind: CounterKind, year: number): Promise<number> {
  return highestSequence(kind, year, await usedNumbers(kind, year));
}

/** The four sequences of `year`: the last number drawn and the highest in use. */
export async function loadCounterRows(year: number): Promise<CounterRow[]> {
  const [rows, highest] = await Promise.all([
    prisma.counter.findMany({ where: { year } }),
    Promise.all(COUNTER_KINDS.map((kind) => highestUsedNumber(kind, year))),
  ]);
  return COUNTER_KINDS.map((kind, index) => ({
    kind,
    year,
    last: rows.find((row) => row.kind === kind)?.last ?? 0,
    highestUsed: highest[index],
  }));
}
