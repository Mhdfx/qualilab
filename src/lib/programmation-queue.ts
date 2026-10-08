import type { SampleStatus, SerieKind } from "@/generated/prisma/enums";
import { parseLabNumber } from "./counters";

/**
 * The responsable des paramètres' queue (PROGRAMME.md §5): the received and
 * programmed lines, grouped by série, the ones still to programme first and
 * the oldest receptions at the head — he picks the oldest sample entered
 * (first in, first out, RETOUR-LABO-06-10.md §9.3). Pure, so the order the
 * screen shows is the order these tests pin down.
 */

export type QueueLineRef = {
  status: SampleStatus;
  receivedAt: Date | string | null;
  lineNumber: number;
  /** « 1/26-2M » / « 1/26-2P »: orders the two samples of one line. */
  code?: string;
  serie: { id: string; serialNumber: string; kind: SerieKind; receivedAt: Date | string | null };
  client: { id: string; name: string };
};

export type QueueGroup<T extends QueueLineRef> = {
  serieId: string;
  serialNumber: string;
  kind: SerieKind;
  client: { id: string; name: string };
  receivedAt: Date | string | null;
  lines: T[];
};

const rank = (status: SampleStatus) => (status === "RECU" ? 0 : 1);
const time = (date: Date | string | null) =>
  date === null ? Number.POSITIVE_INFINITY : new Date(date).getTime();

/**
 * The série entered first: « 2780/25 » before « 1/26 », « 9/26 » before
 * « 10/26 » — the lab's numbers are not zero-padded, so a plain string
 * comparison would put « 10/26 » first. Anything else (an older format)
 * compares as text, numbers read as numbers.
 */
export function compareSerialNumbers(a: string, b: string): number {
  const left = parseLabNumber(a);
  const right = parseLabNumber(b);
  if (left && right) return left.year - right.year || left.sequence - right.sequence;
  return a.localeCompare(b, "fr", { numeric: true });
}

/**
 * Received-and-waiting lines first, then the oldest receptions, then the
 * série entered first and the line (« …M » before « …P »).
 */
export function orderQueue<T extends QueueLineRef>(lines: T[]): T[] {
  return [...lines].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      time(a.receivedAt) - time(b.receivedAt) ||
      compareSerialNumbers(a.serie.serialNumber, b.serie.serialNumber) ||
      a.lineNumber - b.lineNumber ||
      (a.code ?? "").localeCompare(b.code ?? "")
  );
}

/**
 * Groups the ordered samples by série: a série takes the place of its first
 * sample (so a série with a sample still to programme comes before the fully
 * programmed ones) and lists its samples by number, « …M » before « …P ».
 */
export function groupQueue<T extends QueueLineRef>(lines: T[]): QueueGroup<T>[] {
  const groups = new Map<string, QueueGroup<T>>();
  for (const line of orderQueue(lines)) {
    let group = groups.get(line.serie.id);
    if (!group) {
      group = {
        serieId: line.serie.id,
        serialNumber: line.serie.serialNumber,
        kind: line.serie.kind,
        client: line.client,
        receivedAt: line.serie.receivedAt,
        lines: [],
      };
      groups.set(line.serie.id, group);
    }
    group.lines.push(line);
  }
  for (const group of groups.values()) {
    group.lines.sort((a, b) => a.lineNumber - b.lineNumber || (a.code ?? "").localeCompare(b.code ?? ""));
  }
  return [...groups.values()];
}
