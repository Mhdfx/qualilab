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
  { from: "RESULTATS_SAISIS", to: "VALIDE", roles: ["VALIDATEUR", "ADMIN"] },
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
