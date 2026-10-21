import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS, idleTimeoutFor } from "./idle-policy";
import { ROLES } from "./roles";
import {
  SERVER_IDLE_MARGIN_MS,
  SERVER_TOUCH_INTERVAL_MS,
  SERVER_TOUCH_RETRY_MS,
  SERVER_TOUCH_TIMEOUT_MS,
  SESSION_ACTIVITY_UPDATE_AGE_S,
  SESSION_COOKIE_PREFIX,
  carriesSessionCookie,
  serverIdleExpired,
  serverIdleLimitFor,
  serverTouchDue,
  shouldTouchServer,
  touchOutcome,
  withoutCookie,
} from "./session-idle";

const readSource = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 21, 9, 0);
const at = (minutes: number) => new Date(T0 - minutes * MINUTE);

describe("serverIdleLimitFor — the server's bound, role by role (Q82)", () => {
  it("gives every laboratory role and the portal's clients 35 minutes", () => {
    for (const role of ROLES.filter((r) => r !== "PRELEVEUR")) {
      expect(serverIdleLimitFor(role), role).toBe(35 * MINUTE);
    }
  });

  it("never closes the préleveur's session (a phone in the field)", () => {
    expect(serverIdleLimitFor("PRELEVEUR")).toBeNull();
  });

  it("exempts the préleveur only: a value that is not a role gets the bound", () => {
    for (const value of [null, undefined, "", "preleveur", "SUPERADMIN", 42]) {
      expect(serverIdleLimitFor(value), String(value)).toBe(35 * MINUTE);
    }
  });

  it("follows the browser's rule, whatever it becomes: same exemptions, never shorter", () => {
    for (const role of ROLES) {
      const browser = idleTimeoutFor(role);
      const server = serverIdleLimitFor(role);
      if (browser === null) expect(server, role).toBeNull();
      else expect(server, role).toBe(browser + SERVER_IDLE_MARGIN_MS);
    }
  });
});

describe("the margin — the server never closes a session the browser keeps", () => {
  it("covers the stamp's lag: a touch interval plus Better Auth's update age, with room for a retry", () => {
    const lag = SERVER_TOUCH_INTERVAL_MS + SESSION_ACTIVITY_UPDATE_AGE_S * 1000;
    expect(lag).toBe(3 * MINUTE);
    expect(SERVER_IDLE_MARGIN_MS - lag).toBeGreaterThanOrEqual(2 * MINUTE);
    // A lost touch costs a timeout and a retry's wait; the 2 minutes left
    // hold several of them.
    expect(SERVER_IDLE_MARGIN_MS - lag).toBeGreaterThanOrEqual(4 * (SERVER_TOUCH_TIMEOUT_MS + SERVER_TOUCH_RETRY_MS));
  });

  it("keeps a session whose last activity came just before the browser's limit", () => {
    // The worst case: the last click at T0 − 30 min, reported by a touch sent
    // 2 minutes before it, stamped by Better Auth a minute before that.
    const stamp = at(30 + 3);
    expect(serverIdleExpired("TECHNICIEN", stamp, T0)).toBe(false);
  });

  it("« Rester connecté » at the warning's last second reaches a server that still keeps the session", () => {
    // The last click at T0, its stamp 3 minutes older at worst; the warning
    // opens at T0 + 28 min and the button is pressed one second before the end.
    const lastClick = T0;
    const pressedAt = lastClick + IDLE_TIMEOUT_MS - 1000;
    expect(pressedAt - (lastClick + IDLE_TIMEOUT_MS - IDLE_WARNING_MS)).toBeLessThan(IDLE_WARNING_MS);
    expect(serverIdleExpired("RECEPTIONNISTE", new Date(lastClick - 3 * MINUTE), pressedAt)).toBe(false);
  });
});

