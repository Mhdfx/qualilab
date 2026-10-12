import { describe, expect, it } from "vitest";
import {
  JOURNAL_PAGE_SIZE,
  SYSTEM_ACTOR,
  decodeJournalCursor,
  encodeJournalCursor,
  entryMetadata,
  entryReference,
  isFiltered,
  journalHref,
  journalPage,
  journalWhere,
  parseJournalFilters,
  referenceTargets,
} from "./audit-journal-filters";

const KNOWN = { actions: ["SAMPLE_RECEIVED", "INVOICE_ISSUED"], actorIds: new Set(["user_1", "user_2"]) };
const parse = (query: string) => parseJournalFilters(new URLSearchParams(query), KNOWN);

describe("parseJournalFilters", () => {
  it("reads every filter of the address", () => {
    const filters = parse("action=SAMPLE_RECEIVED&acteur=user_1&du=2026-10-01&au=2026-10-03&ref=%20QL-26-0001%20");
    expect(filters.action).toBe("SAMPLE_RECEIVED");
    expect(filters.actor).toBe("user_1");
    expect(filters.fromDay).toBe("2026-10-01");
    expect(filters.toDay).toBe("2026-10-03");
    // Midnight of the first day, midnight AFTER the last one, on the lab's clock (UTC since 20/09/2026).
    expect(filters.from).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(filters.until).toEqual(new Date("2026-10-04T00:00:00.000Z"));
    expect(filters.reference).toBe("QL-26-0001");
    expect(filters.cursor).toBeNull();
    expect(isFiltered(filters)).toBe(true);
  });

  it("ignores unknown values instead of failing", () => {
    const filters = parse("action=DROP_TABLE&acteur=someone_else&du=2026-02-30&au=demain&curseur=abc");
    expect(filters).toMatchObject({ action: null, actor: null, fromDay: null, toDay: null, from: null, until: null, cursor: null });
    expect(isFiltered(filters)).toBe(false);
  });

  it("accepts the « Système » actor (entries without a signed-in user)", () => {
    expect(parse(`acteur=${SYSTEM_ACTOR}`).actor).toBe(SYSTEM_ACTOR);
  });

  it("puts a period typed backwards right", () => {
    const filters = parse("du=2026-10-05&au=2026-10-02");
    expect([filters.fromDay, filters.toDay]).toEqual(["2026-10-02", "2026-10-05"]);
    expect(filters.from).toEqual(new Date("2026-10-02T00:00:00.000Z"));
    expect(filters.until).toEqual(new Date("2026-10-06T00:00:00.000Z"));
  });

  it("keeps an open-ended period", () => {
    expect(parse("du=2026-10-05")).toMatchObject({ until: null, from: new Date("2026-10-05T00:00:00.000Z") });
    expect(parse("au=2026-12-31")).toMatchObject({ from: null, until: new Date("2027-01-01T00:00:00.000Z") });
  });

  it("caps the reference and treats a blank one as none", () => {
    expect(parse(`ref=${"A".repeat(300)}`).reference).toHaveLength(100);
    expect(parse("ref=%20%20").reference).toBeNull();
  });

  it("reads the first value of a repeated parameter, and a Next searchParams record", () => {
    const filters = parseJournalFilters({ action: ["INVOICE_ISSUED", "SAMPLE_RECEIVED"], acteur: undefined }, KNOWN);
    expect(filters.action).toBe("INVOICE_ISSUED");
    expect(filters.actor).toBeNull();
  });
});

describe("cursor", () => {
  const entry = { createdAt: new Date("2026-10-09T08:15:30.123Z"), id: "cmabc123xyz" };

  it("round-trips createdAt|id", () => {
    const raw = encodeJournalCursor(entry);
    expect(raw).toBe("2026-10-09T08:15:30.123Z|cmabc123xyz");
    expect(decodeJournalCursor(raw)).toEqual(entry);
    expect(parse(`curseur=${encodeURIComponent(raw)}`).cursor).toEqual(entry);
  });

  it("refuses a damaged cursor", () => {
    for (const raw of [null, "", "abc", "2026-10-09|x", "2026-10-09T08:15:30.123Z|", "2026-10-09T08:15:30.123Z|a b", "2026-99-09T08:15:30.123Z|id"]) {
      expect(decodeJournalCursor(raw), String(raw)).toBeNull();
    }
  });
});

