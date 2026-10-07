import type { SampleStatus } from "@/generated/prisma/enums";
import type { Role } from "@/lib/roles";
import { SAMPLE_STATUS_LABELS } from "@/lib/labels";

/**
 * The sample lifecycle state machine.
 *
 * This is the ONLY place allowed to decide whether a status change is legal.
 * The lab's traceability guarantee is that a sample cannot skip a step or move
 * backwards without a recorded reason, so every transition names the roles that
 * may perform it and is validated server-side before the write.
 */

export const SAMPLE_STATUS_ORDER: SampleStatus[] = [
  "PRELEVE",
  "RECU",
  "PROGRAMME",
  "EN_ANALYSE",
  "RESULTATS_SAISIS",
  "VALIDE",
  "RAPPORT_ENVOYE",
];

type Transition = {
  from: SampleStatus;
  to: SampleStatus;
  roles: Role[];
  /** Backwards move: allowed only with a documented reason (rejection). */
  requiresReason?: boolean;
};

const TRANSITIONS: Transition[] = [
  { from: "PRELEVE", to: "RECU", roles: ["RECEPTIONNISTE", "ADMIN"] },
  // PROGRAMME.md §1 — the responsable des paramètres confirms the programme
  // d'analyse of a received line; only a programmed line may be opened at
  // the bench, so the former RECU → EN_ANALYSE shortcut no longer exists.
  // The admin stands in for an absent responsable.
  { from: "RECU", to: "PROGRAMME", roles: ["PROGRAMMATEUR", "ADMIN"] },
  { from: "PROGRAMME", to: "EN_ANALYSE", roles: ["TECHNICIEN", "ADMIN"] },
  { from: "EN_ANALYSE", to: "RESULTATS_SAISIS", roles: ["TECHNICIEN", "ADMIN"] },
  // Double validation (client, 2026-08-18): the VALIDATEUR signs off technically
  // first — recorded on the sample, not as a status change — then the ADMIN
  // approves, and only that second step moves the sample to VALIDE.
  { from: "RESULTATS_SAISIS", to: "VALIDE", roles: ["ADMIN"] },
  // The first send is what moves the sample; the gestionnaire commercial
  // may trigger it (client relationship), the validateur and admin too.
  { from: "VALIDE", to: "RAPPORT_ENVOYE", roles: ["GESTIONNAIRE", "VALIDATEUR", "ADMIN"] },
  // Quality rejection — returns the sample to the technician, reason required.
  {
    from: "RESULTATS_SAISIS",
    to: "EN_ANALYSE",
    roles: ["VALIDATEUR", "ADMIN"],
    requiresReason: true,
  },
  // Phase 9 — « Annuler »: terminal, with a coded motif (the route checks
  // it). The réception cancels before analysis, the admin at any point
  // before approval; only an admin brings a cancelled sample back, to the
  // step it had reached (received or not), with a written reason.
  { from: "PRELEVE", to: "ANNULE", roles: ["RECEPTIONNISTE", "ADMIN"] },
  { from: "RECU", to: "ANNULE", roles: ["RECEPTIONNISTE", "ADMIN"] },
  // A programmed line is already the laboratory's work: only the admin
  // cancels it (PROGRAMME.md §1), and brings it back to PROGRAMME.
  { from: "PROGRAMME", to: "ANNULE", roles: ["ADMIN"] },
  { from: "EN_ANALYSE", to: "ANNULE", roles: ["ADMIN"] },
  { from: "RESULTATS_SAISIS", to: "ANNULE", roles: ["ADMIN"] },
  { from: "ANNULE", to: "PRELEVE", roles: ["ADMIN"], requiresReason: true },
  { from: "ANNULE", to: "RECU", roles: ["ADMIN"], requiresReason: true },
  { from: "ANNULE", to: "PROGRAMME", roles: ["ADMIN"], requiresReason: true },
  // AMENDEMENT.md §2.1 — « Rouvrir pour amendement »: an approved report
  // goes back to the double validation. The administrator only, with the
  // reason printed on the amended report; `/api/samples/[id]/reopen` clears
  // both signatures (`REOPENED_SAMPLE_FIELDS`) and freezes the version.
  { from: "VALIDE", to: "RESULTATS_SAISIS", roles: ["ADMIN"], requiresReason: true },
  { from: "RAPPORT_ENVOYE", to: "RESULTATS_SAISIS", roles: ["ADMIN"], requiresReason: true },
];

/**
 * What « Rouvrir pour amendement » writes on the sample: back to results
 * entered, and both signatures cleared — the amended report needs a new
 * technical validation and a new approval, by two different people.
 * `alertsSentAt` is deliberately kept: the contamination alerts already
 * sent are not sent again for the same results (see `sendContaminationAlerts`).
 */
export const REOPENED_SAMPLE_FIELDS = {
  status: "RESULTATS_SAISIS",
  validatedById: null,
  validatedAt: null,
  approvedById: null,
  approvedAt: null,
} as const satisfies {
  status: SampleStatus;
  validatedById: null;
  validatedAt: null;
  approvedById: null;
  approvedAt: null;
};

/** The statuses whose identification fields may still be corrected (before approval). */
export const CORRECTABLE_STATUSES: SampleStatus[] = ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"];

/**
 * The statuses a programme d'analyse may be written on (PROGRAMME.md §5):
 * received and waiting, or programmed and not yet at the bench. Afterwards,
 * « Corriger la fiche » with a reason.
 */
