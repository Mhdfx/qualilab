// No "server-only" here: auth-server.ts imports this file, and prisma/seed.ts
// imports auth-server.ts outside Next.js.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, getIp, isAPIError } from "better-auth/api";
import { defineRequestState } from "@better-auth/core/context";
import type { Attempt, AttemptStart } from "./attempt-limiter";
import { retryAfterSeconds } from "./attempt-limiter";
import {
  SIGN_IN_ADDRESS_LIMIT_CODE,
  SIGN_IN_LIMITER_SWEEP_EVERY_MS,
  SIGN_IN_LOCKED_CODE,
  signInAddressLimitedMessage,
  signInAddressKey,
  signInAttemptOutcome,
  signInLimiterKey,
  signInLimiters,
  signInLockedMessage,
  signInPairKey,
  type SignInLimiters,
  type SignInResult,
} from "./sign-in-limit";

const SIGN_IN_PATH = "/sign-in/username";

type PendingAttempt = { username: string; pairKey: string; pair: Attempt; account: Attempt };

/** The attempts `hooks.before` opened for this request, closed by `hooks.after` (Better Auth's per-request state). */
const pendingAttempt = defineRequestState<PendingAttempt | null>(() => null);

/** What the endpoint answered, read from `ctx.context.returned`. */
function resultOf(returned: unknown): SignInResult {
  if (isAPIError(returned)) {
    const body = returned.body as { code?: unknown } | undefined;
    return { kind: "error", statusCode: returned.statusCode, code: typeof body?.code === "string" ? body.code : undefined };
  }
  if (returned && typeof returned === "object" && "token" in returned) return { kind: "success" };
  return { kind: "other" };
}

/** A 429 with `X-Retry-After` in seconds, as Better Auth's own. */
function tooManyRequests(retryAfterMs: number, code: string, message: string): APIError {
  const seconds = retryAfterSeconds(retryAfterMs);
  return new APIError("TOO_MANY_REQUESTS", { message, code }, { "X-Retry-After": seconds, "Retry-After": seconds });
}

function refusedWait(started: AttemptStart): number {
  return started.ok ? 0 : started.retryAfterMs;
}

/**
 * The sign-in limits (sign-in-limit.ts) as a Better Auth plugin: a
 * `hooks.before` and a `hooks.after` on POST /sign-in/username — the only
 * sign-in door (/sign-in/email is closed by `disabledPaths`; Better Auth's
 * own rate limit is off on this path, `rateLimit.customRules`).
 *
 * Before, in this order:
 * 1. per address — over HTTP and when Better Auth's rate limiting is on
 *    (production, its default): every request counts for one minute, the
 *    31st within a minute is refused (429, `code`
 *    TOO_MANY_SIGN_INS_FROM_ADDRESS). The address is Better Auth's own
 *    (`getIp`, `advanced.ipAddress`: nginx's X-Real-IP).
 * 2. per account — the attempt is opened on `address|username` and on
 *    `username` (it counts from now, so parallel guesses cannot slip past the
 *    limit), or refused with a 429 — `code` TOO_MANY_FAILED_SIGN_INS, a
 *    French message, `X-Retry-After` in seconds — before the password is
 *    checked at all.
 * After: a wrong username or password keeps both counted, a sign-in clears
 * both of that account's counts, anything else forgets them. An endpoint
 * that crashes skips the after hook: its attempts stay counted until they
 * leave the window.
 */
export function signInLimitPlugin(limiters: SignInLimiters = signInLimiters): BetterAuthPlugin {
  return {
    id: "qualilab-sign-in-limit",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const now = Date.now();
            if (limiters.address.sweepIfDue(now, SIGN_IN_LIMITER_SWEEP_EVERY_MS)) {
              limiters.pair.sweep(now);
              limiters.account.sweep(now);
            }

            const source = ctx.request ?? ctx.headers;
            const address = source ? getIp(source, ctx.context.options) : null;

            // 1. Per address: HTTP only (a server-side `auth.api` call has no
            // client), and only where Better Auth limits requests at all.
            if (ctx.request && ctx.context.rateLimit.enabled) {
              const started = limiters.address.begin(signInAddressKey(address), now);
              if (!started.ok) {
                throw tooManyRequests(
                  started.retryAfterMs,
                  SIGN_IN_ADDRESS_LIMIT_CODE,
                  signInAddressLimitedMessage(started.retryAfterMs)
                );
              }
            }

            // 2. Per account.
            const username = signInLimiterKey((ctx.body as { username?: unknown } | undefined)?.username);
            if (!username) return;
            const pairKey = signInPairKey(address, username);
            const pair = limiters.pair.begin(pairKey, now);
            const account = limiters.account.begin(username, now);
            if (!pair.ok || !account.ok) {
              // Close whichever was opened: a refused request is not a guess.
              if (pair.ok) limiters.pair.settle(pairKey, pair.attempt, "NEUTRAL");
              if (account.ok) limiters.account.settle(username, account.attempt, "NEUTRAL");
              const wait = Math.max(refusedWait(pair), refusedWait(account));
              throw tooManyRequests(wait, SIGN_IN_LOCKED_CODE, signInLockedMessage(wait));
            }
            await pendingAttempt.set({ username, pairKey, pair: pair.attempt, account: account.attempt });
          }),
        },
      ],
      after: [
        {
          matcher: (ctx) => ctx.path === SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const pending = await pendingAttempt.get();
            if (!pending) return;
            await pendingAttempt.set(null);
            const outcome = signInAttemptOutcome(resultOf(ctx.context.returned));
            limiters.pair.settle(pending.pairKey, pending.pair, outcome);
            limiters.account.settle(pending.username, pending.account, outcome);
          }),
        },
      ],
    },
  };
}
