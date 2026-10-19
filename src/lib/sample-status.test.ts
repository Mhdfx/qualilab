import { describe, it, expect } from "vitest";
import {
  canTransition,
  canValidateTechnically,
  canApprove,
  approvalState,
  APPROVAL_LABELS,
  nextStatus,
  reactivationTarget,
  CORRECTABLE_STATUSES,
  PROGRAMMABLE_STATUSES,
  REOPENED_SAMPLE_FIELDS,
  SAMPLE_STATUS_ORDER,
  amendmentIssueRefusal,
  ADMINISTRATIVE_SIGNATORY_LABEL,
  ADMINISTRATIVE_VALIDATION_ROLES,
  ANALYSIS_CANCEL_ROLES,
  REPORT_REOPEN_ROLES,
  TECHNICAL_VALIDATION_ROLES,
  signsAdministratively,
  signsTechnically,
  validationControls,
  validationPhase,
} from "./sample-status";
import { REOPENABLE_STATUSES, REOPENED_STATUS } from "./report-amendment";
import { ROLES, type Role } from "./roles";
import type { SampleStatus } from "@/generated/prisma/enums";

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

  it("the validation desks and the admin cancel a programmed line (16/10, Q13); only the admin brings it back — with a reason", () => {
    expect(canTransition("PROGRAMME", "ANNULE", "ADMIN").ok).toBe(true);
    expect(canTransition("PROGRAMME", "ANNULE", "DIRECTION").ok).toBe(true);
    expect(canTransition("PROGRAMME", "ANNULE", "VALIDATEUR").ok).toBe(true);
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

  it("names step 2 in the laboratory's words, « Validation administrative » (08/10)", () => {
    expect(APPROVAL_LABELS).toEqual({
      AWAITING_TECHNICAL: "En attente de validation technique",
      AWAITING_ADMIN: "En attente de validation administrative",
      APPROVED: "Validé (technique et administratif)",
    });
    const refused = canApprove({ status: "RESULTATS_SAISIS", validatedById: "u1" }, "VALIDATEUR");
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error).toBe("Seule la direction ou un administrateur peut donner la validation administrative.");
  });
});

/**
 * The Direction (answer of 12/10): « Validation administrative : Directeur et
 * son suppléant » — four people, two of whom also sign the technical
 * validation. Every role is decided here, so a role added later is decided
 * on purpose, not by accident.
 */
