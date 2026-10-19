import { describe, expect, it } from "vitest";
import {
  amendedNumber,
  amendedReportSubject,
  amendmentHeader,
  amendmentHeaderText,
  canReopen,
  cancelRefusalForReport,
  duplicataMention,
  REOPEN_ROLE_REFUSAL,
  reopenRefusal,
  reopensReports,
  supersededMention,
  unsentReopenWarning,
} from "./report-amendment";
import { REPORT_REOPEN_ROLES } from "./sample-status";
import { ROLES } from "./roles";

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
  it("is the administrator's, the Direction's and the validateur's (16/10, Q13), on an approved report only", () => {
    for (const role of ["ADMIN", "DIRECTION", "VALIDATEUR"]) {
      expect(canReopen("VALIDE", role), role).toBe(true);
      expect(canReopen("RAPPORT_ENVOYE", role), role).toBe(true);
      expect(canReopen("RESULTATS_SAISIS", role), role).toBe(false);
      expect(canReopen("ANNULE", role), role).toBe(false);
    }
    expect(canReopen("RAPPORT_ENVOYE", "GESTIONNAIRE")).toBe(false);
    expect(canReopen("RAPPORT_ENVOYE", "TECHNICIEN")).toBe(false);
  });

  it("reads the state machine's list for every role", () => {
    for (const role of ROLES) {
      expect(reopensReports(role), role).toBe((REPORT_REOPEN_ROLES as readonly string[]).includes(role));
    }
  });

  it("lets the validateur and the Direction through the refusal, with a reason", () => {
    for (const role of ["VALIDATEUR", "DIRECTION"]) {
      expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role, reason: "Erreur de lot" }), role).toBeNull();
      expect(reopenRefusal({ status: "VALIDE", role, reason: " " }), role).toMatch(/motif/);
    }
  });

  it("requires a reason, printed on the amended report", () => {
    expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role: "ADMIN", reason: "Erreur de lot" })).toBeNull();
    expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role: "ADMIN", reason: " " })).toMatch(/motif/);
    expect(reopenRefusal({ status: "RAPPORT_ENVOYE", role: "ADMIN", reason: undefined })).toMatch(/motif/);
  });

  it("explains every refusal in French", () => {
    expect(reopenRefusal({ status: "VALIDE", role: "TECHNICIEN", reason: "x".repeat(10) })).toBe(REOPEN_ROLE_REFUSAL);
    expect(REOPEN_ROLE_REFUSAL).toBe(
      "Seuls l'administrateur, la Direction et le validateur technique peuvent rouvrir un rapport pour amendement."
    );
    expect(reopenRefusal({ status: "VALIDE", role: "GESTIONNAIRE", reason: "x".repeat(10) })).toBe(REOPEN_ROLE_REFUSAL);
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

describe("unsentReopenWarning — reopening a report the client never received (16/10, D2 × D1)", () => {
  it("says the amended version will cancel a report the client never had", () => {
    expect(unsentReopenWarning("RAP-2026-00001", false)).toBe(
      "Le client n'a jamais reçu RAP-2026-00001 : il recevra directement le rapport amendé, imprimé « Rapport amendé — Annule et remplace le rapport RAP-2026-00001 » et envoyé sous l'objet « Rapport amendé »."
    );
    // The amended header it announces is the one printed.
    expect(amendmentHeader({ previousNumber: "RAP-2026-00001", previousIssuedAt: "2026-10-19T10:00:00.000Z" }).replaces).toContain(
      "Annule et remplace le rapport RAP-2026-00001"
    );
  });

  it("says nothing once this version has left", () => {
    expect(unsentReopenWarning("RAP-2026-00001-A1", true)).toBeNull();
  });
});
