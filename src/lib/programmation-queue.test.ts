import { describe, expect, it } from "vitest";
import { compareSerialNumbers, groupQueue, orderQueue, type QueueLineRef } from "./programmation-queue";

/**
 * PROGRAMME.md §5 — the queue reads by série, the lines still to programme
 * first, the oldest receptions at the head.
 */
const clientA = { id: "c-a", name: "Boulangerie A" };
const clientB = { id: "c-b", name: "Traiteur B" };
const serie1 = { id: "s1", serialNumber: "0001/26", kind: "VISITE" as const, receivedAt: "2026-10-01T08:00:00.000Z" };
const serie2 = { id: "s2", serialNumber: "0002/26", kind: "DEPOT" as const, receivedAt: "2026-10-02T08:00:00.000Z" };
const serie3 = { id: "s3", serialNumber: "0003/26", kind: "VISITE" as const, receivedAt: "2026-10-03T08:00:00.000Z" };

const line = (id: string, status: "RECU" | "PROGRAMME", serie: QueueLineRef["serie"], lineNumber: number, client = clientA): QueueLineRef & { id: string } => ({
  id,
  status,
  receivedAt: serie.receivedAt,
  lineNumber,
  serie,
  client,
});

describe("orderQueue", () => {
  it("puts the lines still to programme before the programmed ones, whatever their age", () => {
    const ordered = orderQueue([
      line("old-programmed", "PROGRAMME", serie1, 1),
      line("new-received", "RECU", serie3, 1),
    ]);
    expect(ordered.map((l) => l.id)).toEqual(["new-received", "old-programmed"]);
  });

  it("puts the oldest reception first within a status", () => {
    const ordered = orderQueue([
      line("s3", "RECU", serie3, 1),
      line("s1", "RECU", serie1, 1),
      line("s2", "RECU", serie2, 1),
    ]);
    expect(ordered.map((l) => l.id)).toEqual(["s1", "s2", "s3"]);
  });

  it("then reads by série and line number", () => {
    const sameDay = { ...serie2, id: "s2b", serialNumber: "0002/26" };
    const ordered = orderQueue([
      line("b2", "RECU", sameDay, 2),
      line("a1", "RECU", { ...serie2, id: "s2a", serialNumber: "0001/26" }, 1),
      line("b1", "RECU", sameDay, 1),
    ]);
    expect(ordered.map((l) => l.id)).toEqual(["a1", "b1", "b2"]);
  });

  it("on the same reception time, reads the lab's numbers as numbers: « 9/26 » before « 10/26 » (§9.3)", () => {
    const at = "2026-10-08T09:00:00.000Z";
    const s9 = { id: "s9", serialNumber: "9/26", kind: "VISITE" as const, receivedAt: at };
    const s10 = { id: "s10", serialNumber: "10/26", kind: "DEPOT" as const, receivedAt: at };
    const s2780 = { id: "s2780", serialNumber: "2780/25", kind: "VISITE" as const, receivedAt: at };
    const ordered = orderQueue([line("ten", "RECU", s10, 1), line("nine", "RECU", s9, 1), line("last-year", "RECU", s2780, 1)]);
    expect(ordered.map((l) => l.id)).toEqual(["last-year", "nine", "ten"]);
  });

  it("puts « …M » before « …P » when a whole line ties", () => {
    const ordered = orderQueue([
      { ...line("2P", "RECU", serie1, 2), code: "1/26-2P" },
      { ...line("2M", "RECU", serie1, 2), code: "1/26-2M" },
    ]);
    expect(ordered.map((l) => l.id)).toEqual(["2M", "2P"]);
  });

  it("keeps a line without a reception date at the end", () => {
    const ordered = orderQueue([
      { ...line("undated", "RECU", serie1, 1), receivedAt: null },
      line("dated", "RECU", serie3, 1),
    ]);
    expect(ordered.map((l) => l.id)).toEqual(["dated", "undated"]);
  });

  it("does not mutate the list it is given", () => {
    const lines = [line("b", "PROGRAMME", serie1, 1), line("a", "RECU", serie1, 2)];
    orderQueue(lines);
    expect(lines.map((l) => l.id)).toEqual(["b", "a"]);
  });
});

describe("compareSerialNumbers — the série entered first", () => {
  it("orders by year, then by sequence", () => {
    const sorted = ["10/26", "2780/25", "9/26", "1/26", "0002/26"].sort(compareSerialNumbers);
    expect(sorted).toEqual(["2780/25", "1/26", "0002/26", "9/26", "10/26"]);
  });

  it("falls back to a numeric text comparison for another format", () => {
    expect(compareSerialNumbers("S-9", "S-10")).toBeLessThan(0);
    expect(compareSerialNumbers("1/26", "1/26")).toBe(0);
  });
});

describe("groupQueue", () => {
  it("groups by série, a série placed by its first line", () => {
    const groups = groupQueue([
      line("s2-l1", "PROGRAMME", serie2, 1, clientB),
      line("s1-l2", "PROGRAMME", serie1, 2),
      line("s3-l1", "RECU", serie3, 1),
      line("s1-l1", "RECU", serie1, 1),
    ]);
    expect(groups.map((g) => g.serialNumber)).toEqual(["0001/26", "0003/26", "0002/26"]);
    expect(groups[0]).toMatchObject({ serieId: "s1", kind: "VISITE", client: clientA, receivedAt: serie1.receivedAt });
    expect(groups[2]).toMatchObject({ serieId: "s2", kind: "DEPOT", client: clientB });
  });

  it("lists the lines of a série in line order, whatever their status", () => {
    const groups = groupQueue([
      line("l3", "RECU", serie1, 3),
      line("l1", "PROGRAMME", serie1, 1),
      line("l2", "RECU", serie1, 2),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].lines.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
  });

  it("puts the two samples of one line « …M » before « …P », whatever their status", () => {
    const groups = groupQueue([
      { ...line("2P", "RECU", serie1, 2), code: "0001/26-2P" },
      { ...line("2M", "PROGRAMME", serie1, 2), code: "0001/26-2M" },
      { ...line("1", "PROGRAMME", serie1, 1), code: "0001/26-1" },
    ]);
    expect(groups[0].lines.map((l) => l.id)).toEqual(["1", "2M", "2P"]);
  });

  it("gives nothing for an empty queue", () => {
    expect(groupQueue([])).toEqual([]);
  });
});
