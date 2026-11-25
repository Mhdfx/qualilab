import { describe, expect, it } from "vitest";
import {
  AttemptLimiter,
  PASSWORD_CHANGE_MAX_FAILURES,
  PASSWORD_CHANGE_WINDOW_MS,
  passwordChangeLimiter,
  retryAfterSeconds,
  tooManyAttemptsMessage,
} from "./attempt-limiter";

const MINUTE = 60_000;
const T0 = Date.UTC(2026, 9, 10, 9, 0);

function limiter() {
  return new AttemptLimiter({ maxFailures: 5, windowMs: 15 * MINUTE });
}

/** Opens and fails one attempt; returns the outcome of `begin`. */
function fail(target: AttemptLimiter, key: string, now: number) {
  const started = target.begin(key, now);
  if (started.ok) target.settle(key, started.attempt, "FAILED");
  return started;
}

describe("AttemptLimiter — 5 wrong passwords per 15 minutes, per account", () => {
  it("lets five wrong passwords through and refuses the sixth", () => {
    const counter = limiter();
    for (let i = 0; i < 5; i += 1) {
      expect(fail(counter, "user-a", T0 + i * MINUTE).ok, `essai ${i + 1}`).toBe(true);
    }
    const sixth = counter.begin("user-a", T0 + 5 * MINUTE);
    expect(sixth.ok).toBe(false);
    // The oldest failure (T0) leaves the window at T0 + 15 min: 10 minutes to wait.
    if (!sixth.ok) expect(sixth.retryAfterMs).toBe(10 * MINUTE);
  });

  it("counts per account, never across accounts (the lab shares one IP)", () => {
    const counter = limiter();
    for (let i = 0; i < 5; i += 1) fail(counter, "user-a", T0);
    expect(counter.begin("user-a", T0).ok).toBe(false);
    expect(counter.begin("user-b", T0).ok).toBe(true);
  });

  it("opens again once the oldest failures leave the window", () => {
    const counter = limiter();
    for (let i = 0; i < 5; i += 1) fail(counter, "user-a", T0 + i * MINUTE);
    expect(counter.begin("user-a", T0 + 15 * MINUTE - 1).ok).toBe(false);
    expect(counter.begin("user-a", T0 + 15 * MINUTE).ok).toBe(true);
  });

  it("forgets every failure on a successful change", () => {
    const counter = limiter();
    for (let i = 0; i < 4; i += 1) fail(counter, "user-a", T0);
    const started = counter.begin("user-a", T0 + MINUTE);
    expect(started.ok).toBe(true);
    if (started.ok) counter.settle("user-a", started.attempt, "SUCCEEDED");
    expect(counter.size).toBe(0);
    for (let i = 0; i < 5; i += 1) expect(fail(counter, "user-a", T0 + 2 * MINUTE).ok).toBe(true);
  });

  it("does not count an attempt refused for another reason (too short, session expired)", () => {
    const counter = limiter();
    for (let i = 0; i < 10; i += 1) {
      const started = counter.begin("user-a", T0);
      expect(started.ok).toBe(true);
      if (started.ok) counter.settle("user-a", started.attempt, "NEUTRAL");
    }
    expect(counter.size).toBe(0);
  });

  it("counts attempts still in flight, so parallel requests cannot pass the limit", () => {
    const counter = limiter();
    const inFlight = Array.from({ length: 5 }, () => counter.begin("user-a", T0));
    expect(inFlight.every((started) => started.ok)).toBe(true);
    expect(counter.begin("user-a", T0).ok).toBe(false);
  });

  it("removes only the attempt it settles", () => {
    const counter = limiter();
    fail(counter, "user-a", T0);
    const second = counter.begin("user-a", T0);
    if (second.ok) counter.settle("user-a", second.attempt, "NEUTRAL");
    for (let i = 0; i < 4; i += 1) expect(fail(counter, "user-a", T0).ok).toBe(true);
    expect(counter.begin("user-a", T0).ok).toBe(false);
  });

  it("drops an account whose failures all expired", () => {
    const counter = limiter();
    fail(counter, "user-a", T0);
    expect(counter.size).toBe(1);
    const later = counter.begin("user-a", T0 + 20 * MINUTE);
    expect(later.ok).toBe(true);
    if (later.ok) counter.settle("user-a", later.attempt, "NEUTRAL");
    expect(counter.size).toBe(0);
  });
});

