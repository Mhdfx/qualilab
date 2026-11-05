import { describe, expect, it, vi } from "vitest";

/**
 * The switches lot 4A set from the answers of 04/11 (RETOUR-LABO-04-11.md
 * §5), put back where they were before it (src/lib/lab-proposals.ts): K7
 * `ALERTS_AT_VALIDATION` on, K8 `COMMERCIAL_RESENDS_REPORTS` on, K9
 * `SAMPLING_MEANS_AIR_ONLY` off, J5 `SINGLE_UNIT_NO_TOLERANCE` off, K10
 * `ACCREDITATION_LOGO_BY_HAND` off. Each must give back the behaviour of
 * lot 3 exactly, through the rules' own defaults — the way back the
 * switches promise. The module is mocked, so the pure rules read these
 * values as the server and the screens would.
 */
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  ALERTS_AT_VALIDATION: true,
  COMMERCIAL_RESENDS_REPORTS: true,
  SAMPLING_MEANS_AIR_ONLY: false,
  SINGLE_UNIT_NO_TOLERANCE: false,
  ACCREDITATION_LOGO_BY_HAND: false,
}));

const { alertSettingNotice, alertsAtApproval, alertsAtTechnicalValidation } = await import("./alert-moment");
const { approvalDispatch, canResendReport, reportSendRefusal } = await import("./report-actions");
const { samplingMeansText } = await import("./sampling-means");
const { judgeUnits, parseUnitReading, toleranceIgnored } = await import("./interpretation");
const { wideToleranceNote } = await import("./criteria-input");
const { accreditationLogoDecision } = await import("./accreditation");

describe("lot 4A — the switches back to lot 3", () => {
  it("K7 back: the alerts leave at the validation the setting S2 names; /admin/reglages says nothing", () => {
    expect(alertsAtTechnicalValidation(true)).toBe(true);
    expect(alertsAtApproval(false)).toBe(true);
    expect(approvalDispatch({ send: false })).toMatchObject({ ok: true, sendAlerts: true });
    expect(alertSettingNotice()).toBeNull();
  });

  it("K8 back: the gestionnaire commercial resends a version already sent", () => {
    const sent = { sentAt: new Date("2026-10-20T10:00:00Z"), amendedAt: null, amendmentPending: false };
    expect(canResendReport("GESTIONNAIRE", "RAPPORT_ENVOYE", false, true)).toBe(true);
    expect(reportSendRefusal("GESTIONNAIRE", sent)).toBeNull();
  });

  it("K9 back: « Moyen de prélèvement » on every report, as K6 says", () => {
    expect(samplingMeansText({ lineKind: "EAU", sampledByLab: true })).toBe("Flacon stérile");
    expect(samplingMeansText({ lineKind: "SURFACE", sampledByLab: false })).toBe("N/A");
  });

  it("J5 back: c units above a single limit are « Acceptable » with n = 1", () => {
    const plan = { n: 1, c: 1, mKind: "VALUE" as const, m: 100, bigM: null };
    expect(toleranceIgnored(plan)).toBe(false);
    expect(judgeUnits(plan, [parseUnitReading("150")]).official?.verdict).toBe("ACCEPTABLE");
    expect(wideToleranceNote(plan)).toMatch(/« Acceptable », jamais « Non satisfaisant »/);
  });

  it("K10 back: the box is ignored, the rule alone decides", () => {
    expect(approvalDispatch({ accreditationLogo: false })).toMatchObject({ ok: true, accreditationLogo: null });
    expect(accreditationLogoDecision({ uploaded: true, byRule: true, choice: false })).toEqual({ printed: true, byRule: true, byHand: false });
  });
});