describe("serverIdleExpired — refused like a signed-out session", () => {
  it("keeps a fresh session and one idle up to 35 minutes", () => {
    expect(serverIdleExpired("TECHNICIEN", at(0), T0)).toBe(false);
    expect(serverIdleExpired("TECHNICIEN", at(34), T0)).toBe(false);
    expect(serverIdleExpired("CLIENT", at(35), T0)).toBe(false);
  });

  it("refuses it past 35 minutes, the portal's clients and the administrator included", () => {
    expect(serverIdleExpired("TECHNICIEN", new Date(T0 - 35 * MINUTE - 1), T0)).toBe(true);
    expect(serverIdleExpired("CLIENT", at(40), T0)).toBe(true);
    expect(serverIdleExpired("ADMIN", at(40), T0)).toBe(true);
    expect(serverIdleExpired("DIRECTION", at(24 * 60), T0)).toBe(true);
  });

  it("never refuses the préleveur, however long", () => {
    expect(serverIdleExpired("PRELEVEUR", at(40), T0)).toBe(false);
    expect(serverIdleExpired("PRELEVEUR", at(6 * 24 * 60), T0)).toBe(false);
  });

  it("reads the stamp as Better Auth or a serialised session gives it", () => {
    expect(serverIdleExpired("VALIDATEUR", at(40).toISOString(), T0)).toBe(true);
    expect(serverIdleExpired("VALIDATEUR", at(40).getTime(), T0)).toBe(true);
    expect(serverIdleExpired("VALIDATEUR", at(10).toISOString(), T0)).toBe(false);
  });

  it("never refuses on a stamp it cannot read", () => {
    for (const stamp of [null, undefined, "", "pas une date", Number.NaN, {}]) {
      expect(serverIdleExpired("TECHNICIEN", stamp, T0), String(stamp)).toBe(false);
    }
  });

  it("keeps a stamp from the future (a clock set back)", () => {
    expect(serverIdleExpired("TECHNICIEN", new Date(T0 + 10 * MINUTE), T0)).toBe(false);
  });
});

describe("serverTouchDue — when a page in use reports to the server", () => {
  it("reports once the last touch is 2 minutes old", () => {
    expect(serverTouchDue(T0, T0, T0 + SERVER_TOUCH_INTERVAL_MS - 1)).toBe(false);
    expect(serverTouchDue(T0, T0, T0 + SERVER_TOUCH_INTERVAL_MS)).toBe(true);
  });

  it("after a failed touch, tries again 15 seconds later at the soonest, not at every key", () => {
    const failedAt = T0 + 3 * MINUTE;
    expect(serverTouchDue(T0, failedAt, failedAt + 1000)).toBe(false);
    expect(serverTouchDue(T0, failedAt, failedAt + SERVER_TOUCH_RETRY_MS)).toBe(true);
  });

  it("reports at the first activity of a tab that never touched", () => {
    expect(serverTouchDue(0, 0, T0)).toBe(true);
  });

  it("reports at once after the clock moved back, never waiting for it to catch up", () => {
    // An NTP correction on a PC that was an hour ahead: the last touch and
    // attempt now read as in the future. Held back, no touch would go out
    // while the browser keeps the person signed in — and the server would
    // close the session in use after 35 minutes.
    expect(serverTouchDue(T0, T0, T0 - 60 * MINUTE)).toBe(true);
    expect(serverTouchDue(T0, T0 - MINUTE, T0 - 30 * 1000)).toBe(true);
    // The retry throttle still holds when only the touch is in the future.
    expect(serverTouchDue(T0, T0 - 40 * 1000, T0 - 30 * 1000)).toBe(false);
  });
});

describe("shouldTouchServer — what IdleLogout sends at an activity", () => {
  it("« Rester connecté » always reaches the server, whatever the throttles", () => {
    // The warning keeps the session open in the browser: without this touch
    // the server's stamp would stay up to 3 minutes behind and close the
    // session about 5 minutes after the button, the page still open.
    expect(shouldTouchServer(true, T0, T0, T0 + 1000)).toBe(true);
    expect(shouldTouchServer(true, T0, T0 + 1000, T0 + 2000)).toBe(true);
  });

  it("any other activity follows serverTouchDue", () => {
    expect(shouldTouchServer(false, T0, T0, T0 + 1000)).toBe(false);
    expect(shouldTouchServer(false, T0, T0, T0 + SERVER_TOUCH_INTERVAL_MS)).toBe(true);
    expect(shouldTouchServer(false, T0, T0 + 3 * MINUTE, T0 + 3 * MINUTE + 1000)).toBe(false);
  });
});

describe("touchOutcome — what the answer to a touch means", () => {
  const session = { session: { id: "s-1" }, user: { id: "u-1", name: "Personne Test" } };

  it("a session: the server stamped it", () => {
    expect(touchOutcome({ data: session, error: null })).toBe("stamped");
  });

  it("no session: closed on the server meanwhile — the page leaves for /login", () => {
    expect(touchOutcome({ data: null, error: null })).toBe("signed-out");
    expect(touchOutcome({ data: undefined, error: null })).toBe("signed-out");
  });

  it("401: the row vanished under Better Auth's refresh — signed out too", () => {
    expect(touchOutcome({ data: null, error: { status: 401, statusText: "Unauthorized" } })).toBe("signed-out");
  });

  it("any other error leaves the session unknown: retried, never read as signed out", () => {
    for (const status of [0, 403, 429, 500, 502, 503, 504]) {
      expect(touchOutcome({ data: null, error: { status, statusText: "" } }), String(status)).toBe("retry");
    }
    expect(touchOutcome({ data: null, error: { message: "Failed to fetch" } })).toBe("retry");
  });
});