describe("the shared password-change counter", () => {
  it("uses the agreed limits and survives a re-import", async () => {
    expect(PASSWORD_CHANGE_MAX_FAILURES).toBe(5);
    expect(PASSWORD_CHANGE_WINDOW_MS).toBe(15 * MINUTE);
    const again = await import("./attempt-limiter");
    expect(again.passwordChangeLimiter).toBe(passwordChangeLimiter);
  });
});

describe("tooManyAttemptsMessage / retryAfterSeconds", () => {
  it("rounds the wait up to whole minutes, in French", () => {
    expect(tooManyAttemptsMessage(10 * MINUTE)).toBe("Trop de tentatives, réessayez dans 10 minutes.");
    expect(tooManyAttemptsMessage(9 * MINUTE + 1)).toBe("Trop de tentatives, réessayez dans 10 minutes.");
    expect(tooManyAttemptsMessage(30_000)).toBe("Trop de tentatives, réessayez dans 1 minute.");
    expect(tooManyAttemptsMessage(0)).toBe("Trop de tentatives, réessayez dans 1 minute.");
  });
  it("gives Retry-After in whole seconds", () => {
    expect(retryAfterSeconds(10 * MINUTE)).toBe("600");
    expect(retryAfterSeconds(1)).toBe("1");
  });
});

describe("AttemptLimiter.sweep — a counter keyed by whatever username a request sends", () => {
  it("drops the keys whose attempts have all left the window, keeps the others", () => {
    const counter = limiter();
    fail(counter, "old-a", T0);
    fail(counter, "old-b", T0 + MINUTE);
    fail(counter, "recent", T0 + 10 * MINUTE);
    expect(counter.size).toBe(3);
    counter.sweep(T0 + 16 * MINUTE);
    expect(counter.size).toBe(1);
    // The recent one still counts.
    for (let i = 0; i < 4; i += 1) fail(counter, "recent", T0 + 16 * MINUTE);
    expect(counter.begin("recent", T0 + 16 * MINUTE).ok).toBe(false);
  });
});

describe("AttemptLimiter.sweepIfDue — the sweep runs at most once per interval", () => {
  it("sweeps the first time, then not again before the interval has passed", () => {
    const counter = limiter();
    fail(counter, "old", T0);
    expect(counter.sweepIfDue(T0, MINUTE)).toBe(true);
    expect(counter.size).toBe(1);
    // Past the window but inside the interval: nothing is scanned.
    fail(counter, "other", T0 + 30_000);
    expect(counter.sweepIfDue(T0 + 59_999, MINUTE)).toBe(false);
    expect(counter.size).toBe(2);
    // The interval has passed: expired keys go, live ones stay.
    expect(counter.sweepIfDue(T0 + 15 * MINUTE + 1, MINUTE)).toBe(true);
    expect(counter.size).toBe(1);
    expect(counter.sweepIfDue(T0 + 15 * MINUTE + 2, MINUTE)).toBe(false);
  });

  it("never drops a live key: a flood of other keys cannot reset an account's count", () => {
    const counter = limiter();
    for (let i = 0; i < 5; i += 1) fail(counter, "victim", T0);
    for (let i = 0; i < 10_000; i += 1) fail(counter, `flood-${i}`, T0 + 1000);
    expect(counter.sweepIfDue(T0 + 2 * MINUTE, MINUTE)).toBe(true);
    expect(counter.size).toBe(10_001);
    expect(counter.begin("victim", T0 + 2 * MINUTE).ok).toBe(false);
  });
});
