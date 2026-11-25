import { AttemptLimiter, type AttemptOutcome } from "./attempt-limiter";
import { waitPhrase } from "./sign-in-errors";

export { SIGN_IN_ADDRESS_LIMIT_CODE, SIGN_IN_LOCKED_CODE } from "./sign-in-errors";

/**
 * The sign-in limits (auth-server.ts, sign-in-limit-server.ts), shaped for a
 * laboratory whose PCs all leave through one public address (NAT).
 *
 * 1. Per address — `SIGN_IN_ADDRESS_MAX` sign-in requests per
 *    `SIGN_IN_ADDRESS_WINDOW_MS` (a true sliding window: each request counts
 *    for one minute from its own moment), then 429 until the oldest leaves
 *    the window. Better Auth's own rule is turned off for /sign-in/username:
 *    its counter only restarts after a pause longer than its window, so
 *    « 3 per 10 s » (even « 10 per 10 s ») really meant « N sign-ins in a
 *    chain without a 10-second pause » — on the laboratory's shared address,
 *    a steady trickle of colleagues (one every 6 s) was refused at the 4th.
 * 2. Per account and address — `SIGN_IN_MAX_FAILURES` wrong passwords per
 *    15 minutes for one username from one address refuse that address's next
 *    attempt on that username (429). Someone outside cannot lock out a
 *    colleague signing in from the laboratory: their failures are counted
 *    for their own address.
 * 3. Per account, all addresses — `SIGN_IN_ACCOUNT_MAX_FAILURES` wrong
 *    passwords per 15 minutes, against guessing spread over many addresses.
 *    High enough that reaching it takes ten addresses each at their own
 *    limit.
 *
 * The account itself is never touched (no ban, no flag): a refusal ends with
 * its window, and a successful sign-in clears that account's counts. Unknown
 * usernames are counted the same way, so the refusal says nothing about
 * which accounts exist.
 *
 * Pure (the clock is the limiters' parameter): the server side lives in
 * sign-in-limit-server.ts.
 */

/** Sign-in requests per address (every request, whatever its outcome) per sliding window. */
export const SIGN_IN_ADDRESS_MAX = 30;
export const SIGN_IN_ADDRESS_WINDOW_MS = 60 * 1000;

/** Wrong passwords for one username from one address. */
export const SIGN_IN_MAX_FAILURES = 10;
/** Wrong passwords for one username from every address together. */
export const SIGN_IN_ACCOUNT_MAX_FAILURES = 100;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/** Expired entries are swept at most this often (each sweep scans every tracked key). */
export const SIGN_IN_LIMITER_SWEEP_EVERY_MS = 60 * 1000;

/** The address key when none can be trusted (Better Auth's own fallback: one shared bucket). */
export const NO_TRUSTED_ADDRESS = "no-trusted-ip";

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

/** The per-address key: the client's address, or one shared bucket when none can be trusted. */
export function signInAddressKey(address: string | null): string {
  return address ?? NO_TRUSTED_ADDRESS;
}

/** The per-account-and-address key: `address|username` (a username never holds « | »). */
export function signInPairKey(address: string | null, username: string): string {
  return `${signInAddressKey(address)}|${username}`;
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

/** The per-address refusal's message — the words the sign-in form shows for it (sign-in-errors.ts). */
export function signInAddressLimitedMessage(retryAfterMs: number): string {
  return `Trop de tentatives de connexion depuis ce réseau. Réessayez dans ${waitPhrase(retryAfterMs / 1000)}.`;
}

/** « Trop de tentatives… », the per-account refusal's message (French, the API's other refusals are). */
export function signInLockedMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Trop de mots de passe erronés pour ce compte. Réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

/** The three sign-in counters. */
export type SignInLimiters = {
  /** Every sign-in request, per address (sliding window). */
  address: AttemptLimiter;
  /** Wrong passwords, per `address|username`. */
  pair: AttemptLimiter;
  /** Wrong passwords, per username, every address together. */
  account: AttemptLimiter;
};

export function createSignInLimiters(): SignInLimiters {
  return {
    address: new AttemptLimiter({ maxFailures: SIGN_IN_ADDRESS_MAX, windowMs: SIGN_IN_ADDRESS_WINDOW_MS }),
    pair: new AttemptLimiter({ maxFailures: SIGN_IN_MAX_FAILURES, windowMs: SIGN_IN_WINDOW_MS }),
    account: new AttemptLimiter({ maxFailures: SIGN_IN_ACCOUNT_MAX_FAILURES, windowMs: SIGN_IN_WINDOW_MS }),
  };
}

const globalForLimiter = globalThis as unknown as { signInLimiters?: SignInLimiters };

/** The one set of sign-in counters, kept on `globalThis` so a development hot reload does not reset it. */
export const signInLimiters: SignInLimiters = globalForLimiter.signInLimiters ?? createSignInLimiters();

globalForLimiter.signInLimiters = signInLimiters;
