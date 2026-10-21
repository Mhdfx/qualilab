import type { Role } from "./roles";

/**
 * Sign-out after inactivity (finalversion.md: « Déconnexion automatique
 * après inactivité ») — the laboratory's PCs are shared. The browser closes
 * the session first, with its warning; the server closes it 5 minutes later
 * should the browser never have (session-idle.ts). Pure: the clock and the
 * stored value are parameters, so the rule is tested without a browser.
 * `IdleLogout.tsx` applies it in every shell.
 *
 * Constants, not a réglage: the same rule for everyone, so a forgotten
 * session never outlives the half hour.
 */

/** 30 minutes without a click, a key, a wheel or a touch. */
export const IDLE_TIMEOUT_MS = 30 * 60 * 1000;

/** The warning « Vous allez être déconnecté pour inactivité » opens 2 minutes before. */
export const IDLE_WARNING_MS = 2 * 60 * 1000;

/**
 * How often an activity is written for the other tabs: a wheel or a key
 * fires many times a second, the shared clock needs one write every few
 * seconds.
 */
export const IDLE_RECORD_THROTTLE_MS = 5 * 1000;

/** The localStorage key all tabs of the application share. */
export const IDLE_STORAGE_KEY = "qualilab:last-activity";

/** `?motif=` of the sign-in page after an automatic sign-out. */
export const IDLE_LOGIN_MOTIF = "inactivite";

/** Where the shell sends the user once the session is closed. */
export const IDLE_LOGIN_HREF = `/login?motif=${IDLE_LOGIN_MOTIF}`;

/**
 * The inactivity limit of a role, or null when nothing signs it out: the
 * préleveur works on a phone in the field, between two sites, and must not
 * lose a visit to a long drive. Every other laboratory role and the portal's
 * client accounts: 30 minutes.
 */
export function idleTimeoutFor(role: Role): number | null {
  return role === "PRELEVEUR" ? null : IDLE_TIMEOUT_MS;
}

export type IdleState =
  | { phase: "ACTIVE"; msLeft: number }
  | { phase: "WARNING"; msLeft: number }
  | { phase: "EXPIRED"; msLeft: 0 };

/**
 * Where a session stands `now`, given the last activity seen in any tab:
 * active, in the warning's last two minutes, or over.
 */
export function idleState(
  lastActivity: number,
  now: number,
  timeoutMs: number,
  warningMs: number = IDLE_WARNING_MS
): IdleState {
  const msLeft = lastActivity + timeoutMs - now;
  if (msLeft <= 0) return { phase: "EXPIRED", msLeft: 0 };
  if (msLeft <= warningMs) return { phase: "WARNING", msLeft };
  return { phase: "ACTIVE", msLeft };
}

/** How far ahead of this tab's clock a stored activity may be and still count. */
const FUTURE_TOLERANCE_MS = 60 * 1000;

/**
 * The last activity written by another tab, or null when the value is
 * missing, unreadable, or more than a minute in the future (a clock moved
 * back): read again on every tick, such a value would otherwise keep the
 * session open until the clock caught up. A value just ahead is capped at
 * `now`.
 */
export function readLastActivity(raw: string | null | undefined, now: number): number | null {
  if (!raw) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value > now + FUTURE_TOLERANCE_MS) return null;
  return Math.min(value, now);
}

/**
 * Whether a page that opens must close the session at once: the last
 * activity any tab of this browser recorded is older than the limit. That
 * is the shared PC whose tab was closed — or whose browser was left on
 * another site — without « Déconnexion »: between the browser's limit and
 * the server's, 5 minutes later (session-idle.ts), the session is still
 * open on the server, so without this the next person opening the
 * application would find the previous user's session; after that the page
 * guard sends them to the same notice. A missing or unreadable value
 * (blocked storage, first visit) never signs out.
 *
 * The sign-in page writes the moment of a successful sign-in
 * (`recordSignIn` in IdleLogout.tsx), so the stale value a previous user
 * left never closes the next user's fresh session.
 */
export function expiredOnArrival(raw: string | null | undefined, now: number, timeoutMs: number): boolean {
  const last = readLastActivity(raw, now);
  return last !== null && idleState(last, now, timeoutMs).phase === "EXPIRED";
}

/** Whether an activity at `now` must be written again for the other tabs. */
export function shouldRecordActivity(lastRecorded: number, now: number, throttleMs: number = IDLE_RECORD_THROTTLE_MS): boolean {
  return now - lastRecorded >= throttleMs;
}

/** « 1:45 » — the time left in the warning, minutes and seconds. */
export function formatIdleCountdown(msLeft: number): string {
  const totalSeconds = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** The sign-in page's notice for a `?motif=`, or null for none / an unknown one. */
export function loginNoticeFor(motif: unknown): string | null {
  return motif === IDLE_LOGIN_MOTIF ? "Session fermée après inactivité." : null;
}
