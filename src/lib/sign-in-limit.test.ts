import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./attempt-limiter";
import {
  NO_TRUSTED_ADDRESS,
  SIGN_IN_ACCOUNT_MAX_FAILURES,
  SIGN_IN_ADDRESS_MAX,
  SIGN_IN_ADDRESS_WINDOW_MS,
  SIGN_IN_LIMITER_SWEEP_EVERY_MS,
  SIGN_IN_MAX_FAILURES,
  SIGN_IN_WINDOW_MS,
  signInAddressKey,
  signInAddressLimitedMessage,
  signInAttemptOutcome,
  signInLimiterKey,
  signInLimiters,
  signInLockedMessage,
  signInPairKey,
} from "./sign-in-limit";

const MINUTE = 60_000;

describe("the sign-in limits for a laboratory behind one NAT address", () => {
  it("lets 30 sign-in requests per sliding minute through per address", () => {
    expect(SIGN_IN_ADDRESS_MAX).toBe(30);
    expect(SIGN_IN_ADDRESS_WINDOW_MS).toBe(MINUTE);
  });

  it("refuses an account from one address after 10 wrong passwords in 15 minutes, from every address after 100", () => {
    expect(SIGN_IN_MAX_FAILURES).toBe(10);
    expect(SIGN_IN_ACCOUNT_MAX_FAILURES).toBe(100);
    expect(SIGN_IN_WINDOW_MS).toBe(15 * MINUTE);
    expect(signInLimiters.address).toBeInstanceOf(AttemptLimiter);
    expect(signInLimiters.pair).toBeInstanceOf(AttemptLimiter);
    expect(signInLimiters.account).toBeInstanceOf(AttemptLimiter);
  });

  it("the global cap is out of reach of one address, the per-address budget too", () => {
    // Locking an account for everyone takes ten addresses each at its own limit.
    expect(SIGN_IN_ACCOUNT_MAX_FAILURES / SIGN_IN_MAX_FAILURES).toBeGreaterThanOrEqual(10);
    // One address cannot even reach its own limit on more than 45 accounts in 15 minutes.
    expect(SIGN_IN_ADDRESS_MAX * (SIGN_IN_WINDOW_MS / SIGN_IN_ADDRESS_WINDOW_MS)).toBe(450);
  });

  it("sweeps expired entries at most once a minute", () => {
    expect(SIGN_IN_LIMITER_SWEEP_EVERY_MS).toBe(MINUTE);
  });

  it("survives a re-import (one set of counters per process)", async () => {
    const again = await import("./sign-in-limit");
    expect(again.signInLimiters).toBe(signInLimiters);
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

describe("the counter keys", () => {
  it("an address, or one shared bucket when none can be trusted (Better Auth's own fallback)", () => {
    expect(signInAddressKey("203.0.113.7")).toBe("203.0.113.7");
    expect(signInAddressKey(null)).toBe(NO_TRUSTED_ADDRESS);
  });

  it("an account from an address: two addresses, two counters", () => {
    expect(signInPairKey("203.0.113.7", "tech1")).toBe("203.0.113.7|tech1");
    expect(signInPairKey("198.51.100.1", "tech1")).not.toBe(signInPairKey("203.0.113.7", "tech1"));
    expect(signInPairKey(null, "tech1")).toBe(`${NO_TRUSTED_ADDRESS}|tech1`);
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

describe("signInAddressLimitedMessage", () => {
  it("says it is the network, the wait in seconds (the form's own words)", () => {
    expect(signInAddressLimitedMessage(42_100)).toBe(
      "Trop de tentatives de connexion depuis ce réseau. Réessayez dans 43 secondes."
    );
    expect(signInAddressLimitedMessage(1)).toBe(
      "Trop de tentatives de connexion depuis ce réseau. Réessayez dans 1 seconde."
    );
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
