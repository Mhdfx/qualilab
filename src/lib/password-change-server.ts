import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import {
  passwordChangeLimiter,
  retryAfterSeconds,
  tooManyAttemptsMessage,
  type AttemptOutcome,
} from "@/lib/attempt-limiter";
import { checkPasswordChange, passwordErrorMessage } from "@/lib/portal-access";

/**
 * « Mon compte »: a signed-in account changes its own password — the one
 * implementation behind both routes (`POST /api/portail/compte/mot-de-passe`
 * for a client's portal account, `POST /api/compte/mot-de-passe` for the
 * laboratory's staff). Each route checks its own roles first and passes the
 * session here.
 *
 * Better Auth's `changePassword` checks the current password, closes the
 * account's other sessions and renews this one's cookie, which is passed
 * back so the page stays signed in. Its HTTP endpoint is closed
 * (`disabledPaths` in auth-server.ts), so the call is made server-side —
 * outside Better Auth's own rate limit, hence the per-account counter
 * (`passwordChangeLimiter`: 5 wrong passwords per 15 minutes).
 */
export async function changeOwnPassword(
  request: Request,
  session: SessionUser,
  origin: { portal: boolean }
): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const checked = checkPasswordChange(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const started = passwordChangeLimiter.begin(session.id);
  if (!started.ok) {
    return NextResponse.json(
      { error: tooManyAttemptsMessage(started.retryAfterMs) },
      { status: 429, headers: { "Retry-After": retryAfterSeconds(started.retryAfterMs) } }
    );
  }

  let outcome: AttemptOutcome = "NEUTRAL";
  try {
    const response = await auth.api.changePassword({
      body: {
        currentPassword: checked.currentPassword,
        newPassword: checked.newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
      asResponse: true,
    });

    if (!response.ok) {
      let code: string | undefined;
      try {
        code = ((await response.json()) as { code?: string }).code;
      } catch {
        code = undefined;
      }
      if (code === "INVALID_PASSWORD") outcome = "FAILED";
      const status = response.status === 401 ? 401 : response.status >= 500 ? 500 : 400;
      return NextResponse.json({ error: passwordErrorMessage(code) }, { status });
    }

    outcome = "SUCCEEDED";
    await logAudit({
      actorId: session.id,
      action: "USER_PASSWORD_CHANGED",
      entity: "User",
      entityId: session.id,
      metadata: { username: session.username, portal: origin.portal },
    });

    const result = NextResponse.json({ ok: true });
    for (const cookie of response.headers.getSetCookie()) {
      result.headers.append("Set-Cookie", cookie);
    }
    return result;
  } finally {
    passwordChangeLimiter.settle(session.id, started.attempt, outcome);
  }
}
