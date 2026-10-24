import { afterEach, describe, expect, it, vi } from "vitest";
import { CONTENTION_CODES, contentionPauseMs, retryCode, retryOnDuplicate } from "./retry-unique";

/**
 * The retry around a report's issue (HANDOFF §9, lot 2D item 5): a unique
 * clash, and — for the issue only — a busy database (P2028 / P2034, and a
 * raw statement's deadlock / lock-wait timeout, P2010 with 1213 / 1205), run
 * again; anything else is the caller's error at once.
 */

const failing = (code?: string) => Object.assign(new Error(code ?? "autre"), code ? { code } : {});

/** A raw statement's failure as Prisma 7 + the MariaDB adapter report it (seen on the local MySQL). */
const rawFailing = (errno: string) =>
  Object.assign(new Error("Raw query failed"), {
    code: "P2010",
    meta: { driverAdapterError: { cause: { originalCode: errno } } },
  });

afterEach(() => {
  vi.useRealTimers();
});

describe("retryOnDuplicate", () => {
  it("runs a unique clash again, and gives up after the tries", async () => {
    const attempt = vi.fn().mockRejectedValueOnce(failing("P2002")).mockResolvedValueOnce("ok");
    expect(await retryOnDuplicate(attempt)).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(2);

    const always = vi.fn().mockRejectedValue(failing("P2002"));
    await expect(retryOnDuplicate(always, 3)).rejects.toMatchObject({ code: "P2002" });
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("does not run again what is not a clash, by default not even a busy database", async () => {
    for (const error of [failing(), failing("P2025"), failing("P2028")]) {
      const attempt = vi.fn().mockRejectedValue(error);
      await expect(retryOnDuplicate(attempt, 5)).rejects.toBe(error);
      expect(attempt).toHaveBeenCalledTimes(1);
    }
  });

  it("runs a busy database again when the caller names its codes, after a pause", async () => {
    vi.useFakeTimers();
    const attempt = vi
      .fn()
      .mockRejectedValueOnce(failing("P2028"))
      .mockRejectedValueOnce(failing("P2034"))
      .mockRejectedValueOnce(failing("P2002"))
      .mockResolvedValueOnce("ok");
    const run = retryOnDuplicate(attempt, 10, ["P2002", ...CONTENTION_CODES]);
    await vi.runAllTimersAsync();
    expect(await run).toBe("ok");
    expect(attempt).toHaveBeenCalledTimes(4);
  });

  it("runs a raw deadlock or lock-wait timeout again as a busy database, only when the caller names it", async () => {
    vi.useFakeTimers();
    for (const errno of ["1213", "1205"]) {
      const attempt = vi.fn().mockRejectedValueOnce(rawFailing(errno)).mockResolvedValueOnce("ok");
      const run = retryOnDuplicate(attempt, 3, ["P2002", ...CONTENTION_CODES]);
      await vi.runAllTimersAsync();
      expect(await run).toBe("ok");
      expect(attempt).toHaveBeenCalledTimes(2);

      const byDefault = vi.fn().mockRejectedValue(rawFailing(errno));
      await expect(retryOnDuplicate(byDefault, 3)).rejects.toMatchObject({ code: "P2010" });
      expect(byDefault).toHaveBeenCalledTimes(1);
    }
  });

  it("never runs again another raw failure (a syntax error, a unique clash of a raw insert)", async () => {
    for (const errno of ["1064", "1062"]) {
      const error = rawFailing(errno);
      const attempt = vi.fn().mockRejectedValue(error);
      await expect(retryOnDuplicate(attempt, 5, ["P2002", ...CONTENTION_CODES])).rejects.toBe(error);
      expect(attempt).toHaveBeenCalledTimes(1);
    }
  });

  it("reads the raw errno from either layout, and gives up with the original error", async () => {
    expect(retryCode(rawFailing("1213"))).toBe("P2034");
    expect(retryCode({ code: "P2010", meta: { code: 1205 } })).toBe("P2034");
    expect(retryCode({ code: "P2010", meta: { code: "1064" } })).toBe("P2010");
    expect(retryCode({ code: "P2010" })).toBe("P2010");
    expect(retryCode(failing("P2028"))).toBe("P2028");
    expect(retryCode(new Error("x"))).toBeUndefined();
    expect(retryCode(null)).toBeUndefined();

    vi.useFakeTimers();
    const error = rawFailing("1213");
    const always = vi.fn().mockRejectedValue(error);
    const run = retryOnDuplicate(always, 3, ["P2002", ...CONTENTION_CODES]);
    const settled = expect(run).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await settled;
    expect(always).toHaveBeenCalledTimes(3);
  });

  it("pauses longer each round, with a jitter so attempts that met part ways", () => {
    expect(contentionPauseMs(1, () => 0)).toBe(40);
    expect(contentionPauseMs(3, () => 0)).toBe(120);
    expect(contentionPauseMs(1, () => 0.99)).toBe(119);
  });
});
