import { describe, it, expect } from "vitest";
import {
  canTransition,
  canValidateTechnically,
  canApprove,
  approvalState,
  nextStatus,
  SAMPLE_STATUS_ORDER,
} from "./sample-status";

/**
 * The state machine is the laboratory's traceability guarantee: a sample may
 * not skip a step, go backwards without a reason, or be moved by the wrong
 * desk. These tests are what stop a future change from quietly loosening it.
 */
describe("canTransition", () => {
  it("lets each desk make its own move", () => {
    expect(canTransition("PRELEVE", "RECU", "RECEPTIONNISTE").ok).toBe(true);
    expect(canTransition("RECU", "EN_ANALYSE", "TECHNICIEN").ok).toBe(true);
    expect(canTransition("EN_ANALYSE", "RESULTATS_SAISIS", "TECHNICIEN").ok).toBe(true);
    expect(canTransition("VALIDE", "RAPPORT_ENVOYE", "VALIDATEUR").ok).toBe(true);
  });

  it("refuses a desk acting outside its role", () => {
    expect(canTransition("PRELEVE", "RECU", "TECHNICIEN").ok).toBe(false);
    expect(canTransition("RECU", "EN_ANALYSE", "PRELEVEUR").ok).toBe(false);
    expect(canTransition("RESULTATS_SAISIS", "VALIDE", "COMPTABLE").ok).toBe(false);
  });

  it("refuses skipping a step", () => {
    expect(canTransition("PRELEVE", "VALIDE", "ADMIN").ok).toBe(false);
    expect(canTransition("PRELEVE", "RESULTATS_SAISIS", "ADMIN").ok).toBe(false);
    expect(canTransition("RECU", "VALIDE", "ADMIN").ok).toBe(false);
  });

  it("refuses repeating a step already taken", () => {
    const check = canTransition("RECU", "RECU", "RECEPTIONNISTE");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain("Transition impossible");
  });

  it("only the admin may pronounce a sample validated", () => {
    // The validateur signs off technically; the status change is the admin's.
    expect(canTransition("RESULTATS_SAISIS", "VALIDE", "ADMIN").ok).toBe(true);
    expect(canTransition("RESULTATS_SAISIS", "VALIDE", "VALIDATEUR").ok).toBe(false);
  });

  it("allows a rejection backwards, but only with a reason", () => {
    expect(
      canTransition("RESULTATS_SAISIS", "EN_ANALYSE", "VALIDATEUR", "valeur incohérente").ok
    ).toBe(true);
    expect(canTransition("RESULTATS_SAISIS", "EN_ANALYSE", "VALIDATEUR").ok).toBe(false);
    expect(canTransition("RESULTATS_SAISIS", "EN_ANALYSE", "VALIDATEUR", "   ").ok).toBe(false);
  });

  it("gives a message in French, never a code", () => {
    const check = canTransition("PRELEVE", "VALIDE", "ADMIN");
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.error).toMatch(/[éèêà]|impossible/i);
      expect(check.error).not.toMatch(/undefined|null|error/i);
    }
  });
});

describe("the two approvals", () => {
  const submitted = { status: "RESULTATS_SAISIS" as const, validatedById: null };
  const validated = { status: "RESULTATS_SAISIS" as const, validatedById: "u1" };

  it("the validateur signs off first", () => {
    expect(canValidateTechnically(submitted, "VALIDATEUR").ok).toBe(true);
    expect(canValidateTechnically(submitted, "TECHNICIEN").ok).toBe(false);
    expect(canValidateTechnically(submitted, "COMPTABLE").ok).toBe(false);
  });

  it("refuses a second technical validation", () => {
    expect(canValidateTechnically(validated, "VALIDATEUR").ok).toBe(false);
  });

  it("refuses validating a sample that is not at that stage", () => {
    expect(
      canValidateTechnically({ status: "EN_ANALYSE", validatedById: null }, "VALIDATEUR").ok
    ).toBe(false);
  });

  it("the admin cannot approve what nobody validated", () => {
    const check = canApprove(submitted, "ADMIN");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain("validation technique");
  });

  it("the validateur cannot approve alone either", () => {
    const check = canApprove(validated, "VALIDATEUR");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain("administrateur");
  });

  it("approves only once both conditions are met", () => {
    expect(canApprove(validated, "ADMIN").ok).toBe(true);
  });
});

describe("approvalState", () => {
  it("reads where a sample stands between the two signatures", () => {
    expect(approvalState({ validatedById: null, approvedById: null })).toBe("AWAITING_TECHNICAL");
    expect(approvalState({ validatedById: "u1", approvedById: null })).toBe("AWAITING_ADMIN");
    expect(approvalState({ validatedById: "u1", approvedById: "u2" })).toBe("APPROVED");
  });
});

describe("the lifecycle itself", () => {
  it("keeps the six statuses the client's specification promises", () => {
    expect(SAMPLE_STATUS_ORDER).toEqual([
      "PRELEVE",
      "RECU",
      "EN_ANALYSE",
      "RESULTATS_SAISIS",
      "VALIDE",
      "RAPPORT_ENVOYE",
    ]);
  });

  it("walks forward and stops at the end", () => {
    expect(nextStatus("PRELEVE")).toBe("RECU");
    expect(nextStatus("VALIDE")).toBe("RAPPORT_ENVOYE");
    expect(nextStatus("RAPPORT_ENVOYE")).toBeNull();
  });
});
