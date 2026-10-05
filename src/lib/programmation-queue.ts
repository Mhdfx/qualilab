import type { SampleStatus, SerieKind } from "@/generated/prisma/enums";

/**
 * The responsable des paramètres' queue (PROGRAMME.md §5): the received and
 * programmed lines, grouped by série, the ones still to programme first and
 * the oldest receptions at the head. Pure, so the order the screen shows is
 * the order these tests pin down.
 */

export type QueueLineRef = {
  status: SampleStatus;
  receivedAt: Date | string | null;
  lineNumber: number;
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

/** Received-and-waiting lines first, then the oldest receptions, then the série and the line. */
export function orderQueue<T extends QueueLineRef>(lines: T[]): T[] {
  return [...lines].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      time(a.receivedAt) - time(b.receivedAt) ||
      a.serie.serialNumber.localeCompare(b.serie.serialNumber) ||
      a.lineNumber - b.lineNumber
  );
}

/**
 * Groups the ordered lines by série: a série takes the place of its first
 * line (so a série with a line still to programme comes before the fully
 * programmed ones) and lists its lines in their own order.
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
    group.lines.sort((a, b) => a.lineNumber - b.lineNumber);
  }
  return [...groups.values()];
}
