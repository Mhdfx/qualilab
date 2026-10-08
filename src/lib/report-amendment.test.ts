import { describe, expect, it } from "vitest";
import {
  amendedNumber,
  amendedReportSubject,
  amendmentHeader,
  amendmentHeaderText,
  canReopen,
  cancelRefusalForReport,
  duplicataMention,
  reopenRefusal,
  supersededMention,
} from "./report-amendment";

/** AMENDEMENT.md — a report keeps its number for life; each amendment is a new, printed version. */

describe("amendedNumber", () => {
  it("prints the base number for the original", () => {
    expect(amendedNumber("RAP-2026-00001", 0)).toBe("RAP-2026-00001");
  });

  it("appends -A1, -A2… for the amendments", () => {
    expect(amendedNumber("RAP-2026-00001", 1)).toBe("RAP-2026-00001-A1");
    expect(amendedNumber("RAP-2026-00001", 2)).toBe("RAP-2026-00001-A2");
    expect(amendedNumber("RAP-2026-00001", 12)).toBe("RAP-2026-00001-A12");
  });

  it("never stacks suffixes", () => {
    expect(amendedNumber("RAP-2026-00001-A1", 2)).toBe("RAP-2026-00001-A2");
    expect(amendedNumber("RAP-2026-00001-A3", 0)).toBe("RAP-2026-00001");
  });

  it("refuses an impossible version", () => {
    expect(() => amendedNumber("RAP-2026-00001", -1)).toThrow();
    expect(() => amendedNumber("RAP-2026-00001", 1.5)).toThrow();
  });
});

describe("reopening for amendment", () => {
  it("is the administrator's, on an approved report only", () => {
    expect(canReopen("VALIDE", "ADMIN")).toBe(true);
    expect(canReopen("RAPPORT_ENVOYE", "ADMIN")).toBe(true);
    expect(canReopen("RAPPORT_ENVOYE", "VALIDATEUR")).toBe(false);
    expect(canReopen("RESULTATS_SAISIS", "ADMIN")).toBe(false);
    expect(canReopen("ANNULE", "ADMIN")).toBe(false);
  });

  it("requires a reason, printed on the amended report", () => {
    expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role: "ADMIN", reason: "Erreur de lot" })).toBeNull();
    expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role: "ADMIN", reason: " " })).toMatch(/motif/);
    expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role: "ADMIN", reason: undefined })).toMatch(/motif/);
  });

  it("explains every refusal in French", () => {
    expect(reopenRefusal({ status: "VALIDE", role: "TECHNICIEN", reason: "x".repeat(10) })).toMatch(/administrateur/);
    expect(reopenRefusal({ status: "EN_ANALYSE", role: "ADMIN", reason: "x".repeat(10) })).toMatch(/rapport validé/);
    expect(
      reopenRefusal({ status: "VALIDE", role: "ADMIN", reason: "x".repeat(10), amendmentPending: true })
    ).toMatch(/déjà en cours/);
  });
});

describe("cancelling a sample whose report was issued", () => {
  it("lets a sample without a report be cancelled", () => {
    expect(cancelRefusalForReport(null)).toBeNull();
    expect(cancelRefusalForReport(undefined)).toBeNull();
  });

  it("refuses while an amendment is pending: the issued report would be orphaned", () => {
    expect(cancelRefusalForReport({ amendmentPending: true })).toMatch(/amendement de ce rapport est en cours/);
  });

  it("refuses for any issued report: it is corrected by amendment", () => {
    expect(cancelRefusalForReport({ amendmentPending: false })).toMatch(/utilisez l'amendement/);
  });
});

describe("printed mentions", () => {
  const issuedAt = new Date("2026-10-08T10:00:00Z");

  it("heads an amended report with what it replaces and why", () => {
    const header = amendmentHeader({ previousNumber: "RAP-2026-00001", previousIssuedAt: issuedAt, note: " Erreur de lot " });
    expect(header.title).toBe("Rapport amendé");
    expect(header.replaces).toMatch(/^Annule et remplace le rapport RAP-2026-00001 du 8 oct\. 2026$/);
    expect(header.note).toBe("Motif de l'amendement : Erreur de lot");
    expect(amendmentHeader({ previousNumber: "RAP-2026-00001", previousIssuedAt: issuedAt }).note).toBeNull();
  });

  it("writes the one-line mention of the spec", () => {
    expect(amendmentHeaderText({ previousNumber: "RAP-2026-00001-A1", previousIssuedAt: issuedAt })).toBe(
      "Rapport amendé — annule et remplace le rapport RAP-2026-00001-A1 du 8 oct. 2026"
    );
  });

  it("marks duplicates and superseded versions", () => {
    expect(duplicataMention(issuedAt)).toBe("DUPLICATA — édité le 8 oct. 2026");
    expect(supersededMention("RAP-2026-00001-A1")).toBe("Version remplacée par RAP-2026-00001-A1");
    expect(amendedReportSubject("RAP-2026-00001-A1")).toBe("Rapport amendé RAP-2026-00001-A1");
  });
});
