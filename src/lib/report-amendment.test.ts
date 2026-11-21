import { describe, expect, it } from "vitest";
import {
  amendedNumber,
  amendedReportSubject,
  amendmentHeader,
  amendmentHeaderText,
  canReopen,
  cancelRefusalForReport,
  CORRECTION_MESSAGES,
  correctionPending,
  correctionRefusal,
  duplicataMention,
  lastReplacedData,
  parseCorrectionTrace,
  pendingCorrectionText,
  pendingReportChange,
  REOPEN_ROLE_REFUSAL,
  reopenMode,
  reopenRefusal,
  reopensReports,
  supersededMention,
  traceWithPending,
  traceWithReissue,
  versionIssuedAt,
  unsentReopenWarning,
} from "./report-amendment";
import { UNSENT_REPORT_CORRECTED_IN_PLACE } from "./lab-proposals";
import { alertAwaitingReport, alertNotSentForVersion } from "./alert-moment";
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
  it("lot 5A, K11: says nothing while a version never sent is corrected before send instead", () => {
    expect(unsentReopenWarning("RAP-2026-00001", false)).toBeNull();
    expect(unsentReopenWarning("RAP-2026-00001", false, true)).toBeNull();
  });

  it("K11 off: says the amended version will cancel a report the client never had", () => {
    expect(unsentReopenWarning("RAP-2026-00001", false, false)).toBe(
      "Le client n'a jamais reçu RAP-2026-00001 : il recevra directement le rapport amendé, imprimé « Rapport amendé — Annule et remplace le rapport RAP-2026-00001 » et envoyé sous l'objet « Rapport amendé »."
    );
    // The amended header it announces is the one printed.
    expect(amendmentHeader({ previousNumber: "RAP-2026-00001", previousIssuedAt: "2026-10-19T10:00:00.000Z" }).replaces).toContain(
      "Annule et remplace le rapport RAP-2026-00001"
    );
  });

  it("says nothing once this version has left", () => {
    expect(unsentReopenWarning("RAP-2026-00001-A1", true)).toBeNull();
    expect(unsentReopenWarning("RAP-2026-00001-A1", true, false)).toBeNull();
  });
});

describe("K11 — « Corriger avant envoi » (Q132 of 20/11: même numéro, sans « annule et remplace »)", () => {
  const pending = { reason: "Erreur de lot", byId: "u-val", byName: "Validateur Test", at: "2026-11-21T09:00:00.000Z" };

  it("is on; a version never sent is corrected, one sent is amended", () => {
    expect(UNSENT_REPORT_CORRECTED_IN_PLACE).toBe(true);
    expect(reopenMode(false)).toBe("correct");
    expect(reopenMode(true)).toBe("amend");
    // Off: every reopening is an amendment, as before lot 5A.
    expect(reopenMode(false, false)).toBe("amend");
  });

  it("refuses the wrong report, the wrong role, a change pending, a missing reason", () => {
    const base = { status: "VALIDE" as const, role: "VALIDATEUR", reason: "Erreur de lot", sent: false, amendmentPending: false };
    expect(correctionRefusal(base)).toBeNull();
    expect(correctionRefusal({ ...base, role: "DIRECTION" })).toBeNull();
    expect(correctionRefusal({ ...base, role: "ADMIN" })).toBeNull();
    expect(correctionRefusal({ ...base, role: "GESTIONNAIRE" })).toBe(REOPEN_ROLE_REFUSAL);
    expect(correctionRefusal({ ...base, role: "TECHNICIEN" })).toBe(REOPEN_ROLE_REFUSAL);
    expect(correctionRefusal({ ...base, sent: true })).toBe(CORRECTION_MESSAGES.useAmendment);
    expect(correctionRefusal({ ...base, status: "RAPPORT_ENVOYE" })).toBe(CORRECTION_MESSAGES.notValidated);
    expect(correctionRefusal({ ...base, status: "RESULTATS_SAISIS" })).toBe(CORRECTION_MESSAGES.notValidated);
    expect(correctionRefusal({ ...base, amendmentPending: true })).toBe(CORRECTION_MESSAGES.pending);
    expect(correctionRefusal({ ...base, reason: " a " })).toBe(CORRECTION_MESSAGES.reason);
    expect(correctionRefusal({ ...base, reason: 12 })).toBe(CORRECTION_MESSAGES.reason);
    expect(correctionRefusal(base, false)).toBe(CORRECTION_MESSAGES.disabled);
  });

  it("keeps the trace: the correction pending, then each version replaced with its reason, author and date", () => {
    expect(parseCorrectionTrace(null)).toEqual({ pending: null, replaced: [] });
    expect(parseCorrectionTrace("pas du JSON")).toEqual({ pending: null, replaced: [] });
    expect(correctionPending(null)).toBe(false);
    const asked = traceWithPending(null, pending);
    expect(correctionPending(asked)).toBe(true);
    expect(traceWithReissue(null, { data: {}, issuedAt: "2026-11-20T10:00:00.000Z", issuedById: "u-dir" }, "2026-11-21T10:00:00.000Z")).toBeNull();
    const first = traceWithReissue(asked, { data: { number: "RAP-2026-00007" }, issuedAt: new Date("2026-11-20T10:00:00.000Z"), issuedById: "u-dir" }, new Date("2026-11-21T10:00:00.000Z"))!;
    expect(first.pending).toBeNull();
    expect(first.replaced).toEqual([
      {
        data: { number: "RAP-2026-00007" },
        issuedAt: "2026-11-20T10:00:00.000Z",
        issuedById: "u-dir",
        reason: "Erreur de lot",
        correctedById: "u-val",
        correctedByName: "Validateur Test",
        correctedAt: "2026-11-21T09:00:00.000Z",
        reissuedAt: "2026-11-21T10:00:00.000Z",
      },
    ]);
    expect(lastReplacedData(first)).toEqual({ number: "RAP-2026-00007" });
    // A second correction keeps the first in the trace, and survives a JSON round trip.
    const again = traceWithPending(JSON.parse(JSON.stringify(first)), { ...pending, reason: "Erreur de date" });
    const second = traceWithReissue(again, { data: { number: "RAP-2026-00007", v: 2 }, issuedAt: "2026-11-21T10:00:00.000Z", issuedById: "u-dir" }, "2026-11-22T08:00:00.000Z")!;
    expect(second.replaced.map((row) => row.reason)).toEqual(["Erreur de lot", "Erreur de date"]);
    expect(lastReplacedData(second)).toEqual({ number: "RAP-2026-00007", v: 2 });
    expect(lastReplacedData(null)).toBeNull();
  });

  it("names the change in progress for the screens", () => {
    expect(pendingReportChange(false, false)).toBeNull();
    expect(pendingReportChange(true, false)).toBe("correction");
    expect(pendingReportChange(true, true)).toBe("amendment");
    expect(pendingReportChange(true, false, false)).toBe("amendment");
    expect(pendingCorrectionText("RAP-2026-00007")).toContain("sous le même numéro, sans « annule et remplace »");
  });

  it("the number never moves: an original keeps its number, an « -A1 » keeps its suffix", () => {
    // `reissueCorrectedReport` prints `amendedNumber(report.number, report.version)` — the version unchanged.
    expect(amendedNumber("RAP-2026-00007", 0)).toBe("RAP-2026-00007");
    expect(amendedNumber("RAP-2026-00007", 1)).toBe("RAP-2026-00007-A1");
  });
});

