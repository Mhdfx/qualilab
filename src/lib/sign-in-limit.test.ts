import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./attempt-limiter";
import {
  SIGN_IN_IP_RULE,
  SIGN_IN_MAX_FAILURES,
  SIGN_IN_WINDOW_MS,
  signInAttemptOutcome,
  signInLimiter,
  signInLimiterKey,
  signInLockedMessage,
} from "./sign-in-limit";

const MINUTE = 60_000;

describe("the sign-in limits for a laboratory behind one NAT address", () => {
  it("lets 10 sign-ins per 10 s through per address (Better Auth's own: 3)", () => {
    expect(SIGN_IN_IP_RULE).toEqual({ window: 10, max: 10 });
  });

  it("refuses an account after 10 wrong passwords in 15 minutes", () => {
    expect(SIGN_IN_MAX_FAILURES).toBe(10);
    expect(SIGN_IN_WINDOW_MS).toBe(15 * MINUTE);
    expect(signInLimiter).toBeInstanceOf(AttemptLimiter);
  });
});

describe("signInLimiterKey — the username as Better Auth looks it up", () => {
  it("is trimmed and lower-cased: one account, one counter", () => {
    expect(signInLimiterKey("tech1")).toBe("tech1");
    expect(signInLimiterKey("  Tech1 ")).toBe("tech1");
    expect(signInLimiterKey("TECH1")).toBe("tech1");
    expect(signInLimiterKey("j.dupont-2_b")).toBe("j.dupont-2_b");
  });

  it("is null for a body the endpoint refuses by itself (not a password guess)", () => {
    expect(signInLimiterKey(undefined)).toBeNull();
    expect(signInLimiterKey(42)).toBeNull();
    expect(signInLimiterKey("")).toBeNull();
    expect(signInLimiterKey("ab")).toBeNull();
    expect(signInLimiterKey("a".repeat(31))).toBeNull();
    expect(signInLimiterKey("tech 1")).toBeNull();
    expect(signInLimiterKey("tech1@qualilab.local")).toBeNull();
  });
});

describe("signInAttemptOutcome", () => {
  it("counts a wrong username or password", () => {
    expect(signInAttemptOutcome({ kind: "error", statusCode: 401, code: "INVALID_USERNAME_OR_PASSWORD" })).toBe("FAILED");
    expect(signInAttemptOutcome({ kind: "error", statusCode: 401 })).toBe("FAILED");
  });

  it("clears the count on a sign-in", () => {
    expect(signInAttemptOutcome({ kind: "success" })).toBe("SUCCEEDED");
  });

  it("forgets a disabled account (right password), a malformed request, a server error", () => {
    expect(signInAttemptOutcome({ kind: "error", statusCode: 403, code: "BANNED_USER" })).toBe("NEUTRAL");
    expect(signInAttemptOutcome({ kind: "error", statusCode: 422, code: "USERNAME_TOO_SHORT" })).toBe("NEUTRAL");
    expect(signInAttemptOutcome({ kind: "error", statusCode: 500 })).toBe("NEUTRAL");
    expect(signInAttemptOutcome({ kind: "other" })).toBe("NEUTRAL");
  });
});

describe("signInLockedMessage", () => {
  it("says the wait in minutes, rounded up, never « 0 minute »", () => {
    expect(signInLockedMessage(14 * MINUTE + 1)).toBe(
      "Trop de mots de passe erronés pour ce compte. Réessayez dans 15 minutes."
    );
    expect(signInLockedMessage(1)).toBe("Trop de mots de passe erronés pour ce compte. Réessayez dans 1 minute.");
  });
});