describe("who signs which step — every role (12/10)", () => {
  const submitted = { status: "RESULTATS_SAISIS" as const, validatedById: null };
  const validated = { status: "RESULTATS_SAISIS" as const, validatedById: "user-step1" };

  const TECHNICAL: Record<Role, boolean> = {
    PRELEVEUR: false,
    RECEPTIONNISTE: false,
    PROGRAMMATEUR: false,
    TECHNICIEN: false,
    VALIDATEUR: true,
    DIRECTION: true,
    GESTIONNAIRE: false,
    COMPTABLE: false,
    ADMIN: true,
    CLIENT: false,
    MAGASINIER: false,
  };
  const ADMINISTRATIVE: Record<Role, boolean> = {
    PRELEVEUR: false,
    RECEPTIONNISTE: false,
    PROGRAMMATEUR: false,
    TECHNICIEN: false,
    VALIDATEUR: false,
    DIRECTION: true,
    GESTIONNAIRE: false,
    COMPTABLE: false,
    ADMIN: true,
    CLIENT: false,
    MAGASINIER: false,
  };

  it("decides every role of the application", () => {
    expect(Object.keys(TECHNICAL).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(ADMINISTRATIVE).sort()).toEqual([...ROLES].sort());
  });

  it("canValidateTechnically: the validateur, the Direction and the admin", () => {
    for (const role of ROLES) {
      expect(canValidateTechnically(submitted, role).ok, role).toBe(TECHNICAL[role]);
      expect(signsTechnically(role), role).toBe(TECHNICAL[role]);
    }
    expect([...TECHNICAL_VALIDATION_ROLES]).toEqual(["VALIDATEUR", "DIRECTION", "ADMIN"]);
  });

  it("canApprove: the Direction and the admin only", () => {
    for (const role of ROLES) {
      expect(canApprove(validated, role, "user-step2").ok, role).toBe(ADMINISTRATIVE[role]);
      expect(signsAdministratively(role), role).toBe(ADMINISTRATIVE[role]);
    }
    expect([...ADMINISTRATIVE_VALIDATION_ROLES]).toEqual(["DIRECTION", "ADMIN"]);
  });

  it("refuses every other role with a message naming who signs step 2", () => {
    for (const role of ROLES.filter((r) => !ADMINISTRATIVE[r])) {
      const check = canApprove(validated, role, "user-step2");
      expect(check.ok, role).toBe(false);
      if (!check.ok) expect(check.error, role).toBe("Seule la direction ou un administrateur peut donner la validation administrative.");
    }
  });

  it("moves the sample to VALIDE only for the two signatories of step 2", () => {
    for (const role of ROLES) {
      expect(canTransition("RESULTATS_SAISIS", "VALIDE", role).ok, role).toBe(ADMINISTRATIVE[role]);
    }
  });

  it("lets the Direction send a sample back to the bench, with a reason, like the validateur", () => {
    for (const role of ROLES) {
      expect(canTransition("RESULTATS_SAISIS", "EN_ANALYSE", role, "valeur incohérente").ok, role).toBe(TECHNICAL[role]);
    }
    expect(canTransition("RESULTATS_SAISIS", "EN_ANALYSE", "DIRECTION").ok).toBe(false);
    expect(canTransition("RESULTATS_SAISIS", "EN_ANALYSE", "DIRECTION", "  ").ok).toBe(false);
  });

  it("lets the Direction send the report (first send), like the validateur", () => {
    expect(canTransition("VALIDE", "RAPPORT_ENVOYE", "DIRECTION").ok).toBe(true);
    expect(canTransition("VALIDE", "RAPPORT_ENVOYE", "VALIDATEUR").ok).toBe(true);
  });

  it("gives the Direction no other move: no reception, programme, bench, cancel before the programme or reactivation", () => {
    // Cancelling in analysis and reopening a report are the Direction's
    // since 16/10 (Q13) — decided in the block below.
    const moves: [SampleStatus, SampleStatus][] = [
      ["PRELEVE", "RECU"],
      ["RECU", "PROGRAMME"],
      ["PROGRAMME", "EN_ANALYSE"],
      ["EN_ANALYSE", "RESULTATS_SAISIS"],
      ["PRELEVE", "ANNULE"],
      ["RECU", "ANNULE"],
      ["ANNULE", "PRELEVE"],
      ["ANNULE", "RECU"],
      ["ANNULE", "PROGRAMME"],
    ];
    for (const [from, to] of moves) {
      expect(canTransition(from, to, "DIRECTION", "motif").ok, `${from} → ${to}`).toBe(false);
    }
  });
});

/**
 * 16/10, Q13: « l'administrateur, la Direction ou le validateur technique »
 * reopen a sent report for amendment, and « ces personnes » cancel a sample
 * already in analysis. The réception keeps cancelling before the programme;
 * reactivating stays the administrator's (our decision). Every role is
 * decided, so a role added later is decided on purpose.
 */
