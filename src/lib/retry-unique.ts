/**
 * Retries a write whose only likely failure is a unique-constraint clash —
 * or, when the caller names `CONTENTION_CODES`, a busy database.
 *
 * The sequential numbers are drawn from the locked `Counter` rows (counters.ts)
 * and no longer race; the database's unique constraint stays the last guard,
 * and this turns a clash on it — the same sample's report issued twice at once
 * (`createReportFor`) — into a second attempt rather than an error the user sees.
 */
export async function retryOnDuplicate<T>(
  attempt: () => Promise<T>,
  tries = 3,
  codes: readonly string[] = ["P2002"]
): Promise<T> {
  let last: unknown;

  for (let i = 0; i < tries; i += 1) {
    try {
      return await attempt();
    } catch (error) {
      const code = retryCode(error);
      if (!code || !codes.includes(code)) throw error;
      last = error;
      // A busy database rather than a clash: a short, growing and jittered
      // pause, so the attempts that met in the queue do not meet again.
      if (code !== "P2002" && i + 1 < tries) await contentionPause(i + 1);
    }
  }

  throw last;
}

/**
 * Prisma's codes for a transaction that met a busy database, not a wrong
 * write: P2028 — it could not start within `maxWait` (every pooled connection
 * taken) or ran past its `timeout`, and was rolled back; P2034 — a write
 * conflict or a deadlock of a model query, rolled back. A raw statement's
 * deadlock or lock-wait timeout — the counter's own `INSERT … ON DUPLICATE
 * KEY` / `SELECT … FOR UPDATE` / `UPDATE` (counters.ts) — Prisma reports as
 * P2010 instead, and `retryCode` reads it as P2034. Safe to run again from
 * the start.
 */
export const CONTENTION_CODES = ["P2028", "P2034"] as const;

/**
 * MySQL's errnos for a raw statement that lost a lock race: 1213 — chosen
 * as a deadlock's victim (the transaction rolled back), 1205 — waited too
 * long for a row lock (the statement rolled back; Prisma then rolls back the
 * interactive transaction it ran in).
 */
const RAW_CONTENTION_ERRNOS = ["1213", "1205"];

/**
 * The code `retryOnDuplicate` matches: the error's own, except a raw
 * statement's lock race — every `$executeRaw` / `$queryRaw` failure is P2010,
 * the errno in its meta (`driverAdapterError.cause.originalCode` with the
 * MariaDB adapter; `meta.code` in the shape `isLockConflict` also reads) —
 * which counts as P2034. Seen on the local MySQL: a deadlock and a lock-wait
 * timeout on the counter both came back as P2010, and were never retried.
 */
export function retryCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const { code, meta } = error as {
    code?: unknown;
    meta?: { code?: unknown; driverAdapterError?: { cause?: { originalCode?: unknown } } };
  };
  if (typeof code !== "string") return undefined;
  if (code === "P2010") {
    const errno = String(meta?.driverAdapterError?.cause?.originalCode ?? meta?.code ?? "");
    if (RAW_CONTENTION_ERRNOS.includes(errno)) return "P2034";
  }
  return code;
}

/** The pause (ms) before the `attempt`-th rerun after contention. */
export function contentionPauseMs(attempt: number, random: () => number = Math.random): number {
  return 40 * attempt + Math.floor(random() * 80);
}

function contentionPause(attempt: number) {
  return new Promise((resolve) => setTimeout(resolve, contentionPauseMs(attempt)));
}
