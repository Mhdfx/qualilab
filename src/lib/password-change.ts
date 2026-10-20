import { getDashboardPath, PORTAL_ROLE, type Role } from "./roles";

/**
 * « Mot de passe à changer » (Q81 of 19/10, RETOUR-LABO-19-10.md H1): an
 * account the administrator created, or whose password the administrator
 * reset, chooses its own password before anything else. Pure and
 * client-safe: the guards of `auth.ts` apply it to every page and every
 * route, the account pages and `changeOwnPassword` read its wording.
 *
 * - Set (`User.mustChangePassword = true`) by POST /api/admin/users and by a
 *   reset in PATCH /api/admin/users/[id] — laboratory and portal accounts
 *   alike; journal USER_PASSWORD_CHANGE_REQUIRED.
 * - Cleared by the person's own change (« Mon compte »,
 *   `changeOwnPassword`), which still checks the current password — the one
 *   the administrator gave.
 * - Meanwhile, every page leads to « Mon compte » and every route answers
 *   403, except Better Auth's own (session, sign-out) and the password
 *   change. Existing and seeded accounts stay at false: nothing rewrites them.
 */

/** Shown on « Mon compte » while the password must be changed. */
export const PASSWORD_CHANGE_NOTICE = "Choisissez votre mot de passe avant de continuer";

/** The 403 of every API route while the password must be changed. */
export const PASSWORD_CHANGE_API_ERROR = "Choisissez d'abord votre mot de passe (Mon compte).";

/**
 * The change went through but the flag could not be cleared (the route's
 * `stillRequired`): the password given by the administrator no longer
 * works — the one just chosen is now the current one.
 */
export const PASSWORD_STILL_REQUIRED_MESSAGE =
  "Votre mot de passe est enregistré, mais votre espace n'a pas pu s'ouvrir. Saisissez ce nouveau mot de passe comme mot de passe actuel et choisissez-en un autre.";

/** What « Mon compte » does once the password change has answered 200. */
export type PasswordChangeNext =
  /** The flag is cleared: the account's own space opens. */
  | { kind: "OPEN"; path: string }
  /** Changed, but the flag is still set: ask again, the new password as the current one. */
  | { kind: "STILL_REQUIRED" }
  /** An account whose password was already its own: the page stays. */
  | { kind: "STAY" };

/**
 * Reads the route's answer (`changeOwnPassword`). `redirectTo` is followed
 * only when it is a path of this application (« /… », never « //host » nor
 * « /\host », which browsers read as another host).
 */
export function passwordChangeNext(answer: { redirectTo?: unknown; stillRequired?: unknown }): PasswordChangeNext {
  if (answer.stillRequired === true) return { kind: "STILL_REQUIRED" };
  if (typeof answer.redirectTo === "string" && /^\/(?![/\\])/.test(answer.redirectTo)) {
    return { kind: "OPEN", path: answer.redirectTo };
  }
  return { kind: "STAY" };
}

/** Why the flag was set — the journal's `reason`. */
export type PasswordChangeCause = "CREATED" | "RESET";

/** The « Mon compte » page of a role: the portal's own for a client's account. */
export function accountPath(role: Role): string {
  return role === PORTAL_ROLE ? "/portail/compte" : "/compte";
}

/**
 * Where a signed-in account lands (« / », /login, after the forced change):
 * its « Mon compte » while its password must be changed, its dashboard
 * otherwise.
 */
export function landingPath(account: { role: Role; mustChangePassword: boolean }): string {
  return account.mustChangePassword ? accountPath(account.role) : getDashboardPath(account.role);
}

/**
 * The guards' rule: whether the password still to change stops this page or
 * route. Only the guards of « Mon compte » and of the password change
 * (`passwordChangeGuards` in auth.ts) let such an account through.
 */
export function passwordChangeBlocks(
  account: { mustChangePassword: boolean },
  guard: { allowsPasswordChange: boolean }
): boolean {
  return account.mustChangePassword && !guard.allowsPasswordChange;
}