describe("reopening a report and cancelling in analysis — every role (16/10, Q13)", () => {
  const DESKS: Record<Role, boolean> = {
    PRELEVEUR: false,
    RECEPTIONNISTE: false,
    PROGRAMMATEUR: false,
    TECHNICIEN: false,
    VALIDATEUR: true,
    DIRECTION: true,
    GESTIONNAIRE: false,
    COMPTABLE: false,
    ADMIN: true,
    CLIENT: false,
    MAGASINIER: false,
  };
  const IN_ANALYSIS: SampleStatus[] = ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"];

  it("decides every role of the application", () => {
    expect(Object.keys(DESKS).sort()).toEqual([...ROLES].sort());
    expect([...REPORT_REOPEN_ROLES]).toEqual(["VALIDATEUR", "DIRECTION", "ADMIN"]);
    expect([...ANALYSIS_CANCEL_ROLES]).toEqual(["VALIDATEUR", "DIRECTION", "ADMIN"]);
  });

  it("lets the administrator, the Direction and the validateur reopen an approved report, with a reason", () => {
    for (const role of ROLES) {
      for (const from of REOPENABLE_STATUSES) {
        expect(canTransition(from, REOPENED_STATUS, role, "erreur de lot").ok, `${role} ${from}`).toBe(DESKS[role]);
        expect(canTransition(from, REOPENED_STATUS, role).ok, `${role} ${from} sans motif`).toBe(false);
      }
    }
  });

  it("lets the same three cancel a sample programmed, at the bench or with its results entered", () => {
    for (const role of ROLES) {
      for (const from of IN_ANALYSIS) {
        expect(canTransition(from, "ANNULE", role).ok, `${role} ${from}`).toBe(DESKS[role]);
      }
    }
  });

  it("keeps the cancellation before the programme to the réception and the admin", () => {
    for (const from of ["PRELEVE", "RECU"] as const) {
      for (const role of ROLES) {
        expect(canTransition(from, "ANNULE", role).ok, `${role} ${from}`).toBe(role === "RECEPTIONNISTE" || role === "ADMIN");
      }
    }
  });

  it("never lets the validateur or the Direction bring a cancelled sample back", () => {
    for (const role of ["VALIDATEUR", "DIRECTION"] as const) {
      for (const to of ["PRELEVE", "RECU", "PROGRAMME"] as const) {
        expect(canTransition("ANNULE", to, role, "erreur").ok, `${role} → ${to}`).toBe(false);
      }
    }
    expect(canTransition("ANNULE", "PROGRAMME", "ADMIN", "erreur").ok).toBe(true);
  });

  it("opens no cancellation of an approved or sent sample, for anyone", () => {
    for (const role of ROLES) {
      expect(canTransition("VALIDE", "ANNULE", role, "motif").ok, role).toBe(false);
      expect(canTransition("RAPPORT_ENVOYE", "ANNULE", role, "motif").ok, role).toBe(false);
    }
  });
});

describe("the same-person rule holds for the Direction (12/10)", () => {
  const validatedBy = (id: string) => ({ status: "RESULTATS_SAISIS" as const, validatedById: id });

  it("refuses the approval of the Direction member who signed step 1", () => {
    const check = canApprove(validatedBy("direction-a"), "DIRECTION", "direction-a");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toMatch(/deux signataires différents/);
  });

  it("accepts another Direction member, or the deputy, as second signatory", () => {
    expect(canApprove(validatedBy("direction-a"), "DIRECTION", "direction-b").ok).toBe(true);
    expect(canApprove(validatedBy("validateur-1"), "DIRECTION", "direction-a").ok).toBe(true);
  });

  it("lets the Direction approve what an administrator validated, and the reverse — two people", () => {
    expect(canApprove(validatedBy("admin-1"), "DIRECTION", "direction-a").ok).toBe(true);
    expect(canApprove(validatedBy("direction-a"), "ADMIN", "admin-1").ok).toBe(true);
    expect(canApprove(validatedBy("admin-1"), "ADMIN", "admin-1").ok).toBe(false);
  });

  it("still needs the technical validation first", () => {
    const check = canApprove({ status: "RESULTATS_SAISIS", validatedById: null }, "DIRECTION", "direction-a");
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.error).toContain("validation technique");
  });

  it("refuses a sample that is not awaiting its approval", () => {
    for (const status of ["EN_ANALYSE", "VALIDE", "RAPPORT_ENVOYE", "ANNULE"] as const) {
      expect(canApprove({ status, validatedById: "validateur-1" }, "DIRECTION", "direction-a").ok, status).toBe(false);
    }
  });

  it("keeps an amended report issued only on two different signatures, the Direction's included", () => {
    expect(amendmentIssueRefusal({ status: "VALIDE", validatedById: "direction-a", approvedById: "direction-b" })).toBeNull();
    expect(amendmentIssueRefusal({ status: "VALIDE", validatedById: "direction-a", approvedById: "direction-a" })).toMatch(
      /deux signataires différents/
    );
  });
});

