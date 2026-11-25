/**
 * What the sign-in form (LoginForm.tsx) says when Better Auth refuses a
 * sign-in. It used to say « Identifiants incorrects. » for every refusal: a
 * 429 of the per-address limit looked like a wrong password, people retried
 * and stayed blocked longer. No server import: the form must not bundle the
 * counters.
 */

/**
 * The `code` of the per-account refusal (sign-in-limit-server.ts). Here, not
 * in sign-in-limit.ts, so the sign-in form does not bundle the counter.
 */
export const SIGN_IN_LOCKED_CODE = "TOO_MANY_FAILED_SIGN_INS";

/**
 * The `code` of the per-address refusal (too many sign-ins from one network,
 * sign-in-limit-server.ts). The form treats every other 429 the same way —
 * Better Auth's own, on its other paths, carries no code.
 */
export const SIGN_IN_ADDRESS_LIMIT_CODE = "TOO_MANY_SIGN_INS_FROM_ADDRESS";

/** When no wait can be read from the answer. */
export const SIGN_IN_FALLBACK_WAIT_S = 10;

/** The sign-in error as the auth client hands it over (`error` of `signIn.username`). */
export type SignInError = {
  status?: number;
  code?: string;
};

/**
 * The wait in whole seconds, from the 429's `X-Retry-After` (the per-address
 * and the per-account refusals', as Better Auth's own) or `Retry-After`; the fallback when neither
 * is a positive number.
 */
export function retryAfterFromHeaders(headers: Pick<Headers, "get"> | null | undefined): number {
  for (const name of ["X-Retry-After", "Retry-After"]) {
    const value = Number(headers?.get(name));
    if (Number.isFinite(value) && value > 0) return Math.ceil(value);
  }
  return SIGN_IN_FALLBACK_WAIT_S;
}

/** « 1 seconde », « 8 secondes », « 2 minutes » (a minute and more is said in minutes, rounded up). */
export function waitPhrase(seconds: number): string {
  const s = Math.max(1, Math.ceil(seconds));
  if (s < 60) return `${s} seconde${s > 1 ? "s" : ""}`;
  const minutes = Math.ceil(s / 60);
  return `${minutes} minute${minutes > 1 ? "s" : ""}`;
}

/** Wrong username or password — and a username the endpoint rejects outright (422: too short, invalid characters). */
const INVALID_CREDENTIAL_CODES = new Set([
  "INVALID_USERNAME_OR_PASSWORD",
  "INVALID_USERNAME",
  "USERNAME_TOO_SHORT",
  "USERNAME_TOO_LONG",
]);

/**
 * The French message of a refused sign-in. `retryAfterS` is the wait of a
 * 429 (`retryAfterFromHeaders`).
 */
export function signInErrorMessage(error: SignInError, retryAfterS: number = SIGN_IN_FALLBACK_WAIT_S): string {
  if (error.status === 429) {
    if (error.code === SIGN_IN_LOCKED_CODE) {
      return `Trop de mots de passe erronés pour ce compte. Réessayez dans ${waitPhrase(retryAfterS)}.`;
    }
    return `Trop de tentatives de connexion depuis ce réseau. Réessayez dans ${waitPhrase(retryAfterS)}.`;
  }
  if (error.code === "BANNED_USER") return "Ce compte est désactivé. Contactez l'administrateur.";
  if (error.status === 401 || (error.code && INVALID_CREDENTIAL_CODES.has(error.code))) {
    return "Identifiants incorrects.";
  }
  return "Connexion impossible pour le moment. Réessayez.";
}
