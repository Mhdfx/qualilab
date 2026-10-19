import { describe, expect, it } from "vitest";
import {
  EMAIL_LOG_STATUSES,
  EMAIL_STATUS_LABELS,
  EMAIL_TYPE_LABELS,
  emailLogHref,
  emailLogWhere,
  emailStatusLabel,
  hasEmailLogFilter,
  parseEmailLogFilters,
} from "./email-log-filters";

/** /admin/envois — the send journal's filters (finalversion.md:123). */

describe("parseEmailLogFilters", () => {
  it("reads type, status, period and cursor", () => {
    const filters = parseEmailLogFilters(
      new URLSearchParams({ type: "ALERTE_CONTAMINATION", statut: "ECHEC", du: "2026-10-01", au: "2026-10-07", curseur: "cmabc123def456ghi789" })
    );
    expect(filters.type).toBe("ALERTE_CONTAMINATION");
    expect(filters.status).toBe("ECHEC");
    expect(filters.from).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(filters.to).toEqual(new Date("2026-10-07T23:59:59.999Z"));
    expect(filters.cursor).toBe("cmabc123def456ghi789");
  });

  it("accepts the page's searchParams object as Next hands it over", () => {
    const filters = parseEmailLogFilters({ type: ["RAPPORT", "DESTRUCTION"], statut: undefined, du: "2026-10-01" });
    expect(filters.type).toBe("RAPPORT");
    expect(filters.status).toBeNull();
    expect(filters.from).not.toBeNull();
  });

  it("ignores unknown values instead of failing", () => {
    const filters = parseEmailLogFilters(
      new URLSearchParams({ type: "FACTURE", statut: "envoye", du: "hier", au: "2026-02-30", curseur: "x'; DROP TABLE" })
    );
    expect(filters).toEqual({ type: null, status: null, from: null, to: null, cursor: null });
    expect(hasEmailLogFilter(filters)).toBe(false);
  });
});

describe("emailLogWhere", () => {
  it("is empty without a filter", () => {
    expect(emailLogWhere(parseEmailLogFilters(new URLSearchParams()))).toEqual({});
  });

  it("filters type, status and the inclusive period of creation", () => {
    const filters = parseEmailLogFilters(new URLSearchParams({ type: "RAPPORT", statut: "SIMULE", du: "2026-10-01", au: "2026-10-01" }));
    const where = emailLogWhere(filters);
    expect(where.type).toBe("RAPPORT");
    expect(where.status).toBe("SIMULE");
    expect(where.createdAt).toEqual({ gte: filters.from, lte: filters.to });
  });

  it("never carries the cursor into the where (pagination does)", () => {
    const where = emailLogWhere(parseEmailLogFilters(new URLSearchParams({ curseur: "cmabc123def456ghi789" })));
    expect(where).toEqual({});
  });
});

describe("emailLogHref", () => {
  it("keeps the filters on the next page and drops empty ones", () => {
    const filters = parseEmailLogFilters(new URLSearchParams({ type: "RAPPORT", du: "2026-10-01" }));
    expect(emailLogHref(filters, "cmnext")).toBe("/admin/envois?type=RAPPORT&du=2026-10-01&curseur=cmnext");
    expect(emailLogHref(filters)).toBe("/admin/envois?type=RAPPORT&du=2026-10-01");
    expect(emailLogHref(parseEmailLogFilters(new URLSearchParams()))).toBe("/admin/envois");
  });
});

describe("labels", () => {
  it("names every status sendEmail records, and every e-mail type", () => {
    for (const status of EMAIL_LOG_STATUSES) expect(EMAIL_STATUS_LABELS[status]).toBeTruthy();
    expect(Object.keys(EMAIL_TYPE_LABELS).sort()).toEqual(["ALERTE_CONTAMINATION", "DESTRUCTION", "NON_RECU", "RAPPORT"]);
  });

  it("names the notice of a sample « Non reçu au laboratoire », and filters the journal on it (16/10, Q74)", () => {
    expect(EMAIL_TYPE_LABELS.NON_RECU).toBe("Échantillon non reçu");
    expect(parseEmailLogFilters(new URLSearchParams({ type: "NON_RECU" })).type).toBe("NON_RECU");
    expect(emailLogWhere(parseEmailLogFilters(new URLSearchParams({ type: "NON_RECU" })))).toEqual({ type: "NON_RECU" });
  });

  it("shows a stored status outside the list as stored", () => {
    expect(emailStatusLabel("SIMULE")).toBe("Simulé — non remis");
    expect(emailStatusLabel("NON_ENVOYE")).toBe("NON_ENVOYE");
  });
});