describe("versionIssuedAt — K11 × K7: a correction reissued in place dates the version in force (review of lot 5A)", () => {
  const trace = (reissuedAt: string[]) => ({
    pending: null,
    replaced: reissuedAt.map((at) => ({
      data: { number: "RAP-2026-00007" },
      issuedAt: "2026-11-20T10:00:00.000Z",
      issuedById: "u-dir",
      reason: "Erreur de saisie",
      correctedById: "u-val",
      correctedByName: "Validateur",
      correctedAt: "2026-11-20T15:00:00.000Z",
      reissuedAt: at,
    })),
  });

  it("the first issue, never corrected: null, as before (an alert at the validation counts)", () => {
    expect(versionIssuedAt(null)).toBeNull();
    expect(versionIssuedAt({ version: 0, amendedAt: null })).toBeNull();
    expect(versionIssuedAt({ version: 0, amendedAt: null, versions: [{ version: 0, correctedBeforeSend: null }] })).toBeNull();
  });

  it("an amendment: `amendedAt`", () => {
    const amendedAt = new Date("2026-11-05T10:00:00Z");
    expect(versionIssuedAt({ version: 1, amendedAt, versions: [{ version: 1, correctedBeforeSend: null }] })).toEqual(amendedAt);
  });

  it("a version corrected before its send: its latest reissue — `amendedAt` never moved", () => {
    const report = { version: 0, amendedAt: null, versions: [{ version: 0, correctedBeforeSend: trace(["2026-11-21T09:00:00.000Z", "2026-11-21T16:00:00.000Z"]) }] };
    expect(versionIssuedAt(report)).toEqual(new Date("2026-11-21T16:00:00.000Z"));
    // An « -A1 » corrected before its send: the reissue, later than its `amendedAt`.
    const amended = { version: 1, amendedAt: new Date("2026-11-19T10:00:00Z"), versions: [{ version: 1, correctedBeforeSend: JSON.stringify(trace(["2026-11-21T09:00:00.000Z"])) }] };
    expect(versionIssuedAt(amended)).toEqual(new Date("2026-11-21T09:00:00.000Z"));
    // A trace read on another version than the one in force is ignored.
    expect(versionIssuedAt({ version: 1, amendedAt: new Date("2026-11-19T10:00:00Z"), versions: [{ version: 0, correctedBeforeSend: trace(["2026-11-21T09:00:00.000Z"]) }] })).toEqual(
      new Date("2026-11-19T10:00:00Z")
    );
  });

  it("the scenario of the review: alerted at « Valider et envoyer » without address, corrected, approved with « Valider » — the badge shows again", () => {
    // The alert left with the first approval (no report address: the report stays unsent).
    const alertsSentAt = new Date("2026-11-21T08:00:00Z");
    // « Corriger avant envoi », then « Valider »: the same version reissued at 11:00.
    const report = { version: 0, amendedAt: null, versions: [{ version: 0, correctedBeforeSend: trace(["2026-11-21T11:00:00.000Z"]) }] };
    expect(alertNotSentForVersion({ alertsSentAt, versionIssuedAt: versionIssuedAt(report) })).toBe(true);
    expect(alertAwaitingReport({ status: "VALIDE", alertsSentAt, alerting: 1, versionIssuedAt: versionIssuedAt(report) }, false)).toBe(true);
    // Read with `amendedAt` only (before the review): silent.
    expect(alertNotSentForVersion({ alertsSentAt, versionIssuedAt: report.amendedAt })).toBe(false);
    // Once an alert leaves for the reissued version: nothing waits.
    expect(alertNotSentForVersion({ alertsSentAt: new Date("2026-11-21T11:05:00Z"), versionIssuedAt: versionIssuedAt(report) })).toBe(false);
  });
});
