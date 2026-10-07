import { describe, expect, it } from "vitest";
import {
  PORTAL_SAMPLE_SELECT,
  PORTAL_SIEGE,
  countByStage,
  dashboardWindowStart,
  parsePortalFilters,
  portalQueryString,
  portalReportHref,
  portalSampleByIdWhere,
  portalSampleWhere,
  recentReportsFirst,
  toPortalRow,
  type PortalSampleRecord,
} from "./portal-query";

const NO_FILTER = { q: null, siteId: null, stage: null, from: null, to: null };

function record(overrides: Partial<PortalSampleRecord> = {}): PortalSampleRecord {
  return {
    id: "s1",
    controlCode: "00123/26",
    status: "RAPPORT_ENVOYE",
    lineKind: "ALIMENT",
    produit: "Pain complet",
    surfaceLabel: null,
    surfaceState: null,
    personName: null,
    airMethod: null,
    numeroLot: "L-7",
    sampledAt: new Date(2026, 8, 1),
    receivedAt: new Date(2026, 8, 2),
    serie: { serialNumber: "2780/26", site: { name: "Atelier Nord" } },
    report: { number: "RAP-2026-00001", version: 0, sentAt: new Date(2026, 8, 10), amendedAt: null },
    ...overrides,
  };
}

describe("portalSampleWhere — the client scope", () => {
  it("always pins the account's client at the top level", () => {
    const where = portalSampleWhere("c-alpha", NO_FILTER);
    expect(where).toEqual({ clientId: "c-alpha" });
  });

  it("keeps the client whatever the filters, every condition AND-ed under it", () => {
    const where = portalSampleWhere("c-alpha", {
      q: "pain",
      siteId: "site-x",
      stage: "EN_ANALYSE",
      from: new Date(2026, 0, 1),
      to: new Date(2026, 11, 31, 23, 59, 59, 999),
    });
    expect(where.clientId).toBe("c-alpha");
    expect(Object.keys(where).sort()).toEqual(["AND", "clientId"]);
    expect(where.AND).toHaveLength(4);
    expect(JSON.stringify(where.AND)).not.toContain("clientId");
  });

  it("never matches the blind serial number nor the client's name", () => {
    const where = portalSampleWhere("c-alpha", { ...NO_FILTER, q: "SN" });
    // `serie.serialNumber` (« 2780/26 ») is searched; the sample's own
    // blind `serialNumber` never is.
    const or = (where.AND as { OR: Record<string, unknown>[] }[])[0].OR;
    expect(or.some((condition) => "serialNumber" in condition)).toBe(false);
    expect(or.some((condition) => "client" in condition)).toBe(false);
    expect(or.some((condition) => "code" in condition)).toBe(false);
  });

  it("maps a portal state to its sample statuses", () => {
    const where = portalSampleWhere("c-alpha", { ...NO_FILTER, stage: "EN_ANALYSE" });
    expect(where.AND).toEqual([
      { status: { in: ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS", "VALIDE"] } },
    ]);
  });

  it("reads « Siège » as the séries without a site", () => {
    expect(portalSampleWhere("c-alpha", { ...NO_FILTER, siteId: PORTAL_SIEGE }).AND).toEqual([{ serie: { siteId: null } }]);
  });

  it("refuses to build a query without a client", () => {
    expect(() => portalSampleWhere("", NO_FILTER)).toThrow();
    expect(() => portalSampleByIdWhere("", "s1")).toThrow();
  });

  it("looks a sample up by id AND client — another client's sample is not found", () => {
    expect(portalSampleByIdWhere("c-alpha", "s1")).toEqual({ id: "s1", clientId: "c-alpha" });
  });
});

describe("parsePortalFilters", () => {
  it("reads the form, ignoring any client parameter", () => {
    const filters = parsePortalFilters(
      new URLSearchParams({ q: " pain ", site: "site-x", etat: "RAPPORT_DISPONIBLE", du: "2026-01-01", au: "2026-03-31", page: "3", client: "c-beta", clientId: "c-beta" })
    );
    expect(filters.q).toBe("pain");
    expect(filters.siteId).toBe("site-x");
    expect(filters.stage).toBe("RAPPORT_DISPONIBLE");
    expect(filters.from).toEqual(new Date(2026, 0, 1));
    expect(filters.to).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999));
    expect(filters.page).toBe(3);
    expect(Object.keys(filters)).not.toContain("clientId");
  });

  it("drops what it cannot read", () => {
    const filters = parsePortalFilters(new URLSearchParams({ etat: "VALIDE", du: "01/01/2026", page: "-4" }));
    expect(filters.stage).toBeNull();
    expect(filters.from).toBeNull();
    expect(filters.page).toBe(1);
    expect(parsePortalFilters(new URLSearchParams({ page: "abc" })).page).toBe(1);
    expect(parsePortalFilters(new URLSearchParams({ page: "999999" })).page).toBe(2000);
  });

  it("swaps a period typed backwards", () => {
    const filters = parsePortalFilters(new URLSearchParams({ du: "2026-03-31", au: "2026-01-01" }));
    expect(filters.from).toEqual(new Date(2026, 0, 1));
    expect(filters.to).toEqual(new Date(2026, 2, 31, 23, 59, 59, 999));
  });

  it("round-trips through the query string", () => {
    const params = new URLSearchParams({ q: "pain", site: PORTAL_SIEGE, etat: "RECU", du: "2026-01-01", au: "2026-03-31" });
    const filters = parsePortalFilters(params);
    expect(parsePortalFilters(new URLSearchParams(portalQueryString({ ...filters, page: 2 })))).toEqual({ ...filters, page: 2 });
  });
});