describe("validationControls — what the validation panel offers", () => {
  const me = "user-me";
  const other = "user-other";

  it("offers step 1 and the send-back to the three validation desks only", () => {
    for (const role of ROLES) {
      const controls = validationControls("AWAITING_TECHNICAL", role, { validatedById: null, userId: me });
      expect(controls.validate, role).toBe(signsTechnically(role));
      expect(controls.reject, role).toBe(signsTechnically(role));
      expect(controls.approve, role).toBe(false);
      expect(controls.approvalLockedToOther, role).toBe(false);
      expect(controls.approvalNotMine, role).toBe(false);
    }
  });

  it("offers step 2 to the Direction and the admin, unless they signed step 1", () => {
    for (const role of ["DIRECTION", "ADMIN"] as const) {
      const fresh = validationControls("AWAITING_ADMIN", role, { validatedById: other, userId: me });
      expect(fresh, role).toEqual({ validate: false, approve: true, reject: true, approvalLockedToOther: false, approvalNotMine: false });
      const own = validationControls("AWAITING_ADMIN", role, { validatedById: me, userId: me });
      expect(own, role).toEqual({ validate: false, approve: false, reject: true, approvalLockedToOther: true, approvalNotMine: false });
    }
  });

  it("tells the validateur step 2 is not theirs, and still lets them send it back", () => {
    expect(validationControls("AWAITING_ADMIN", "VALIDATEUR", { validatedById: me, userId: me })).toEqual({
      validate: false,
      approve: false,
      reject: true,
      approvalLockedToOther: false,
      approvalNotMine: true,
    });
  });

  it("offers nothing once both signatures are on the sample", () => {
    for (const role of ROLES) {
      expect(validationControls("APPROVED", role, { validatedById: other, userId: me }), role).toEqual({
        validate: false,
        approve: false,
        reject: false,
        approvalLockedToOther: false,
        approvalNotMine: false,
      });
    }
  });

  it("agrees with canApprove for every role, both signers", () => {
    const validated = { status: "RESULTATS_SAISIS" as const, validatedById: other };
    for (const role of ROLES) {
      for (const userId of [me, other]) {
        expect(validationControls("AWAITING_ADMIN", role, { validatedById: other, userId }).approve, `${role} ${userId}`).toBe(
          canApprove(validated, role, userId).ok
        );
      }
    }
  });

  it("names the signatory of step 2 « Direction »", () => {
    expect(ADMINISTRATIVE_SIGNATORY_LABEL).toBe("Direction");
  });
});

