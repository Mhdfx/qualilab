import { describe, expect, it } from "vitest";
import {
  IDLE_LOGIN_HREF,
  IDLE_TIMEOUT_MS,
  IDLE_WARNING_MS,
  expiredOnArrival,
  formatIdleCountdown,
  idleState,
  idleTimeoutFor,
  loginNoticeFor,
  readLastActivity,
  shouldRecordActivity,
} from "./idle-policy";
import { ROLES } from "./roles";

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 10, 9, 0);

describe("idleTimeoutFor — who is signed out after inactivity", () => {
  it("signs out every laboratory role and the portal's clients after 30 minutes", () => {
    for (const role of ROLES.filter((r) => r !== "PRELEVEUR")) {
      expect(idleTimeoutFor(role), role).toBe(30 * MINUTE);
    }
    expect(IDLE_TIMEOUT_MS).toBe(30 * MINUTE);
  });

  it("never signs out the préleveur (a phone in the field)", () => {
    expect(idleTimeoutFor("PRELEVEUR")).toBeNull();
  });
});

describe("idleState — active, warning, expired", () => {
  it("stays active until two minutes before the limit", () => {
    expect(idleState(T0, T0, IDLE_TIMEOUT_MS)).toEqual({ phase: "ACTIVE", msLeft: 30 * MINUTE });
    expect(idleState(T0, T0 + 28 * MINUTE - 1, IDLE_TIMEOUT_MS).phase).toBe("ACTIVE");
  });

  it("warns during the last two minutes", () => {
    expect(IDLE_WARNING_MS).toBe(2 * MINUTE);
    expect(idleState(T0, T0 + 28 * MINUTE, IDLE_TIMEOUT_MS)).toEqual({ phase: "WARNING", msLeft: 2 * MINUTE });
    expect(idleState(T0, T0 + 30 * MINUTE - 1, IDLE_TIMEOUT_MS)).toEqual({ phase: "WARNING", msLeft: 1 });
  });

  it("expires at the limit and after it (a PC woken from sleep)", () => {
    expect(idleState(T0, T0 + 30 * MINUTE, IDLE_TIMEOUT_MS)).toEqual({ phase: "EXPIRED", msLeft: 0 });
    expect(idleState(T0, T0 + 5 * 60 * MINUTE, IDLE_TIMEOUT_MS).phase).toBe("EXPIRED");
  });

  it("restarts the count from the latest activity", () => {
    expect(idleState(T0 + 29 * MINUTE, T0 + 30 * MINUTE, IDLE_TIMEOUT_MS).phase).toBe("ACTIVE");
  });
});

describe("readLastActivity — the clock shared by the tabs", () => {
  it("reads a timestamp written by another tab", () => {
    expect(readLastActivity(String(T0), T0 + MINUTE)).toBe(T0);
  });

  it("ignores a missing or unreadable value", () => {
    expect(readLastActivity(null, T0)).toBeNull();
    expect(readLastActivity(undefined, T0)).toBeNull();
    expect(readLastActivity("", T0)).toBeNull();
    expect(readLastActivity("abc", T0)).toBeNull();
    expect(readLastActivity("-5", T0)).toBeNull();
    expect(readLastActivity("Infinity", T0)).toBeNull();
  });

  it("caps a value just ahead, and ignores one far in the future (it would never expire)", () => {
    expect(readLastActivity(String(T0 + 500), T0)).toBe(T0);
    expect(readLastActivity(String(T0 + 60 * MINUTE), T0)).toBeNull();
  });
});

describe("shouldRecordActivity — one write every few seconds", () => {
  it("throttles the writes for the other tabs", () => {
    expect(shouldRecordActivity(T0, T0 + 1000)).toBe(false);
    expect(shouldRecordActivity(T0, T0 + 5000)).toBe(true);
    expect(shouldRecordActivity(0, T0)).toBe(true);
  });
});

describe("expiredOnArrival — a page opened after the tab was closed without signing out", () => {
  it("closes the session when the last activity of any tab is older than the limit", () => {
    // Tab closed at T0 on a shared PC; the next person opens the application 2 h later.
    expect(expiredOnArrival(String(T0), T0 + 2 * 60 * MINUTE, IDLE_TIMEOUT_MS)).toBe(true);
    expect(expiredOnArrival(String(T0), T0 + 30 * MINUTE, IDLE_TIMEOUT_MS)).toBe(true);
  });

  it("keeps a session whose last activity is within the limit (a tab reopened soon after)", () => {
    expect(expiredOnArrival(String(T0), T0 + 20 * MINUTE, IDLE_TIMEOUT_MS)).toBe(false);
    expect(expiredOnArrival(String(T0), T0 + 30 * MINUTE - 1, IDLE_TIMEOUT_MS)).toBe(false);
  });

  it("never signs out on a missing, unreadable or far-future value (blocked storage, first visit)", () => {
    expect(expiredOnArrival(null, T0, IDLE_TIMEOUT_MS)).toBe(false);
    expect(expiredOnArrival(undefined, T0, IDLE_TIMEOUT_MS)).toBe(false);
    expect(expiredOnArrival("abc", T0, IDLE_TIMEOUT_MS)).toBe(false);
    expect(expiredOnArrival(String(T0 + 60 * MINUTE), T0, IDLE_TIMEOUT_MS)).toBe(false);
  });

  it("does not close a fresh session: the sign-in writes its own moment over a stale value", () => {
    // A previous user's value from the morning, overwritten by the sign-in at T0.
    expect(expiredOnArrival(String(T0), T0 + 1000, IDLE_TIMEOUT_MS)).toBe(false);
  });
});

describe("formatIdleCountdown", () => {
  it("shows minutes and seconds, rounded up", () => {
    expect(formatIdleCountdown(2 * MINUTE)).toBe("2:00");
    expect(formatIdleCountdown(105_000)).toBe("1:45");
    expect(formatIdleCountdown(1)).toBe("0:01");
    expect(formatIdleCountdown(0)).toBe("0:00");
    expect(formatIdleCountdown(-10)).toBe("0:00");
  });
});

describe("the sign-in page after an automatic sign-out", () => {
  it("links to the sign-in page with the motif, and explains it there", () => {
    expect(IDLE_LOGIN_HREF).toBe("/login?motif=inactivite");
    expect(loginNoticeFor("inactivite")).toBe("Session fermée après inactivité.");
  });

  it("says nothing for no motif or an unknown one", () => {
    expect(loginNoticeFor(undefined)).toBeNull();
    expect(loginNoticeFor("autre")).toBeNull();
    expect(loginNoticeFor(["inactivite"])).toBeNull();
  });
});
