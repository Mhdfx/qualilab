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
  { from: "RECU", to: "EN_ANALYSE", roles: ["TECHNICIEN", "ADMIN"] },
  { from: "EN_ANALYSE", to: "RESULTATS_SAISIS", roles: ["TECHNICIEN", "ADMIN"] },
  // Double validation (client, 2026-08-18): the VALIDATEUR signs off technically
  // first — recorded on the sample, not as a status change — then the ADMIN
  // approves, and only that second step moves the sample to VALIDE.
  { from: "RESULTATS_SAISIS", to: "VALIDE", roles: ["ADMIN"] },
  { from: "VALIDE", to: "RAPPORT_ENVOYE", roles: ["VALIDATEUR", "ADMIN"] },
  // Quality rejection — returns the sample to the technician, reason required.
  {
    from: "RESULTATS_SAISIS",
    to: "EN_ANALYSE",
    roles: ["VALIDATEUR", "ADMIN"],
    requiresReason: true,
  },
];

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

/** Guards the admin's final approval, which is what sets the status to VALIDE. */
export function canApprove(
  sample: { status: SampleStatus; validatedById: string | null },
  role: Role
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
  return canTransition(sample.status, "VALIDE", role);
}
