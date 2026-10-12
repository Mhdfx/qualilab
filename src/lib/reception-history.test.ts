import { describe, expect, it } from "vitest";
import {
  CLIENT_QUERY_MAX,
  hasReceptionHistoryFilter,
  parseReceptionHistoryFilters,
  receptionCounts,
  receptionHistoryHref,
  receptionHistoryWhere,
} from "./reception-history";

/** « Historique des réceptions » — the received séries, by period and client. */

describe("parseReceptionHistoryFilters", () => {
  it("reads the period, the client text and the cursor", () => {
    const filters = parseReceptionHistoryFilters(
      new URLSearchParams({ du: "2026-10-01", au: "2026-10-07", client: "  Client Test  ", curseur: "cmabc123def456ghi789" })
    );
    expect(filters.from).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(filters.to).toEqual(new Date("2026-10-07T23:59:59.999Z"));
    expect(filters.client).toBe("Client Test");
    expect(filters.cursor).toBe("cmabc123def456ghi789");
  });

  it("ignores what it cannot read and caps the client text", () => {
    const filters = parseReceptionHistoryFilters({ du: "hier", client: "   ", curseur: "../etc" });
    expect(filters).toEqual({ from: null, to: null, client: null, cursor: null });
    expect(hasReceptionHistoryFilter(filters)).toBe(false);
    expect(parseReceptionHistoryFilters({ client: "x".repeat(300) }).client).toHaveLength(CLIENT_QUERY_MAX);
  });
});

describe("receptionHistoryWhere", () => {
  it("lists received séries only", () => {
    expect(receptionHistoryWhere(parseReceptionHistoryFilters(new URLSearchParams()))).toEqual({ receivedAt: { not: null } });
  });

  it("bounds the reception date inclusively (a bounded range excludes the never-received)", () => {
    const filters = parseReceptionHistoryFilters(new URLSearchParams({ du: "2026-10-01", au: "2026-10-02" }));
    expect(receptionHistoryWhere(filters)).toEqual({ receivedAt: { gte: filters.from, lte: filters.to } });
  });

  it("matches part of the client's name on the server", () => {
    const where = receptionHistoryWhere(parseReceptionHistoryFilters(new URLSearchParams({ client: "Test" })));
    expect(where.client).toEqual({ name: { contains: "Test" } });
  });
});

describe("receptionHistoryHref", () => {
  it("keeps the filters across pages", () => {
    const filters = parseReceptionHistoryFilters(new URLSearchParams({ du: "2026-10-01", client: "Client Test" }));
    expect(receptionHistoryHref(filters)).toBe("/reception/historique?du=2026-10-01&client=Client+Test");
    expect(receptionHistoryHref(filters, "cmnext")).toBe("/reception/historique?du=2026-10-01&client=Client+Test&curseur=cmnext");
    expect(receptionHistoryHref(parseReceptionHistoryFilters(new URLSearchParams()))).toBe("/reception/historique");
  });
});

describe("receptionCounts", () => {
  it("counts every sample and the non-conform ones, never the unknown", () => {
    expect(receptionCounts([{ conformity: true }, { conformity: false }, { conformity: null }, { conformity: false }])).toEqual({
      samples: 4,
      nonConform: 2,
    });
    expect(receptionCounts([])).toEqual({ samples: 0, nonConform: 0 });
  });
});
