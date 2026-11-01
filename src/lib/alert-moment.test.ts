import { describe, expect, it } from "vitest";
import { alertsAtApproval, alertsAtTechnicalValidation } from "./alert-moment";
import { ALERTS_AT_VALIDATION } from "./lab-proposals";
import { alertsLeaveAt, serieAlertNotice } from "./serie-validation";

describe("alert moment (K3, 2.16 (c) — R-13)", () => {
  it("keeps the alerts at the validation by default, as the settings say", () => {
    expect(ALERTS_AT_VALIDATION).toBe(true);
    expect(alertsAtTechnicalValidation(true)).toBe(true);
    expect(alertsAtTechnicalValidation(false)).toBe(false);
    expect(alertsAtApproval(false)).toBe(true);
    expect(alertsAtApproval(true)).toBe(true);
  });

  it("with the switch off, no validation sends them — only « Valider et envoyer » (and « Envoyer au client »)", () => {
    expect(alertsAtTechnicalValidation(true, false)).toBe(false);
    expect(alertsAtApproval(false, false)).toBe(false);
    expect(alertsAtApproval(true, false)).toBe(true);
  });

  it("the série's plan and its notice follow the switch", () => {
    expect(alertsLeaveAt("validate", true)).toBe(true);
    expect(alertsLeaveAt("validate", true, false)).toBe(false);
    expect(alertsLeaveAt("approve", false, false)).toBe(false);
    expect(serieAlertNotice("approve", false, 2, false)).toBe(
      "Une alerte de contamination part avec le rapport (« Valider et envoyer », « Envoyer au client ») : 2 échantillons ci-dessous en déclenchent une."
    );
    expect(serieAlertNotice("validate", true, 1)).toContain("dès la validation technique");
  });
});
