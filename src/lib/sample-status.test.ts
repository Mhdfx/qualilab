import { describe, it, expect } from "vitest";
import {
  canTransition,
  canValidateTechnically,
  canApprove,
  approvalState,
  nextStatus,
  reactivationTarget,
  CORRECTABLE_STATUSES,
  PROGRAMMABLE_STATUSES,
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
    expect(canTransition("RECU", "PROGRAMME", "PROGRAMMATEUR").ok).toBe(true);
    expect(canTransition("PROGRAMME", "EN_ANALYSE", "TECHNICIEN").ok).toBe(true);
    expect(canTransition("EN_ANALYSE", "RESULTATS_SAISIS", "TECHNICIEN").ok).toBe(true);
    expect(canTransition("VALIDE", "RAPPORT_ENVOYE", "VALIDATEUR").ok).toBe(true);
  });

  it("refuses a desk acting outside its role", () => {
    expect(canTransition("PRELEVE", "RECU", "TECHNICIEN").ok).toBe(false);
    expect(canTransition("RECU", "PROGRAMME", "TECHNICIEN").ok).toBe(false);
    expect(canTransition("RECU", "PROGRAMME", "RECEPTIONNISTE").ok).toBe(false);
    expect(canTransition("PROGRAMME", "EN_ANALYSE", "PROGRAMMATEUR").ok).toBe(false);
    expect(canTransition("PROGRAMME", "EN_ANALYSE", "PRELEVEUR").ok).toBe(false);
    expect(canTransition("RESULTATS_SAISIS", "VALIDE", "COMPTABLE").ok).toBe(false);
  });

  it("refuses skipping a step", () => {
    expect(canTransition("PRELEVE", "VALIDE", "ADMIN").ok).toBe(false);
    expect(canTransition("PRELEVE", "RESULTATS_SAISIS", "ADMIN").ok).toBe(false);
    expect(canTransition("RECU", "VALIDE", "ADMIN").ok).toBe(false);
    expect(canTransition("PRELEVE", "PROGRAMME", "ADMIN").ok).toBe(false);
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

/**
 * PROGRAMME.md §1 — the programme d'analyse sits between the reception and
 * the bench: nothing reaches the bench without it.
 */
describe("the programme step", () => {
  it("no longer lets the bench open a line that was only received", () => {
    // The shortcut of the previous circuit is gone for everyone, admin included.
    expect(canTransition("RECU", "EN_ANALYSE", "TECHNICIEN").ok).toBe(false);
    expect(canTransition("RECU", "EN_ANALYSE", "ADMIN").ok).toBe(false);
  });

  it("lets the responsable des paramètres, or the admin in their place, confirm it", () => {
    expect(canTransition("RECU", "PROGRAMME", "PROGRAMMATEUR").ok).toBe(true);
    expect(canTransition("RECU", "PROGRAMME", "ADMIN").ok).toBe(true);
    expect(canTransition("RECU", "PROGRAMME", "VALIDATEUR").ok).toBe(false);
  });

  it("gives the responsable no approval, no validation and no sending", () => {
    expect(canTransition("RESULTATS_SAISIS", "VALIDE", "PROGRAMMATEUR").ok).toBe(false);
    expect(canTransition("VALIDE", "RAPPORT_ENVOYE", "PROGRAMMATEUR").ok).toBe(false);
    expect(canTransition("RESULTATS_SAISIS", "EN_ANALYSE", "PROGRAMMATEUR", "motif").ok).toBe(false);
    expect(canTransition("PRELEVE", "RECU", "PROGRAMMATEUR").ok).toBe(false);
    expect(
      canValidateTechnically({ status: "RESULTATS_SAISIS", validatedById: null }, "PROGRAMMATEUR").ok
    ).toBe(false);
    expect(
      canApprove({ status: "RESULTATS_SAISIS", validatedById: "u1" }, "PROGRAMMATEUR").ok
    ).toBe(false);
  });

  it("only the admin cancels a programmed line, and only the admin brings it back — with a reason", () => {
    expect(canTransition("PROGRAMME", "ANNULE", "ADMIN").ok).toBe(true);
    expect(canTransition("PROGRAMME", "ANNULE", "RECEPTIONNISTE").ok).toBe(false);
    expect(canTransition("PROGRAMME", "ANNULE", "PROGRAMMATEUR").ok).toBe(false);
    expect(canTransition("ANNULE", "PROGRAMME", "ADMIN", "erreur de saisie").ok).toBe(true);
    expect(canTransition("ANNULE", "PROGRAMME", "ADMIN").ok).toBe(false);
    expect(canTransition("ANNULE", "PROGRAMME", "PROGRAMMATEUR", "motif").ok).toBe(false);
  });

  it("keeps the reception's own cancellation on a received line", () => {
    expect(canTransition("RECU", "ANNULE", "RECEPTIONNISTE").ok).toBe(true);
    expect(canTransition("ANNULE", "RECU", "ADMIN", "motif").ok).toBe(true);
  });

  it("sends a reactivated line back to the step it had reached", () => {
    const programmed = new Date("2026-10-06T09:00:00.000Z");
    expect(reactivationTarget({ controlCode: "26-0001", programmedAt: programmed })).toBe("PROGRAMME");
    expect(reactivationTarget({ controlCode: "26-0001", programmedAt: null })).toBe("RECU");
    expect(reactivationTarget({ controlCode: null, programmedAt: null })).toBe("PRELEVE");
  });

  it("accepts a programme on a received or programmed line only", () => {
    expect(PROGRAMMABLE_STATUSES).toEqual(["RECU", "PROGRAMME"]);
  });

  it("still lets the fiche be corrected while the line is programmed", () => {
    expect(CORRECTABLE_STATUSES).toContain("PROGRAMME");
    expect(CORRECTABLE_STATUSES).not.toContain("VALIDE");
    expect(CORRECTABLE_STATUSES).not.toContain("ANNULE");
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
  it("keeps the six statuses the client's specification promises, plus the programme step", () => {
    expect(SAMPLE_STATUS_ORDER).toEqual([
      "PRELEVE",
      "RECU",
      "PROGRAMME",
      "EN_ANALYSE",
      "RESULTATS_SAISIS",
      "VALIDE",
      "RAPPORT_ENVOYE",
    ]);
  });

  it("walks forward and stops at the end", () => {
    expect(nextStatus("PRELEVE")).toBe("RECU");
    expect(nextStatus("RECU")).toBe("PROGRAMME");
    expect(nextStatus("PROGRAMME")).toBe("EN_ANALYSE");
    expect(nextStatus("VALIDE")).toBe("RAPPORT_ENVOYE");
    expect(nextStatus("RAPPORT_ENVOYE")).toBeNull();
  });
});

describe("canApprove — two different signatories", () => {
  const validated = {
    status: "RESULTATS_SAISIS" as const,
    validatedById: "user-validateur",
  };

  it("refuses the final approval from the person who signed technically", () => {
    const check = canApprove(validated, "ADMIN", "user-validateur");
    expect(check.ok).toBe(false);
  });

  it("accepts a different ADMIN as second signatory", () => {
    expect(canApprove(validated, "ADMIN", "user-admin").ok).toBe(true);
  });
});
