import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALERT_AWAITING_REPORT_LABEL,
  alertAwaitingReport,
  alertSettingNotice,
  alertsAfterApproval,
  alertsAtApproval,
  alertsAtTechnicalValidation,
  alertsFollowSend,
  alertsWithoutReportNote,
} from "./alert-moment";
import { ALERTS_AT_VALIDATION } from "./lab-proposals";
import { alertsLeaveAt, serieAlertNotice, serieSendAlertNotice, serieSendPlan } from "./serie-validation";

describe("K7 edge cases (hypothèse, à confirmer — RETOUR-LABO-04-11.md §5 K7)", () => {
  it("the alerts follow a send that left, or one that had no report address — never another failure", () => {
    expect(alertsFollowSend({ ok: true })).toBe(true);
    expect(alertsFollowSend({ ok: false, noRecipients: true })).toBe(true);
    expect(alertsFollowSend({ ok: false })).toBe(false);
    expect(alertsFollowSend({ ok: false, noRecipients: false })).toBe(false);
  });

  it("at the approval: switch off, only « Valider et envoyer » and as the send allows; switch on, always", () => {
    expect(alertsAfterApproval(false, null)).toBe(false);
    expect(alertsAfterApproval(true, { ok: true })).toBe(true);
    expect(alertsAfterApproval(true, { ok: false })).toBe(false);
    expect(alertsAfterApproval(true, { ok: false, noRecipients: true })).toBe(true);
    expect(alertsAfterApproval(false, null, true)).toBe(true);
    expect(alertsAfterApproval(true, { ok: false }, true)).toBe(true);
  });

  it("says what became of the alerts when the report had no address", () => {
    expect(alertsWithoutReportNote({ ok: true, sent: 0 })).toBe("");
    expect(alertsWithoutReportNote({ ok: true, sent: 2 })).toBe(
      "L'alerte de contamination est partie à l'adresse d'alerte du client ; le rapport reste à envoyer."
    );
    expect(alertsWithoutReportNote({ ok: false, error: "Aucune adresse d'alerte enregistrée pour ce client." })).toBe(
      "Alerte de contamination non envoyée : Aucune adresse d'alerte enregistrée pour ce client."
    );
  });

  it("« Alerte en attente de l'envoi du rapport »: approved, an alert due, not left — switch off only", () => {
    const due = { status: "VALIDE", alertsSentAt: null, alerting: 1 };
    expect(ALERT_AWAITING_REPORT_LABEL).toBe("Alerte en attente de l'envoi du rapport");
    expect(alertAwaitingReport(due)).toBe(true);
    expect(alertAwaitingReport({ ...due, alertsSentAt: new Date() })).toBe(false);
    expect(alertAwaitingReport({ ...due, alerting: 0 })).toBe(false);
    expect(alertAwaitingReport({ ...due, status: "RESULTATS_SAISIS" })).toBe(false);
    expect(alertAwaitingReport({ ...due, status: "RAPPORT_ENVOYE" })).toBe(false);
    expect(alertAwaitingReport(due, true)).toBe(false);
  });

  it("the badge is shown on the validation list and the fiche", () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const list = read("../app/validation/page.tsx");
    expect(list).toMatch(/_count: \{ select: \{ results: \{ where: ALERT_RESULT_WHERE \} \} \}/);
    expect(list).toMatch(/alertAwaitingReport: alertAwaitingReport\(\{ status: item\.status, alertsSentAt, alerting: _count\.results \}\)/);
    expect(read("../components/validation/ValidationQueue.tsx")).toMatch(/\{item\.alertAwaitingReport && \(/);
    expect(read("../app/validation/[id]/page.tsx")).toMatch(
      /alertAwaitingReport=\{alertAwaitingReport\(\{ status: sample\.status, alertsSentAt: sample\.alertsSentAt, alerting: alertables \}\)\}/
    );
    expect(read("../components/validation/ValidationPanel.tsx")).toMatch(/\{alertAwaitingReport && \(/);
  });

  it("« Envoyer la série » says the alerts leave with this click (switch off)", () => {
    expect(serieSendAlertNotice(0)).toBeNull();
    expect(serieSendAlertNotice(1)).toBe("Une alerte de contamination part avec ces rapports : 1 échantillon en déclenche une.");
    expect(serieSendAlertNotice(3)).toBe("Une alerte de contamination part avec ces rapports : 3 échantillons en déclenchent une.");
    expect(serieSendAlertNotice(2, true)).toBeNull();
    const line = (id: string, alertsPending: number) => ({
      id,
      code: `991/26-${id}`,
      controlCode: null,
      lineNumber: 1,
      designation: "Produit X",
      status: "VALIDE" as const,
      report: { number: `RAP-${id}`, version: 0, sentAt: null, amendedAt: null, amendmentPending: false },
      alertsPending,
    });
    const plan = serieSendPlan([line("a", 2), line("b", 0)]);
    expect(plan.eligible.map((entry) => entry.alertables ?? 0)).toEqual([2, 0]);
    const dialog = readFileSync(fileURLToPath(new URL("../components/validation/SerieBatchActions.tsx", import.meta.url)), "utf8");
    expect(dialog).toMatch(/action === "send"\s+\? serieSendAlertNotice\(alerting\)/);
  });
});

describe("alert moment (K3 → K7, Q9 of 04/11: the alert leaves with the report only)", () => {
  it("by default (K7, confirmé le 04/11) no validation sends the alerts, whatever the setting S2 says", () => {
    expect(ALERTS_AT_VALIDATION).toBe(false);
    expect(alertsAtTechnicalValidation(true)).toBe(false);
    expect(alertsAtTechnicalValidation(false)).toBe(false);
    // « Valider »: nothing leaves; « Valider et envoyer »: the alert rides with the report.
    expect(alertsAtApproval(false)).toBe(false);
    expect(alertsAtApproval(true)).toBe(true);
    expect(alertsLeaveAt("validate", true)).toBe(false);
    expect(alertsLeaveAt("validate", false)).toBe(false);
    expect(alertsLeaveAt("approve", true)).toBe(false);
    expect(alertsLeaveAt("approve", false, undefined, true)).toBe(true);
    expect(serieAlertNotice("validate", true, 1)).toBe(
      "Une alerte de contamination part avec le rapport (« Valider et envoyer », « Envoyer au client ») : 1 échantillon ci-dessous en déclenche une."
    );
  });

  it("/admin/reglages says under the setting S2 that it no longer applies (only while the switch is off)", () => {
    expect(alertSettingNotice()).toMatch(/^Sans effet depuis la réponse du laboratoire du 04\/11 : l'alerte de contamination part seulement avec l'envoi du rapport/);
    expect(alertSettingNotice(true)).toBeNull();
    const form = readFileSync(fileURLToPath(new URL("../components/admin/LabSettingsForm.tsx", import.meta.url)), "utf8");
    expect(form).toMatch(/key: "alertAfterTechnicalValidation",[\s\S]*?notice: alertSettingNotice\(\)/);
    expect(form).toMatch(/\{item\.notice && \(/);
  });

  it("the way back (switch on): at the validation the settings name, as from 01/11", () => {
    expect(alertsAtTechnicalValidation(true, true)).toBe(true);
    expect(alertsAtTechnicalValidation(false, true)).toBe(false);
    expect(alertsAtApproval(false, true)).toBe(true);
    expect(alertsAtApproval(true, true)).toBe(true);
  });

  it("with the switch off, no validation sends them — only « Valider et envoyer » (and « Envoyer au client »)", () => {
    expect(alertsAtTechnicalValidation(true, false)).toBe(false);
    expect(alertsAtApproval(false, false)).toBe(false);
    expect(alertsAtApproval(true, false)).toBe(true);
  });

  it("the série's plan and its notice follow the switch", () => {
    expect(alertsLeaveAt("validate", true, true)).toBe(true);
    expect(alertsLeaveAt("validate", true, false)).toBe(false);
    expect(alertsLeaveAt("approve", false, false)).toBe(false);
    expect(serieAlertNotice("approve", false, 2, false)).toBe(
      "Une alerte de contamination part avec le rapport (« Valider et envoyer », « Envoyer au client ») : 2 échantillons ci-dessous en déclenchent une."
    );
    expect(serieAlertNotice("validate", true, 1, true)).toContain("dès la validation technique");
  });

  it("switch off: « Valider et envoyer » on a série sends the alert, « Valider » does not — the dialog's line says so", () => {
    // As alertsAtApproval: the approval that sends the report sends the alert.
    expect(alertsLeaveAt("approve", false, false, true)).toBe(alertsAtApproval(true, false));
    expect(alertsLeaveAt("approve", true, false, true)).toBe(true);
    expect(alertsLeaveAt("approve", false, false, false)).toBe(alertsAtApproval(false, false));
    expect(alertsLeaveAt("validate", true, false, true)).toBe(false);
    // Switch on: the send changes nothing (the settings decide).
    expect(alertsLeaveAt("approve", true, true, true)).toBe(false);
    expect(alertsLeaveAt("approve", false, true, false)).toBe(true);
  });
});
