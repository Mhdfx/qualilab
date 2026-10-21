import { IDLE_TIMEOUT_MS, idleTimeoutFor } from "./idle-policy";
import { isRole } from "./roles";

/**
 * The server's side of the sign-out after inactivity (Q82, confirmed 19/10:
 * 30 minutes, the warning 2 minutes before, every laboratory post and the
 * client portal, never the préleveur's phone). `IdleLogout` closes the
 * session in the browser (idle-policy.ts); this bound closes it on the server
 * too, for the session whose browser never did — a tab closed without
 * « Déconnexion », a script stopped, the cookie used from elsewhere — which
 * otherwise rolled for seven days (auth-server.ts). Pure: the clock is a
 * parameter, so the rule is tested without a database.
 *
 * The stamp of the last activity is `Session.updatedAt`: Better Auth rewrites
 * it, with the expiry, on a request once `SESSION_ACTIVITY_UPDATE_AGE_S` has
 * passed since it last did (auth-server.ts); a page in use where nothing
 * calls the server — a long entry at the bench — is reported by `IdleLogout`:
 * at every page it opens, then every `SERVER_TOUCH_INTERVAL_MS` while someone
 * works, « Rester connecté » at once (`shouldTouchServer`, `touchOutcome`).
 * The refusal itself is `closeIdleSession` (session-idle-server.ts), ahead of
 * every session read.
 */

/**
 * Better Auth's `session.updateAge`, in seconds: a request stamps the session
 * when its stamp is a minute old or more — one write a minute at most per
 * person at work, and a stamp never more than a minute behind the request.
 */
export const SESSION_ACTIVITY_UPDATE_AGE_S = 60;

/** A page in use tells the server every 2 minutes at most (`IdleLogout`). */
export const SERVER_TOUCH_INTERVAL_MS = 2 * 60 * 1000;

/**
 * A touch that failed — network, server, no answer within
 * `SERVER_TOUCH_TIMEOUT_MS` — is sent again 15 seconds later by a timer,
 * whether or not anyone is still at the keyboard; an activity meanwhile does
 * not send it sooner (`serverTouchDue`).
 */
export const SERVER_TOUCH_RETRY_MS = 15 * 1000;

/** A touch still unanswered after 15 seconds is abandoned, then retried. */
export const SERVER_TOUCH_TIMEOUT_MS = 15 * 1000;

/**
 * What the server allows beyond the browser's limit: 5 minutes, so 35 in all.
 * The stamp trails the last click or key by at most a touch interval plus
 * Better Auth's update age (3 minutes); the 2 left cover a touch lost to the
 * network and retried (every 30 seconds at worst: a timeout, then the retry's
 * wait), and the time of the request. So the server never refuses a session
 * the browser still keeps open — the browser's own sign-out, with its
 * warning, always comes first.
 */
export const SERVER_IDLE_MARGIN_MS = 5 * 60 * 1000;

/** The prefix of Better Auth's cookies (`advanced.cookiePrefix`, auth-server.ts). */
export const SESSION_COOKIE_PREFIX = "qualilab";

/** The session cookie: plain over HTTP (development), `__Secure-` over HTTPS (production). */
const SESSION_COOKIE_NAMES: readonly string[] = [
  `${SESSION_COOKIE_PREFIX}.session_token`,
  `__Secure-${SESSION_COOKIE_PREFIX}.session_token`,
];

/**
 * The server's idle bound of a role, or null when nothing closes the session:
 * the préleveur (`idleTimeoutFor`), whose phone in the field may go hours
 * without the network. Every other role, the portal's included, gets the
 * browser's limit plus the margin; so does a value that is not a role —
 * only the préleveur is exempt.
 */
export function serverIdleLimitFor(role: unknown): number | null {
  const browserLimit = isRole(role) ? idleTimeoutFor(role) : IDLE_TIMEOUT_MS;
  return browserLimit === null ? null : browserLimit + SERVER_IDLE_MARGIN_MS;
}