describe("the session cookie — what a page guard and the idle check read of it", () => {
  const token = `${SESSION_COOKIE_PREFIX}.session_token=abc.def%3D`;

  it("carriesSessionCookie: the plain name and the __Secure- one, with a value", () => {
    expect(carriesSessionCookie(token)).toBe(true);
    expect(carriesSessionCookie(`theme=clair; __Secure-${token}`)).toBe(true);
    expect(carriesSessionCookie(`theme=clair; ${token}; autre=1`)).toBe(true);
  });

  it("carriesSessionCookie: nothing for no header, an empty value, or another cookie", () => {
    for (const header of [null, undefined, "", "theme=clair", `${SESSION_COOKIE_PREFIX}.session_token=`, `x${token}`, `${SESSION_COOKIE_PREFIX}.dont_remember=1`]) {
      expect(carriesSessionCookie(header), String(header)).toBe(false);
    }
  });

  it("withoutCookie drops that cookie only, every occurrence, the others as written", () => {
    const name = `${SESSION_COOKIE_PREFIX}.session_token`;
    expect(withoutCookie(`a=1; ${token}; b=x=y`, name)).toBe("a=1; b=x=y");
    expect(withoutCookie(`${token};${token}`, name)).toBe("");
    expect(withoutCookie("a=1", name)).toBe("a=1");
    expect(withoutCookie(null, name)).toBe("");
  });
});

describe("auth-server.ts applies it", () => {
  const source = readSource("./auth-server.ts");

  it("stamps the session at most a minute behind a request (Better Auth's updateAge)", () => {
    expect(SESSION_ACTIVITY_UPDATE_AGE_S).toBe(60);
    expect(source).toMatch(/updateAge:\s*SESSION_ACTIVITY_UPDATE_AGE_S\b/);
  });

  it("keeps the seven days of the session itself: the préleveur's is never shortened", () => {
    expect(source).toMatch(/expiresIn:\s*60 \* 60 \* 24 \* 7\b/);
  });

  it("closes an idle session ahead of every auth endpoint, the guards' session read included", () => {
    expect(source).toMatch(/hooks:\s*\{[^}]*before:\s*closeIdleSessionHook\b/);
  });

  it("never turns the session refresh off: it is what writes the stamp", () => {
    expect(source).not.toMatch(/disableSessionRefresh|deferSessionRefresh|disableRefresh/);
  });

  it("never answers the session from a cookie cache, which a deleted session would outlive", () => {
    // Better Auth's cookieCache answers the session read from a signed
    // cookie, without the row: a session the idle bound deleted would read
    // as open until the cookie expires, and the stamp would stop moving.
    expect(source).not.toMatch(/cookieCache\s*:/);
  });

  it("names the session cookie with the prefix the page guards read (carriesSessionCookie)", () => {
    expect(source).toMatch(/cookiePrefix:\s*SESSION_COOKIE_PREFIX\b/);
  });
});

describe("the sign-in form never asks not to be remembered", () => {
  it("has no rememberMe: false — Better Auth never refreshes such a session", () => {
    // better-auth's get-session returns a « dont remember » session without
    // its refresh: `updatedAt` would freeze at the sign-in, and every person
    // at work would be closed 35 minutes after signing in. A shorter session
    // on a shared PC is the idle bound's job, not this cookie's.
    expect(readSource("../components/LoginForm.tsx")).not.toMatch(/rememberMe\s*:\s*false/);
  });
});

describe("IdleLogout.tsx reports to the server as these rules say", () => {
  const source = readSource("../components/layout/IdleLogout.tsx");

  it("passes « Rester connecté »'s force to shouldTouchServer and reads the answer with touchOutcome", () => {
    expect(source).toMatch(/shouldTouchServer\(force,/);
    expect(source).toMatch(/touchOutcome\(/);
  });

  it("reports at every page it opens, never assuming the page's request did", () => {
    expect(source).toMatch(/writeShared\(start\);[\s\S]{0,400}void touchServer\(\);/);
    expect(source).not.toMatch(/lastTouch\.current = start/);
  });

  it("abandons a touch after SERVER_TOUCH_TIMEOUT_MS and retries it by a timer", () => {
    expect(source).toMatch(/AbortSignal\.timeout\(SERVER_TOUCH_TIMEOUT_MS\)/);
    expect(source).toMatch(/setTimeout\([\s\S]{0,120}touch\(\)[\s\S]{0,40}SERVER_TOUCH_RETRY_MS\)/);
  });
});
