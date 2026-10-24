import { SESSION_COOKIE_NAMES, cookiePairs } from "./session-idle";

/**
 * Why the sign-in page says the session ended, when the administrator ended
 * it (PATCH /api/admin/users/[id] — a password reset, a disabling, a portal
 * account's scope changed: `accountChangeClosesSessions`) or the person's own
 * password change did, on their other devices (« Mon compte »,
 * password-change-server.ts). Before 23/10 the person read « Session fermée
 * après inactivité. », the notice of a session the server no longer knows
 * (`signedOutPath` in auth.ts): the cookie alone cannot tell an idle session
 * from one closed on purpose.
 *
 * No schema change: the administrator's change leaves, in its transaction, a
 * short-lived marker per session it closes — a row of Better Auth's
 * `Verification` table, identifier `session-fermee:` + the SHA-256 of the
 * session's token, value the cause and the account (`DISABLED:<userId>`, so
 * that a re-enabling removes its account's « désactivé »), expiring with the
 * session (session-revocation-server.ts). A page guard that finds no session
 * behind a correctly signed cookie looks its token up there: a marker → this
 * notice, none → the idle one. A real inactivity never leaves a marker. Pure
 * here: the causes, the notices, the reading of the cookie.
 */

export type SessionRevocationCause = "PASSWORD_RESET" | "DISABLED" | "ACCESS_CHANGED" | "PASSWORD_CHANGED";

const CAUSES: readonly SessionRevocationCause[] = ["PASSWORD_RESET", "DISABLED", "ACCESS_CHANGED", "PASSWORD_CHANGED"];

/** `?motif=` of the sign-in page for each cause (the idle one is `inactivite`, idle-policy.ts). */
export const REVOCATION_LOGIN_MOTIFS: Record<SessionRevocationCause, string> = {
  PASSWORD_RESET: "reinitialisation",
  DISABLED: "desactivation",
  ACCESS_CHANGED: "acces",
  PASSWORD_CHANGED: "changement",
};

/** What the sign-in page says for each cause. */
export const REVOCATION_NOTICES: Record<SessionRevocationCause, string> = {
  PASSWORD_RESET:
    "Votre mot de passe a été réinitialisé par l'administrateur : connectez-vous avec le nouveau mot de passe.",
  DISABLED: "Votre compte a été désactivé par l'administrateur.",
  ACCESS_CHANGED: "Vos accès ont été modifiés par l'administrateur : connectez-vous de nouveau.",
  PASSWORD_CHANGED: "Votre mot de passe a été changé : connectez-vous avec le nouveau mot de passe.",
};

/** The prefix of a marker's identifier in `Verification` (Better Auth's own rows never start with it). */
export const REVOCATION_MARKER_PREFIX = "session-fermee:";

export function isRevocationCause(value: unknown): value is SessionRevocationCause {
  return typeof value === "string" && (CAUSES as readonly string[]).includes(value);
}

/**
 * The cause an administrator's change gives the sessions it closes, or null
 * when it closes none (`kick` false). A disabling says so even with a reset
 * in the same request (the new password opens nothing); a reset comes next;
 * any other closing is the portal scope (`portalScopeChanged`). The person's
 * own change is always PASSWORD_CHANGED (password-change-server.ts).
 */
export function revocationCauseOf(change: {
  closesSessions: boolean;
  disabled: boolean;
  passwordReset: boolean;
}): SessionRevocationCause | null {
  if (!change.closesSessions) return null;
  if (change.disabled) return "DISABLED";
  if (change.passwordReset) return "PASSWORD_RESET";
  return "ACCESS_CHANGED";
}

/** Where a page sends the person whose session was closed on purpose. */
export function revokedLoginHref(cause: SessionRevocationCause): string {
  return `/login?motif=${REVOCATION_LOGIN_MOTIFS[cause]}`;
}

/** The sign-in page's notice for a `?motif=` of a closing on purpose, or null. */
export function revocationNoticeFor(motif: unknown): string | null {
  const cause = CAUSES.find((candidate) => REVOCATION_LOGIN_MOTIFS[candidate] === motif);
  return cause ? REVOCATION_NOTICES[cause] : null;
}

/**
 * The session cookie a `cookie` header carries, split, or null. Better Auth
 * signs the cookie: its value is `<token>.<signature>`, URL-encoded; the
 * token is what precedes the last dot. The first session cookie only, as
 * Better Auth reads it; its names and the reading of the header are
 * session-idle.ts's (`SESSION_COOKIE_NAMES`, `cookiePairs`), so this reading
 * and `carriesSessionCookie` never disagree. The signature is checked by
 * `verifiedSessionToken` (session-revocation-server.ts).
 */
export function signedSessionCookieOf(
  cookieHeader: string | null | undefined
): { token: string; signature: string } | null {
  const pair = cookiePairs(cookieHeader).find((candidate) => SESSION_COOKIE_NAMES.includes(candidate.name));
  if (!pair) return null;
  let value: string;
  try {
    value = decodeURIComponent(pair.value);
  } catch {
    return null;
  }
  const dot = value.lastIndexOf(".");
  return dot > 0 ? { token: value.slice(0, dot), signature: value.slice(dot + 1) } : null;
}

/**
 * The session token a `cookie` header carries, or null — its signature not
 * checked: what « Mon compte » reads to tell the request's own session from
 * the person's other ones (password-change-server.ts), behind a guard that
 * already checked it.
 */
export function sessionTokenOfCookie(cookieHeader: string | null | undefined): string | null {
  return signedSessionCookieOf(cookieHeader)?.token ?? null;
}

/**
 * A marker's `Verification.value`: the cause, then the account whose
 * session it was — what lets a re-enabling find its account's DISABLED
 * markers (PATCH /api/admin/users/[id]), the identifier being a hash.
 */
export function revocationMarkerValue(cause: SessionRevocationCause, userId: string): string {
  return `${cause}:${userId}`;
}

/** A marker as stored (`Verification.value`, `.expiresAt`). */
export type RevocationMarker = { value: unknown; expiresAt: unknown };

/** The cause a marker records, or null when it has expired at `now` or holds no known cause. */
export function liveRevocationCause(marker: RevocationMarker | null | undefined, now: number): SessionRevocationCause | null {
  if (!marker || typeof marker.value !== "string") return null;
  // `<cause>:<userId>` (`revocationMarkerValue`); a bare cause reads the same.
  const cause = marker.value.split(":")[0];
  if (!isRevocationCause(cause)) return null;
  const expiresAt = marker.expiresAt;
  if (!(expiresAt instanceof Date) && typeof expiresAt !== "string" && typeof expiresAt !== "number") return null;
  const end = new Date(expiresAt).getTime();
  return Number.isFinite(end) && end > now ? cause : null;
}