export const PROGRAMMABLE_STATUSES: SampleStatus[] = ["RECU", "PROGRAMME"];

/**
 * Where a reactivated sample goes back to — the step it had reached: its
 * programme if one was confirmed, the reception step if it was numbered,
 * else the field.
 */
export function reactivationTarget(sample: {
  controlCode: string | null;
  programmedAt: Date | null;
}): SampleStatus {
  if (sample.programmedAt) return "PROGRAMME";
  return sample.controlCode ? "RECU" : "PRELEVE";
}

export type TransitionCheck =
  | { ok: true }
  | { ok: false; error: string };

export function canTransition(
  from: SampleStatus,
  to: SampleStatus,
  role: Role,
  reason?: string | null
): TransitionCheck {
  const transition = TRANSITIONS.find((t) => t.from === from && t.to === to);

  if (!transition) {
    return {
      ok: false,
      error: `Transition impossible : « ${statusLabel(from)} » → « ${statusLabel(to)} ».`,
    };
  }

  if (!transition.roles.includes(role)) {
    return {
      ok: false,
      error: "Votre profil n'est pas autorisé à effectuer cette action.",
    };
  }

  if (transition.requiresReason && !reason?.trim()) {
    return { ok: false, error: "Un motif est obligatoire pour cette action." };
  }

  return { ok: true };
}

export function nextStatus(current: SampleStatus): SampleStatus | null {
  const index = SAMPLE_STATUS_ORDER.indexOf(current);
  return index >= 0 && index < SAMPLE_STATUS_ORDER.length - 1
    ? SAMPLE_STATUS_ORDER[index + 1]
    : null;
}

/** Display labels live in `labels.ts` — the single source of truth for wording. */
export function statusLabel(status: SampleStatus) {
  return SAMPLE_STATUS_LABELS[status] ?? status;
}

/**
 * The two approvals a sample needs before its report may be issued.
 *
 * The client requires both on every sample: the VALIDATEUR checks the results
 * technically, then the ADMIN approves. "Awaiting approval" is derived — the
 * sample is still `RESULTATS_SAISIS`, but its technical validation is recorded
 * — so the six tracked statuses stay exactly as specified.
 */
export type ApprovalState =
  | "AWAITING_TECHNICAL"
  | "AWAITING_ADMIN"
  | "APPROVED";

export function approvalState(sample: {
  validatedById: string | null;
  approvedById: string | null;
}): ApprovalState {
  if (sample.approvedById) return "APPROVED";
  if (sample.validatedById) return "AWAITING_ADMIN";
  return "AWAITING_TECHNICAL";
}

export const APPROVAL_LABELS: Record<ApprovalState, string> = {
  AWAITING_TECHNICAL: "En attente de validation technique",
  AWAITING_ADMIN: "En attente d'approbation admin",
  APPROVED: "Approuvé",
};

/** Guards the technical validation step (which is not a status change). */
export function canValidateTechnically(
  sample: { status: SampleStatus; validatedById: string | null },
  role: Role
): TransitionCheck {
  if (role !== "VALIDATEUR" && role !== "ADMIN") {
    return { ok: false, error: "Votre profil n'est pas autorisé à valider." };
  }
  if (sample.status !== "RESULTATS_SAISIS") {
    return {
      ok: false,
      error: `Un échantillon « ${statusLabel(sample.status)} » n'est pas à valider.`,
    };
  }
  if (sample.validatedById) {
    return { ok: false, error: "La validation technique est déjà enregistrée." };
  }
  return { ok: true };
}

/**
 * Why an amended report may not be issued now — or null when it may
 * (AMENDEMENT.md §2.2-3). The amended version is only issued on a sample
 * approved again through the full double validation: VALIDE (or already
 * sent), a technical validation and an approval recorded, by two different
 * people. The approval route is the normal caller; this is what stops any
 * other path (a resend's self-healing, a future caller) from issuing
 * « RAP-…-A1 » on a sample still awaiting its signatures.
 */
export function amendmentIssueRefusal(sample: {
  status: SampleStatus;
  validatedById: string | null;
  approvedById: string | null;
}): string | null {
  if (sample.status !== "VALIDE" && sample.status !== "RAPPORT_ENVOYE") {
    return "Le rapport amendé ne peut être émis qu'à l'approbation de l'échantillon.";
  }
  if (!sample.validatedById || !sample.approvedById) {
    return "Le rapport amendé exige la validation technique et l'approbation.";
  }
  if (sample.validatedById === sample.approvedById) {
    return "La double validation exige deux signataires différents.";
  }
  return null;
}

/** Guards the admin's final approval, which is what sets the status to VALIDE. */
export function canApprove(
  sample: { status: SampleStatus; validatedById: string | null },
  role: Role,
  approverId?: string
): TransitionCheck {
  if (role !== "ADMIN") {
    return {
      ok: false,
      error: "Seul un administrateur peut donner l'approbation finale.",
    };
  }
  if (!sample.validatedById) {
    return {
      ok: false,
      error:
        "La validation technique du validateur est requise avant l'approbation.",
    };
  }
  // Two signatures means two people: whoever signed technically cannot
  // also give the final approval (an ADMIN who validated lets another
  // ADMIN approve).
  if (approverId && sample.validatedById === approverId) {
    return {
      ok: false,
      error:
        "La double validation exige deux signataires différents : le validateur technique ne peut pas donner aussi l'approbation finale.",
    };
  }
  return canTransition(sample.status, "VALIDE", role);
}