describe("toPortalRow", () => {
  it("shows the report only once it is sent", () => {
    const sent = toPortalRow(record());
    expect(sent.stage).toBe("RAPPORT_DISPONIBLE");
    expect(sent.report).toEqual({ number: "RAP-2026-00001", sentAt: new Date(2026, 8, 10), amended: false });

    for (const status of ["RECU", "EN_ANALYSE", "RESULTATS_SAISIS", "VALIDE", "ANNULE"] as const) {
      expect(toPortalRow(record({ status })).report, status).toBeNull();
    }
  });

  it("prints the current version's number of an amended report", () => {
    const row = toPortalRow(record({ report: { number: "RAP-2026-00001", version: 2, sentAt: new Date(2026, 9, 1), amendedAt: new Date(2026, 9, 1) } }));
    expect(row.report).toMatchObject({ number: "RAP-2026-00001-A2", amended: true });
  });

  it("hides the report of a sample reopened for amendment", () => {
    const row = toPortalRow(record({ status: "RESULTATS_SAISIS", report: { number: "RAP-2026-00001", version: 0, sentAt: new Date(2026, 8, 10), amendedAt: null } }));
    expect(row.stage).toBe("EN_ANALYSE");
    expect(row.report).toBeNull();
  });

  it("hides the report while an amendment is pending, even should the status still read sent", () => {
    const row = toPortalRow(
      record({ report: { number: "RAP-2026-00001", version: 0, sentAt: new Date(2026, 8, 10), amendedAt: null, amendmentPending: true } })
    );
    expect(row.report).toBeNull();
    const settled = toPortalRow(
      record({ report: { number: "RAP-2026-00001", version: 1, sentAt: new Date(2026, 9, 1), amendedAt: new Date(2026, 9, 1), amendmentPending: false } })
    );
    expect(settled.report).toMatchObject({ number: "RAP-2026-00001-A1", amended: true });
  });

  it("selects the amendment lock with the report", () => {
    expect(PORTAL_SAMPLE_SELECT.report.select.amendmentPending).toBe(true);
  });

  it("names the site, or the « Siège » as null", () => {
    expect(toPortalRow(record()).siteName).toBe("Atelier Nord");
    expect(toPortalRow(record({ serie: { serialNumber: "2780/26", site: null } })).siteName).toBeNull();
  });

  it("never carries prices, results nor staff", () => {
    const keys = Object.keys(toPortalRow(record()));
    for (const forbidden of ["price", "results", "technician", "user", "validatedBy", "approvedBy", "serialNumberBlind", "conclusion"]) {
      expect(keys).not.toContain(forbidden);
    }
  });
});

describe("countByStage", () => {
  it("folds the statuses into the four portal states", () => {
    expect(
      countByStage([
        { status: "PRELEVE", count: 1 },
        { status: "RECU", count: 2 },
        { status: "PROGRAMME", count: 3 },
        { status: "VALIDE", count: 4 },
        { status: "RAPPORT_ENVOYE", count: 5 },
        { status: "ANNULE", count: 6 },
      ])
    ).toEqual({ RECU: 3, EN_ANALYSE: 7, RAPPORT_DISPONIBLE: 5, ANNULE: 6, total: 21 });
  });
  it("is all zeros for a new client", () => {
    expect(countByStage([])).toEqual({ RECU: 0, EN_ANALYSE: 0, RAPPORT_DISPONIBLE: 0, ANNULE: 0, total: 0 });
  });
});

describe("dashboardWindowStart", () => {
  it("starts the 12 months on the same day one year ago", () => {
    expect(dashboardWindowStart(new Date(2026, 9, 7, 15, 30))).toEqual(new Date(2025, 9, 7));
  });
  it("keeps 28 February for a 29 February", () => {
    expect(dashboardWindowStart(new Date(2028, 1, 29))).toEqual(new Date(2027, 1, 28));
  });
});

describe("recentReportsFirst", () => {
  it("puts amended reports first, then the most recently sent", () => {
    const old = toPortalRow(record({ id: "old", report: { number: "RAP-1", version: 0, sentAt: new Date(2026, 1, 1), amendedAt: null } }));
    const recent = toPortalRow(record({ id: "recent", report: { number: "RAP-2", version: 0, sentAt: new Date(2026, 8, 1), amendedAt: null } }));
    const amended = toPortalRow(record({ id: "amended", report: { number: "RAP-3", version: 1, sentAt: new Date(2026, 3, 1), amendedAt: new Date(2026, 3, 1) } }));
    const pending = toPortalRow(record({ id: "pending", status: "EN_ANALYSE" }));
    expect(recentReportsFirst([old, pending, recent, amended]).map((row) => row.id)).toEqual(["amended", "recent", "old"]);
  });
});

describe("portalReportHref", () => {
  it("goes through the portal route, never the laboratory's", () => {
    expect(portalReportHref("s1")).toBe("/api/portail/echantillons/s1/rapport");
    expect(portalReportHref("a/b")).toBe("/api/portail/echantillons/a%2Fb/rapport");
  });
});
