import type { Role } from "./roles";

/**
 * « Prélèvement effectué par » a Qualilab sampler — who the série names
 * (`Serie.samplerUserId`). Pure, used by the creation of a série
 * (`createSerie`, POST /api/series).
 *
 * A sampler always enters his own visits: one account per person, no shared
 * tablet (29/09, point 13), so a PRELEVEUR is the sampler of what he enters.
 * The réception or the admin keying in a paper protocol names the sampler
 * who signed it, an active PRELEVEUR account: never themselves by default
 * (D-05, 16/10) — the report would print a receptionist as the sampler.
 */

export const SAMPLER_MESSAGES = {
  ownAccount: "Chaque préleveur saisit ses prélèvements avec son propre compte.",
  missing: "Indiquez le préleveur Qualilab qui a effectué le prélèvement.",
  invalid: "Préleveur invalide.",
} as const;

export type QualilabSampler =
  | {
      ok: true;
      samplerUserId: string;
      /** The named account still has to be checked: an active PRELEVEUR. */
      checkAccount: boolean;
    }
  | { ok: false; error: string };

/**
 * The sampler of a série « Préleveur Qualilab », from the account the form
 * named (`requested`, null when none) and the author of the entry.
 */
export function qualilabSampler(requested: string | null, actor: { id: string; role: Role }): QualilabSampler {
  if (actor.role === "PRELEVEUR") {
    if (requested && requested !== actor.id) return { ok: false, error: SAMPLER_MESSAGES.ownAccount };
    return { ok: true, samplerUserId: actor.id, checkAccount: false };
  }
  if (!requested) return { ok: false, error: SAMPLER_MESSAGES.missing };
  // Naming oneself is checked too: a receptionist is not a sampler.
  return { ok: true, samplerUserId: requested, checkAccount: true };
}
