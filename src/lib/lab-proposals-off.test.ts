import { describe, expect, it, vi } from "vitest";

/**
 * The switches of lot 3A turned OFF (src/lib/lab-proposals.ts): each goes
 * back to the behaviour before 01/11, nothing else changes. The module is
 * mocked here, so the pure rules read `false` as the server and the screens
 * would. `COMMERCIAL_RESENDS_REPORTS` and `ALERTS_AT_VALIDATION` (lot 3C,
 * K3) are off by default since lot 4A (K8, K7 — the answers of 04/11 to
 * Q9): the mock pins them off whatever the default becomes.
 */
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE: false,
  OBSERVATION_ONLY_DELAY_AND_TEMPERATURE: false,
  COMMERCIAL_RESENDS_REPORTS: false,
  ALERTS_AT_VALIDATION: false,
}));

const { complementaryChecklist, DEFAULT_COMPLEMENTARY_THRESHOLDS } = await import("./reception-complementary");
const { rowToJustify } = await import("./reception-rules");
const { canResendReport, reportSendRefusal } = await import("./report-actions");
const { UNDECLARED_SAMPLING_HINT } = await import("./serie-input");
const { alertSettingNotice, alertsAtApproval, alertsAtTechnicalValidation } = await import("./alert-moment");
const { alertsLeaveAt, serieAlertNotice, serieValidationPlan } = await import("./serie-validation");

describe("lot 3A — the switches off", () => {
  it("UNDECLARED_SAMPLING_DELAY_NOT_EVALUABLE off: C1 of an undeclared time is « à vérifier » again, to justify", () => {
    const rows = complementaryChecklist(
      { lineKind: "ALIMENT", family: "MICRO" },
      {
        startedAt: new Date("2026-10-10T08:00:00Z"),
        endedAt: null,
        arrivedAt: new Date("2026-10-10T08:00:00Z"),
        samplingTimeDeclared: false,
        receivedAt: new Date("2026-10-10T09:00:00Z"),
      },
      DEFAULT_COMPLEMENTARY_THRESHOLDS,
      { identificationOk: true }
    );
    const c1 = rows.find((row) => row.code === "C1");
    expect(c1).toMatchObject({ status: "A_VERIFIER", reason: "DELAI", detail: "Heure de prélèvement non déclarée" });
    expect(rowToJustify(rows, true, "")).toMatchObject({ code: "C1" });
    expect(UNDECLARED_SAMPLING_HINT).toMatch(/« à vérifier » et l'observation de réception obligatoire/);
  });

  it("OBSERVATION_ONLY_DELAY_AND_TEMPERATURE off: a DLC or a quantity doubt needs the observation again", () => {
    expect(rowToJustify([{ key: "DLC" as const, status: "A_VERIFIER" as const }], true, "")).toMatchObject({ key: "DLC" });
    expect(rowToJustify([{ key: "ALIMENT_MICRO" as const, status: "A_VERIFIER" as const }], true, null)).not.toBeNull();
  });

  it("COMMERCIAL_RESENDS_REPORTS off: the gestionnaire commercial neither sends nor resends", () => {
    const sent = { sentAt: new Date("2026-10-20T10:00:00Z"), amendedAt: null, amendmentPending: false };
    expect(canResendReport("GESTIONNAIRE", "RAPPORT_ENVOYE", false, true)).toBe(false);
    expect(reportSendRefusal("GESTIONNAIRE", sent)).toBe("Votre profil n'est pas autorisé à envoyer les rapports.");
    expect(canResendReport("VALIDATEUR", "VALIDE", false, false)).toBe(true);
  });

  it("ALERTS_AT_VALIDATION off (K7, Q9 of 04/11): no validation sends the alerts — they leave with the report, once", () => {
    // Step 1, whatever the setting S2 says.
    expect(alertsAtTechnicalValidation(true)).toBe(false);
    expect(alertsAtTechnicalValidation(false)).toBe(false);
    // Step 2: « Valider » sends nothing, « Valider et envoyer » sends the alert with the report.
    expect(alertsAtApproval(false)).toBe(false);
    expect(alertsAtApproval(true)).toBe(true);
    // The série: the same, and its dialog says so.
    expect(alertsLeaveAt("validate", true)).toBe(false);
    expect(alertsLeaveAt("approve", false)).toBe(false);
    expect(alertsLeaveAt("approve", false, undefined, true)).toBe(true);
    expect(serieAlertNotice("approve", false, 1)).toMatch(/^Une alerte de contamination part avec le rapport/);
    const plan = serieValidationPlan(
      [
        {
          id: "s1",
          code: "S-2026-0001-1M",
          controlCode: "C-0001",
          lineNumber: 1,
          designation: "Produit X 1",
          status: "RESULTATS_SAISIS",
          validatedById: "u-valid1",
          approvedById: null,
          amendmentPending: false,
          nonConformes: 1,
          anomalies: 0,
          alertables: 1,
          conclusion: "Non satisfaisant",
          productTypeId: null,
          proposedRegulation: null,
          recordedRegulation: null,
        } as Parameters<typeof serieValidationPlan>[0][number],
      ],
      "approve",
      { id: "u-dir1", role: "DIRECTION" },
      { alertsAtTechnical: false }
    );
    expect(plan.eligible[0]).toMatchObject({ alertNow: false, alertWithSend: true });
    // /admin/reglages says the setting S2 no longer applies.
    expect(alertSettingNotice()).toMatch(/^Sans effet depuis la réponse du laboratoire du 04\/11/);
  });
});
