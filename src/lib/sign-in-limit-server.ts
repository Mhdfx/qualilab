// No "server-only" here: auth-server.ts imports this file, and prisma/seed.ts
// imports auth-server.ts outside Next.js.
import type { BetterAuthPlugin } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { defineRequestState } from "@better-auth/core/context";
import type { Attempt, AttemptLimiter } from "./attempt-limiter";
import { retryAfterSeconds } from "./attempt-limiter";
import {
  SIGN_IN_LIMITER_SWEEP_AT,
  SIGN_IN_LOCKED_CODE,
  signInAttemptOutcome,
  signInLimiter,
  signInLimiterKey,
  signInLockedMessage,
  type SignInResult,
} from "./sign-in-limit";

const SIGN_IN_PATH = "/sign-in/username";

/** The attempt `hooks.before` opened for this request, closed by `hooks.after` (Better Auth's per-request state). */
const pendingAttempt = defineRequestState<{ key: string; attempt: Attempt } | null>(() => null);

/** What the endpoint answered, read from `ctx.context.returned`. */
function resultOf(returned: unknown): SignInResult {
  if (isAPIError(returned)) {
    const body = returned.body as { code?: unknown } | undefined;
    return { kind: "error", statusCode: returned.statusCode, code: typeof body?.code === "string" ? body.code : undefined };
  }
  if (returned && typeof returned === "object" && "token" in returned) return { kind: "success" };
  return { kind: "other" };
}

/**
 * The per-account sign-in limit (sign-in-limit.ts) as a Better Auth plugin:
 * a `hooks.before` and a `hooks.after` on POST /sign-in/username — the only
 * sign-in door (/sign-in/email is closed by `disabledPaths`). Better Auth's
 * per-address rate limit runs earlier, in the router: a request it refuses
 * never reaches these hooks.
 *
 * Before: the attempt is opened (it counts from now, so parallel guesses
 * cannot slip past the limit), or refused with a 429 — `code`
 * TOO_MANY_FAILED_SIGN_INS, a French message, `X-Retry-After` in seconds as
 * Better Auth's own 429 — before the password is checked at all.
 * After: a wrong username or password keeps it counted, a sign-in clears the
 * account's count, anything else forgets it. An endpoint that crashes skips
 * the after hook: its attempt stays counted until it leaves the window.
 */
export function signInLimitPlugin(limiter: AttemptLimiter = signInLimiter): BetterAuthPlugin {
  return {
    id: "qualilab-sign-in-limit",
    hooks: {
      before: [
        {
          matcher: (ctx) => ctx.path === SIGN_IN_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const key = signInLimiterKey((ctx.body as { username?: unknown } | undefined)?.username);
            if (!key) return;
            const now = Date.now();
            if (limiter.size > SIGN_IN_LIMITER_SWEEP_AT) limiter.sweep(now);
            const started = limiter.begin(key, now);
            if (!started.ok) {
              const seconds = retryAfterSeconds(started.retryAfterMs);
              throw new APIError(
                "TOO_MANY_REQUESTS",
                { message: signInLockedMessage(started.retryAfterMs), code: SIGN_IN_LOCKED_CODE },
                { "X-Retry-After": seconds, "Retry-After": seconds }
              );
            }
            await pendingAttempt.set({ key, attempt: started.attempt });
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
            limiter.settle(pending.key, pending.attempt, signInAttemptOutcome(resultOf(ctx.context.returned)));
          }),
        },
      ],
    },
  };
}
