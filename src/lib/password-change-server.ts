import "server-only";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth-server";
import { logAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  passwordChangeLimiter,
  retryAfterSeconds,
  tooManyAttemptsMessage,
  type AttemptOutcome,
} from "@/lib/attempt-limiter";
import { checkPasswordChange, passwordErrorMessage } from "@/lib/portal-access";
import { getDashboardPath } from "@/lib/roles";
import { sessionTokenOfCookie } from "@/lib/session-revocation";
import { revocationMarkers } from "@/lib/session-revocation-server";

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
 *
 * « Mot de passe à changer » (Q81, RETOUR-LABO-19-10.md H1): the person's
 * own change — and only it — clears `User.mustChangePassword`, set by the
 * administrator's creation or reset. The current password is still checked
 * (the one the administrator gave). The answer then carries `redirectTo`,
 * the account's dashboard, which every page was refusing until now — or
 * `stillRequired` should the flag fail to clear.
 *
 * The other sessions it closes — the préleveur's phone, a second PC — each
 * get a marker (session-revocation.ts), so their next page says « Votre mot
 * de passe a été changé… », not « Session fermée après inactivité. ».
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
    const requestHeaders = await headers();
    // Read before the change, which deletes them all and opens this page a
    // new one: the sessions of the person's other devices.
    const others = await otherSessionsOf(session.id, sessionTokenOfCookie(requestHeaders.get("cookie")));
    const response = await auth.api.changePassword({
      body: {
        currentPassword: checked.currentPassword,
        newPassword: checked.newPassword,
        revokeOtherSessions: true,
      },
      headers: requestHeaders,
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
    // The password is changed and this session's cookie renewed: whatever
    // follows must still hand the cookie back, or the person is signed out.
    await markClosedSessions(session.id, others);
    const required = session.mustChangePassword;
    let cleared = false;
    if (required) {
      try {
        await prisma.user.update({
          where: { id: session.id },
          data: { mustChangePassword: false },
        });
        cleared = true;
      } catch (error) {
        // The flag stays: « Mon compte » asks again, and the answer's
        // `stillRequired` tells the form that the current password is now
        // the one just chosen (the administrator's no longer works).
        console.error("[compte] mot de passe à changer non levé", { userId: session.id, error });
      }
    }
    await logAudit({
      actorId: session.id,
      action: "USER_PASSWORD_CHANGED",
      entity: "User",
      entityId: session.id,
      // `required`: the change the administrator's creation or reset asked
      // for; `flagCleared` false: the account is still asked for another.
      metadata: {
        username: session.username,
        portal: origin.portal,
        ...(required ? { required: true, flagCleared: cleared } : {}),
      },
    });

    const result = NextResponse.json(
      cleared
        ? { ok: true, redirectTo: getDashboardPath(session.role) }
        : required
          ? { ok: true, stillRequired: true }
          : { ok: true }
    );
    for (const cookie of response.headers.getSetCookie()) {
      result.headers.append("Set-Cookie", cookie);
    }
    return result;
  } finally {
    passwordChangeLimiter.settle(session.id, started.attempt, outcome);
  }
}

type OpenSession = { token: string; expiresAt: Date };

/**
 * The account's sessions but the one of this request (`currentToken`, read
 * from its cookie): those the change closes on the person's other devices.
 * A read that fails marks none — the change goes on, the other devices then
 * read the idle notice as before.
 */
async function otherSessionsOf(userId: string, currentToken: string | null): Promise<OpenSession[]> {
  try {
    return await prisma.session.findMany({
      where: currentToken ? { userId, token: { not: currentToken } } : { userId },
      select: { token: true, expiresAt: true },
    });
  } catch (error) {
    console.error("[compte] sessions des autres appareils non lues", { userId, error });
    return [];
  }
}

/**
 * Leaves a marker for each session the change closed (Better Auth has
 * deleted them; the marker is read at their next request). Never fails the
 * change: a write that fails only costs the notice.
 */
async function markClosedSessions(userId: string, closed: readonly OpenSession[]): Promise<void> {
  const rows = revocationMarkers(closed, "PASSWORD_CHANGED", userId, new Date());
  if (rows.length === 0) return;
  try {
    await prisma.verification.createMany({ data: rows });
  } catch (error) {
    console.error("[compte] motif de fermeture des autres sessions non écrit", { userId, error });
  }
}