/** The instant of a stamp (a Date, or as serialised), or null when it cannot be read. */
function instantOf(value: unknown): number | null {
  if (!(value instanceof Date) && typeof value !== "string" && typeof value !== "number") return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Whether the server must refuse the session `now`: its last activity is
 * older than its role's bound. Never for the préleveur; never on a stamp it
 * cannot read (the column is required: a missing one is not an idle session,
 * and the browser's rule does the same with an unreadable value).
 */
export function serverIdleExpired(role: unknown, lastActivity: unknown, now: number): boolean {
  const limit = serverIdleLimitFor(role);
  if (limit === null) return false;
  const last = instantOf(lastActivity);
  return last !== null && now - last > limit;
}

/**
 * Whether an activity at `now` must be reported to the server (`IdleLogout`):
 * the last successful touch is `SERVER_TOUCH_INTERVAL_MS` old, and the last
 * attempt — a failed one included — `SERVER_TOUCH_RETRY_MS` old, so a dead
 * network is not asked again at every key. A clock moved back (an NTP
 * correction on a PC that was ahead) makes an age negative: due again, never
 * held back until the clock catches up — the server would meanwhile close a
 * session in use.
 */
export function serverTouchDue(lastTouch: number, lastAttempt: number, now: number): boolean {
  const sinceTouch = now - lastTouch;
  const sinceAttempt = now - lastAttempt;
  return (
    (sinceTouch >= SERVER_TOUCH_INTERVAL_MS || sinceTouch < 0) &&
    (sinceAttempt >= SERVER_TOUCH_RETRY_MS || sinceAttempt < 0)
  );
}

/**
 * Whether `IdleLogout` reports an activity to the server: « Rester connecté »
 * (`force`) always — the session the warning keeps open must stay open on the
 * server too, whatever the throttles — any other activity once
 * `serverTouchDue`.
 */
export function shouldTouchServer(force: boolean, lastTouch: number, lastAttempt: number, now: number): boolean {
  return force || serverTouchDue(lastTouch, lastAttempt, now);
}

export type TouchOutcome = "stamped" | "retry" | "signed-out";

/** The HTTP status of a Better Auth client error, or null. */
function statusOf(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

/**
 * What the answer to a touch (`authClient.getSession()`, `{ data, error }`)
 * means for the page:
 * - a session: the server stamped it — `"stamped"`;
 * - no session (`null`), or 401 (Better Auth's answer when the row vanished
 *   under its own refresh): closed on the server meanwhile — its idle bound,
 *   an administrator's reset, « Déconnexion » in another tab — so nothing
 *   more can be saved from here — `"signed-out"`;
 * - any other error (a 502 while the server restarts, a 429, a 500): the
 *   session is still unknown — `"retry"`. A request that never answers
 *   (network down, `SERVER_TOUCH_TIMEOUT_MS`) is retried too, by IdleLogout.
 */
export function touchOutcome(answer: { data?: unknown; error?: unknown }): TouchOutcome {
  if (answer.error) return statusOf(answer.error) === 401 ? "signed-out" : "retry";
  return answer.data == null ? "signed-out" : "stamped";
}

/** The `name=value` pairs of a `cookie` header, as written. */
function cookiePairs(cookieHeader: string | null | undefined): { name: string; value: string; raw: string }[] {
  if (!cookieHeader) return [];
  return cookieHeader
    .split(";")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((raw) => {
      const eq = raw.indexOf("=");
      return eq < 0
        ? { name: raw, value: "", raw }
        : { name: raw.slice(0, eq).trim(), value: raw.slice(eq + 1).trim(), raw };
    });
}

/**
 * Whether a request carries the session cookie, with a value. A page guard
 * that finds no session behind it knows the server closed that session
 * (`guardPage` in auth.ts), since the browser's own « Déconnexion » deletes
 * the cookie.
 */
export function carriesSessionCookie(cookieHeader: string | null | undefined): boolean {
  return cookiePairs(cookieHeader).some((pair) => SESSION_COOKIE_NAMES.includes(pair.name) && pair.value !== "");
}

/**
 * The `cookie` header without the cookie `name` (every occurrence), the
 * others as they were: what the endpoint reads once the idle check refused
 * the session (session-idle-server.ts).
 */
export function withoutCookie(cookieHeader: string | null | undefined, name: string): string {
  return cookiePairs(cookieHeader)
    .filter((pair) => pair.name !== name)
    .map((pair) => pair.raw)
    .join("; ");
}
