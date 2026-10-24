// No "server-only" here: auth.ts imports this file, and its tests run it
// outside Next.js. node:crypto keeps it off the client bundles anyway.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  REVOCATION_MARKER_PREFIX,
  liveRevocationCause,
  revocationMarkerValue,
  signedSessionCookieOf,
  type RevocationMarker,
  type SessionRevocationCause,
} from "./session-revocation";

/**
 * The markers an administrator's change — or the person's own password
 * change — leaves for the sessions it closes, and their reading by the page
 * guards and by IdleLogout's touch (session-revocation.ts says why). Kept
 * apart from the database: the admin route writes the rows in its own
 * transaction, password-change-server.ts after Better Auth's change
 * (`prisma.verification.createMany`); auth.ts and session-idle-server.ts read
 * them through Better Auth's verification store — this file only shapes and
 * judges them.
 */

/** A marker's identifier: the prefix, then the SHA-256 of the token — the token itself is never stored. */
export function revocationMarkerIdentifier(token: string): string {
  return `${REVOCATION_MARKER_PREFIX}${createHash("sha256").update(token).digest("hex")}`;
}

/**
 * The `Verification` rows for the sessions of the account `userId` about to
 * be closed: one per session still valid at `now`, expiring with it — its
 * cookie never outlives it, so neither need the marker.
 */
export function revocationMarkers(
  sessions: readonly { token: string; expiresAt: Date }[],
  cause: SessionRevocationCause,
  userId: string,
  now: Date
): { identifier: string; value: string; expiresAt: Date }[] {
  return sessions
    .filter((session) => session.expiresAt.getTime() > now.getTime())
    .map((session) => ({
      identifier: revocationMarkerIdentifier(session.token),
      value: revocationMarkerValue(cause, userId),
      expiresAt: session.expiresAt,
    }));
}

/**
 * The session token of a `cookie` header whose signature is right, or null.
 * Better Auth's own check (`getSignedCookie`): the signature is the base64
 * HMAC-SHA256 of the token under the auth secret. A forged or stale-secret
 * cookie costs no database read — Better Auth's session read refuses it
 * before any query, so must the marker's.
 */
export function verifiedSessionToken(cookieHeader: string | null | undefined, secret: string): string | null {
  const signed = signedSessionCookieOf(cookieHeader);
  if (!signed || !signed.token) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(signed.token).digest("base64"));
  const given = Buffer.from(signed.signature);
  return given.length === expected.length && timingSafeEqual(given, expected) ? signed.token : null;
}

/** Reads a marker by its identifier (Better Auth's `findVerificationValue`; a stub in the tests). */
export type RevocationMarkerLookup = (identifier: string) => Promise<RevocationMarker | null>;

/**
 * Why the session `token` was closed on purpose, or null — no marker, an
 * expired one, or a read that failed: the caller then says « Session fermée
 * après inactivité. » as before, never an error page for a notice.
 */
export async function revokedTokenCause(
  token: string,
  find: RevocationMarkerLookup,
  now: number = Date.now()
): Promise<SessionRevocationCause | null> {
  try {
    return liveRevocationCause(await find(revocationMarkerIdentifier(token)), now);
  } catch {
    return null;
  }
}

/**
 * The same for the session the `cookie` header names (a page guard's read,
 * `signedOutPath`) — none, and no read at all, without a session cookie
 * signed with `secret` (`verifiedSessionToken`).
 */
export async function revokedSessionCause(
  cookieHeader: string | null | undefined,
  find: RevocationMarkerLookup,
  secret: string,
  now: number = Date.now()
): Promise<SessionRevocationCause | null> {
  const token = verifiedSessionToken(cookieHeader, secret);
  return token ? revokedTokenCause(token, find, now) : null;
}
