import { AttemptLimiter, type AttemptOutcome } from "./attempt-limiter";

export { SIGN_IN_LOCKED_CODE } from "./sign-in-errors";

/**
 * The sign-in limits (auth-server.ts), shaped for a laboratory whose PCs all
 * leave through one public address (NAT).
 *
 * 1. Per address — Better Auth's own rate limit, `SIGN_IN_IP_RULE`: its
 *    default (3 requests per 10 s per address) made colleagues signing in
 *    within the same 10 seconds block each other, a 429 the sign-in form
 *    then showed as « Identifiants incorrects. ».
 * 2. Per account — `signInLimiter` below: 10 wrong passwords per 15 minutes
 *    for one username refuse the next attempt (429), whatever the address.
 *    The account itself is not touched (no ban, no flag): the refusal ends
 *    with the window, and a successful sign-in clears the count. Unknown
 *    usernames are counted the same way, so the refusal says nothing about
 *    which accounts exist.
 *
 * Pure (the clock is the limiter's parameter): the server side lives in
 * sign-in-limit-server.ts.
 */

/** Better Auth's rule for POST /sign-in/username (`rateLimit.customRules`): 10 requests per 10 s per address. */
export const SIGN_IN_IP_RULE = { window: 10, max: 10 } as const;

export const SIGN_IN_MAX_FAILURES = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/** Past this many tracked usernames, expired entries are swept before a new attempt. */
export const SIGN_IN_LIMITER_SWEEP_AT = 5_000;

/**
 * The counter key of a sign-in: the username as Better Auth looks it up
 * (lower case, `username` plugin), trimmed — « Tech1 » and « tech1 » are one
 * account. `null` when the body carries no usable username: the endpoint
 * refuses that request itself (422), it is not a password guess.
 */
export function signInLimiterKey(username: unknown): string | null {
  if (typeof username !== "string") return null;
  const key = username.trim().toLowerCase();
  return /^[a-z0-9._-]{3,30}$/.test(key) ? key : null;
}

/** What the endpoint answered, as the `hooks.after` sees it (`ctx.context.returned`). */
export type SignInResult =
  | { kind: "error"; statusCode: number; code?: string }
  | { kind: "success" }
  | { kind: "other" };

/**
 * A wrong username or password counts; a sign-in clears the count; anything
 * else — a disabled account (BANNED_USER: the password was right), a
 * malformed request, a server error — is forgotten.
 */
export function signInAttemptOutcome(result: SignInResult): AttemptOutcome {
  if (result.kind === "success") return "SUCCEEDED";
  if (result.kind === "error" && (result.statusCode === 401 || result.code === "INVALID_USERNAME_OR_PASSWORD")) {
    return "FAILED";
  }
  return "NEUTRAL";
}

/** « Trop de tentatives… », the per-account refusal's message (French, the API's other refusals are). */
export function signInLockedMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Trop de mots de passe erronés pour ce compte. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

const globalForLimiter = globalThis as unknown as { signInLimiter?: AttemptLimiter };

/** The one per-account sign-in counter, kept on `globalThis` so a development hot reload does not reset it. */
export const signInLimiter: AttemptLimiter =
  globalForLimiter.signInLimiter ??
  new AttemptLimiter({ maxFailures: SIGN_IN_MAX_FAILURES, windowMs: SIGN_IN_WINDOW_MS });

globalForLimiter.signInLimiter = signInLimiter;