describe("referenceTargets", () => {
  it("brings a sample's report, and the sample id under Report (downloads before 08/10)", () => {
    expect(
      referenceTargets({ samples: [{ id: "s1", reportId: "r1" }], series: [], clients: [], invoices: [] })
    ).toEqual([
      { entity: "Sample", entityId: "s1" },
      { entity: "Report", entityId: "r1" },
      { entity: "Report", entityId: "s1" },
    ]);
  });

  it("keeps every kind of record matched, once each", () => {
    expect(
      referenceTargets({
        samples: [{ id: "s1", reportId: null }],
        series: [{ id: "se1" }],
        clients: [{ id: "c1" }, { id: "c2" }, { id: "c1" }],
        invoices: [{ id: "i1" }],
      })
    ).toEqual([
      { entity: "Sample", entityId: "s1" },
      { entity: "Report", entityId: "s1" },
      { entity: "Serie", entityId: "se1" },
      { entity: "Client", entityId: "c1" },
      { entity: "Client", entityId: "c2" },
      { entity: "Invoice", entityId: "i1" },
    ]);
  });

  it("is empty when nothing matched", () => {
    expect(referenceTargets({ samples: [], series: [], clients: [], invoices: [] })).toEqual([]);
  });
});

describe("journalWhere", () => {
  it("is empty without filters", () => {
    expect(journalWhere(parse(""), null)).toEqual({});
  });

  it("filters on indexed columns only", () => {
    const filters = parse("action=INVOICE_ISSUED&acteur=user_2&du=2026-10-01&au=2026-10-01");
    expect(journalWhere(filters, [{ entity: "Invoice", entityId: "i1" }])).toEqual({
      AND: [
        { action: "INVOICE_ISSUED" },
        { actorId: "user_2" },
        { createdAt: { gte: new Date("2026-10-01T00:00:00.000Z"), lt: new Date("2026-10-02T00:00:00.000Z") } },
        { OR: [{ entity: "Invoice", entityId: "i1" }] },
      ],
    });
    expect(JSON.stringify(journalWhere(filters, null))).not.toContain("metadata");
  });

  it("matches the entries written without a user for « Système »", () => {
    expect(journalWhere(parse(`acteur=${SYSTEM_ACTOR}`), null)).toEqual({ AND: [{ actorId: null }] });
  });

  it("matches nothing for a reference that resolved to no record", () => {
    expect(journalWhere(parse("ref=inconnu"), [])).toEqual({ AND: [{ id: { in: [] } }] });
  });

  it("continues strictly after the cursor, ties broken by id", () => {
    const createdAt = new Date("2026-10-09T08:15:30.123Z");
    const filters = parse(`curseur=${encodeURIComponent(`${createdAt.toISOString()}|cm9`)}`);
    expect(journalWhere(filters, null)).toEqual({
      AND: [{ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: "cm9" } }] }],
    });
  });
});

describe("journalPage", () => {
  const rows = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: `id${String(100 - i).padStart(3, "0")}`, createdAt: new Date(Date.UTC(2026, 9, 9, 12, 0, 0, 0) - i * 1000) }));

  it("shows 50 actions and points at the last one when older entries exist", () => {
    const page = journalPage(rows(JOURNAL_PAGE_SIZE + 1));
    expect(page.items).toHaveLength(50);
    expect(page.nextCursor).toBe(encodeJournalCursor(page.items[49]));
  });

  it("has no next page at the end of the journal", () => {
    expect(journalPage(rows(50)).nextCursor).toBeNull();
    expect(journalPage([]).nextCursor).toBeNull();
  });
});

describe("journalHref", () => {
  it("keeps the filters and carries the cursor", () => {
    const filters = parse("action=SAMPLE_RECEIVED&acteur=user_1&du=2026-10-01&au=2026-10-03&ref=26/0001");
    expect(journalHref(filters, "2026-10-09T08:15:30.123Z|cm9")).toBe(
      "/admin/journal?action=SAMPLE_RECEIVED&acteur=user_1&du=2026-10-01&au=2026-10-03&ref=26%2F0001&curseur=2026-10-09T08%3A15%3A30.123Z%7Ccm9"
    );
    expect(parse(new URL(journalHref(filters, "2026-10-09T08:15:30.123Z|cm9"), "http://x").search.slice(1))).toEqual({
      ...filters,
      cursor: { createdAt: new Date("2026-10-09T08:15:30.123Z"), id: "cm9" },
    });
  });

  it("is the bare journal without filters", () => {
    expect(journalHref(parse("curseur=x"))).toBe("/admin/journal");
  });
});

describe("entry metadata", () => {
  it("never throws on a damaged or unexpected metadata", () => {
    expect(entryMetadata(null)).toEqual({});
    expect(entryMetadata("{not json")).toEqual({});
    expect(entryMetadata("[1,2]")).toEqual({});
    expect(entryMetadata("42")).toEqual({});
    expect(entryMetadata('{"code":"X"}')).toEqual({ code: "X" });
  });

  it("prints the N° de contrôle first, then the code, the number, the name", () => {
    expect(entryReference({ name: "Client", number: "FAC-2026-0001", code: "V-1", controlCode: "C-1" })).toBe("C-1");
    expect(entryReference({ name: "Client", number: "FAC-2026-0001" })).toBe("FAC-2026-0001");
    expect(entryReference({ name: "  " })).toBeNull();
    expect(entryReference({ code: 12 })).toBeNull();
  });
});
