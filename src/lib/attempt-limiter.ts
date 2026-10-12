/**
 * A per-account counter of failed attempts (« Mon compte », password change).
 *
 * Better Auth's own rate limiter only sees HTTP requests to its endpoints,
 * and the laboratory's password-change routes call `auth.api.changePassword`
 * server-side, outside it: without this counter a stolen session could try
 * current passwords without end. Keyed by the signed-in user's id — never
 * by IP, since every PC of the laboratory leaves through one address.
 *
 * In memory on purpose: one application container, and a restart that
 * clears the counter is acceptable. Pure (the clock is a parameter), so the
 * rule is tested without a server.
 */

export const PASSWORD_CHANGE_MAX_FAILURES = 5;
export const PASSWORD_CHANGE_WINDOW_MS = 15 * 60 * 1000;

export type AttemptLimiterOptions = {
  /** Failed attempts allowed inside the window; the next one is refused. */
  maxFailures: number;
  /** How long a failed attempt counts, in milliseconds. */
  windowMs: number;
};

/** One attempt in flight or failed. Identity matters: `settle` removes this very entry. */
export type Attempt = { readonly at: number };

export type AttemptStart =
  | { ok: true; attempt: Attempt }
  | { ok: false; retryAfterMs: number };

/** What became of an attempt: a wrong password counts, a success clears, anything else is forgotten. */
export type AttemptOutcome = "FAILED" | "SUCCEEDED" | "NEUTRAL";

export class AttemptLimiter {
  private readonly entries = new Map<string, Attempt[]>();

  constructor(private readonly options: AttemptLimiterOptions) {}

  /** The attempts of `key` still inside the window at `now` (older ones are dropped). */
  private live(key: string, now: number): Attempt[] {
    const kept = (this.entries.get(key) ?? []).filter((entry) => now - entry.at < this.options.windowMs);
    if (kept.length > 0) this.entries.set(key, kept);
    else this.entries.delete(key);
    return kept;
  }

  /**
   * Opens an attempt, or refuses it while the account has used up its
   * failures. The attempt counts from the moment it starts, so requests sent
   * in parallel cannot slip past the limit before the first one fails.
   */
  begin(key: string, now: number = Date.now()): AttemptStart {
    const live = this.live(key, now);
    if (live.length >= this.options.maxFailures) {
      const oldest = Math.min(...live.map((entry) => entry.at));
      return { ok: false, retryAfterMs: Math.max(1, oldest + this.options.windowMs - now) };
    }
    const attempt: Attempt = { at: now };
    this.entries.set(key, [...live, attempt]);
    return { ok: true, attempt };
  }

  /** Closes an attempt opened by `begin`. */
  settle(key: string, attempt: Attempt, outcome: AttemptOutcome): void {
    if (outcome === "FAILED") return;
    if (outcome === "SUCCEEDED") {
      this.entries.delete(key);
      return;
    }
    const remaining = (this.entries.get(key) ?? []).filter((entry) => entry !== attempt);
    if (remaining.length > 0) this.entries.set(key, remaining);
    else this.entries.delete(key);
  }

  /** Accounts currently tracked (tests and diagnostics). */
  get size(): number {
    return this.entries.size;
  }
}

/** « Trop de tentatives, réessayez dans N minutes. », rounded up, never « 0 minute ». */
export function tooManyAttemptsMessage(retryAfterMs: number): string {
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Trop de tentatives, réessayez dans ${minutes} minute${minutes > 1 ? "s" : ""}.`;
}

/** The `Retry-After` header value (whole seconds, at least 1). */
export function retryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
}

const globalForLimiter = globalThis as unknown as { passwordChangeLimiter?: AttemptLimiter };

/**
 * The one counter of both password-change routes (portal and laboratory).
 * Kept on `globalThis` so a development hot reload does not reset it.
 */
export const passwordChangeLimiter: AttemptLimiter =
  globalForLimiter.passwordChangeLimiter ??
  new AttemptLimiter({ maxFailures: PASSWORD_CHANGE_MAX_FAILURES, windowMs: PASSWORD_CHANGE_WINDOW_MS });

globalForLimiter.passwordChangeLimiter = passwordChangeLimiter;