describe("validationPhase — a sample opened from /recherche (16/10, Q13)", () => {
  it("signs only from RESULTATS_SAISIS, and shows the approved samples as such", () => {
    expect(validationPhase("RESULTATS_SAISIS")).toBe("AT_VALIDATION");
    expect(validationPhase("VALIDE")).toBe("APPROVED");
    expect(validationPhase("RAPPORT_ENVOYE")).toBe("APPROVED");
  });

  it("has nothing to sign before the results, nor on a cancelled sample", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE"] as const) {
      expect(validationPhase(status), status).toBe("BEFORE_RESULTS");
    }
    expect(validationPhase("ANNULE")).toBe("CANCELLED");
  });

  it("agrees with the technical validation's own guard", () => {
    const statuses: SampleStatus[] = [...SAMPLE_STATUS_ORDER, "ANNULE"];
    for (const status of statuses) {
      expect(validationPhase(status) === "AT_VALIDATION", status).toBe(
        canValidateTechnically({ status, validatedById: null }, "VALIDATEUR").ok
      );
    }
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

describe("« Rouvrir pour amendement » (AMENDEMENT.md §2.1)", () => {
  it("sends an approved report back to the double validation — the admin, the Direction and the validateur (16/10), with a reason", () => {
    for (const from of REOPENABLE_STATUSES) {
      for (const role of ["ADMIN", "DIRECTION", "VALIDATEUR"] as const) {
        expect(canTransition(from, REOPENED_STATUS, role, "erreur de lot").ok, role).toBe(true);
        expect(canTransition(from, REOPENED_STATUS, role).ok, role).toBe(false);
        expect(canTransition(from, REOPENED_STATUS, role, "  ").ok, role).toBe(false);
      }
      for (const role of ["GESTIONNAIRE", "TECHNICIEN", "COMPTABLE"] as const) {
        expect(canTransition(from, REOPENED_STATUS, role, "motif").ok).toBe(false);
      }
    }
  });

  it("opens no other way back from an approved report", () => {
    expect(canTransition("VALIDE", "EN_ANALYSE", "ADMIN", "motif").ok).toBe(false);
    expect(canTransition("RAPPORT_ENVOYE", "VALIDE", "ADMIN", "motif").ok).toBe(false);
    expect(canTransition("RAPPORT_ENVOYE", "ANNULE", "ADMIN", "motif").ok).toBe(false);
    expect(canTransition("VALIDE", "ANNULE", "ADMIN", "motif").ok).toBe(false);
  });

  it("clears both signatures, so the amended report needs two new ones", () => {
    expect(REOPENED_SAMPLE_FIELDS).toEqual({
      status: "RESULTATS_SAISIS",
      validatedById: null,
      validatedAt: null,
      approvedById: null,
      approvedAt: null,
    });
    expect(
      approvalState({ validatedById: REOPENED_SAMPLE_FIELDS.validatedById, approvedById: REOPENED_SAMPLE_FIELDS.approvedById })
    ).toBe("AWAITING_TECHNICAL");
    expect(canValidateTechnically({ status: REOPENED_SAMPLE_FIELDS.status, validatedById: null }, "VALIDATEUR").ok).toBe(true);
  });

  it("keeps the contamination-alert claim (no alertsSentAt reset)", () => {
    expect(Object.keys(REOPENED_SAMPLE_FIELDS)).not.toContain("alertsSentAt");
  });
});

describe("issuing the amended report — never without the double validation", () => {
  const approved = { status: "VALIDE" as const, validatedById: "user-validateur", approvedById: "user-admin" };

  it("issues on a sample approved again by two different people", () => {
    expect(amendmentIssueRefusal(approved)).toBeNull();
    expect(amendmentIssueRefusal({ ...approved, status: "RAPPORT_ENVOYE" })).toBeNull();
  });

  it("refuses a sample just reopened, or awaiting its approval", () => {
    expect(amendmentIssueRefusal({ ...REOPENED_SAMPLE_FIELDS })).not.toBeNull();
    expect(amendmentIssueRefusal({ ...approved, status: "RESULTATS_SAISIS", approvedById: null })).not.toBeNull();
  });

  it("refuses an approval without a technical validation, or by the same signer", () => {
    expect(amendmentIssueRefusal({ ...approved, validatedById: null })).not.toBeNull();
    expect(amendmentIssueRefusal({ ...approved, approvedById: null })).not.toBeNull();
    expect(amendmentIssueRefusal({ ...approved, approvedById: "user-validateur" })).toMatch(/deux signataires différents/);
  });

  it("refuses any status other than approved", () => {
    for (const status of ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS", "ANNULE"] as const) {
      expect(amendmentIssueRefusal({ ...approved, status })).not.toBeNull();
    }
  });
});
