import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * HANDOFF §9, lot 2D item 5 — simultaneous approvals against a real MySQL:
 * the row lock of the RAPPORT counter is what this proves, and only a real
 * database holds one.
 *
 * The LOCAL database only (`.env.local`, or QUALILAB_LOCAL_DATABASE_URL),
 * never production: skipped unless its host is this machine and its name a
 * local one (« qualilab_local »), or when it does not answer. Its own records — a « TEST UI V19 » série of the « TEST
 * UI » client, under this run's tag — and its own six years, drawn at
 * random past 2100 and free of any counter row: another session's approvals
 * of 2026, and another run of this file at the same time (several sessions
 * share this database), never interleave with it. Only this run's records
 * and counter rows are deleted at the end.
 */

vi.mock("server-only", () => ({}));

const TEST_CLIENT_NAME = "TEST UI 2026-10-06 Traiteur";
const TAG_PREFIX = "TEST-UI-V19-RAP-";

function localDatabaseUrl(): string | null {
  let url = process.env.QUALILAB_LOCAL_DATABASE_URL ?? null;
  if (!url) {
    try {
      url = /^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m.exec(readFileSync(".env.local", "utf8"))?.[1] ?? null;
    } catch {
      return null;
    }
  }
  if (!url) return null;
  // This machine AND a database named as a local one (« qualilab_local »):
  // a tunnel to the server on 127.0.0.1 would pass the host test alone.
  const { hostname, pathname } = new URL(url);
  return ["127.0.0.1", "localhost", "[::1]"].includes(hostname) && /_(local|test)$/.test(pathname) ? url : null;
}

async function connect() {
  const url = localDatabaseUrl();
  if (!url) return null;
  process.env.DATABASE_URL = url;
  const { prisma } = await import("./prisma");
  const answered = await Promise.race([
    prisma.$queryRaw`SELECT 1`.then(() => true, () => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000)),
  ]);
  return answered ? prisma : null;
}

const prisma = await connect();

// Real round trips, and the report module's first load: far above 5 s.
describe.skipIf(!prisma)("report numbers under simultaneous approvals (local database)", { timeout: 60_000 }, () => {
  const db = prisma!;
  const tag = `${TAG_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  let fixture: { clientId: string; userId: string; natureId: string; serieId: string };
  let line = 0;
  /** This run's years: the approvals (MAIN), a new year (NEXT), the rollbacks, the burst, the deadlock's two rows. */
  let base = 0;
  const MAIN = () => base + 2;
  const NEXT = () => base + 1;
  const ROLLBACK = () => base;
  const BURST = () => base + 3;
  const DEADLOCK_A = () => base + 4;
  const DEADLOCK_B = () => base + 5;
  const years = () => [ROLLBACK(), NEXT(), MAIN(), BURST(), DEADLOCK_A(), DEADLOCK_B()];

  /** A sample approved on `approvedAt`, with no report yet. */
  async function approvedSample(approvedAt: Date) {
    line += 1;
    const sample = await db.sample.create({
      data: {
        code: `${tag}-${line}`,
        clientId: fixture.clientId,
        userId: fixture.userId,
        serieId: fixture.serieId,
        lineNumber: line,
        natureId: fixture.natureId,
        lieu: "TEST UI V19 — compteur des rapports",
        produit: "TEST UI V19",
        type: "ALIMENTAIRE",
        status: "VALIDE",
        validatedById: fixture.userId,
        validatedAt: approvedAt,
        approvedById: fixture.userId,
        approvedAt,
      },
      select: { id: true },
    });
    return sample.id;
  }

  const counterLast = async (year: number) =>
    (await db.counter.findUnique({ where: { kind_year: { kind: "RAPPORT", year } } }))?.last ?? null;

  const sequenceOf = (number: string) => Number(number.slice("RAP-AAAA-".length));

  async function cleanUp() {
    // The reports and their versions cascade with the samples.
    await db.sample.deleteMany({ where: { code: { startsWith: tag } } });
    await db.serie.deleteMany({ where: { serialNumber: tag } });
    if (base) await db.counter.deleteMany({ where: { kind: "RAPPORT", year: { in: years() } } });
  }

  /** Six consecutive years past 2100 that no counter row uses yet. */
  async function freeYears() {
    for (;;) {
      base = 2100 + Math.floor(Math.random() * 700);
      if ((await db.counter.count({ where: { kind: "RAPPORT", year: { in: years() } } })) === 0) return;
    }
  }

  beforeAll(async () => {
    const client = await db.client.findFirst({ where: { name: TEST_CLIENT_NAME }, select: { id: true } });
    const user = await db.user.findFirst({ where: { email: { startsWith: "valid1@" } }, select: { id: true } });
    const nature = await db.analysisNature.findFirst({ where: { family: "MICRO" }, select: { id: true } });
    if (!client || !user || !nature) throw new Error("Données de démonstration locales absentes (client TEST UI, valid1, nature).");
    // A run interrupted over an hour ago left its records (a run lasts a
    // minute): gone. Another run's, younger, are left alone.
    const stale = { lt: new Date(Date.now() - 3_600_000) };
    await db.sample.deleteMany({ where: { code: { startsWith: TAG_PREFIX }, createdAt: stale } });
    await db.serie.deleteMany({ where: { serialNumber: { startsWith: TAG_PREFIX }, createdAt: stale } });
    await freeYears();
    const serie = await db.serie.create({
      data: {
        kind: "DEPOT",
        serialNumber: tag,
        year: MAIN(),
        clientId: client.id,
        startedAt: new Date(MAIN(), 5, 15, 9),
        createdById: user.id,
        notes: "TEST UI V19 — compteur des rapports (test automatique, supprimé à la fin)",
      },
      select: { id: true },
    });
    fixture = { clientId: client.id, userId: user.id, natureId: nature.id, serieId: serie.id };
    await import("./report-dispatch");
  }, 60_000);

  afterAll(async () => {
    if (fixture) await cleanUp();
    await db.$disconnect();
  }, 60_000);

  it("starts the year's counter at the highest report already issued", async () => {
    const { createReportFor } = await import("./report-dispatch");
    // A report issued before the counter existed (production: RAP-2026-00009).
    const before = await approvedSample(new Date(MAIN(), 5, 15, 10));
    await db.report.create({ data: { sampleId: before, number: `RAP-${MAIN()}-00041` } });
    expect(await counterLast(MAIN())).toBeNull();

    const report = await createReportFor(await approvedSample(new Date(MAIN(), 5, 15, 10, 5)));
    expect(report?.number).toBe(`RAP-${MAIN()}-00042`);
    expect(await counterLast(MAIN())).toBe(42);
  });

  it("gives simultaneous approvals distinct consecutive numbers", async () => {
    const { createReportFor } = await import("./report-dispatch");
    const ids: string[] = [];
    for (let i = 0; i < 10; i += 1) ids.push(await approvedSample(new Date(MAIN(), 5, 15, 11, i)));

    const transactions = vi.spyOn(db, "$transaction");
    const reports = await Promise.all(ids.map((id) => createReportFor(id)));
    // One transaction each: they queued on the counter, none clashed and retried.
    expect(transactions).toHaveBeenCalledTimes(10);
    transactions.mockRestore();
    expect(reports.every(Boolean)).toBe(true);
    const sequences = reports.map((r) => sequenceOf(r!.number)).sort((a, b) => a - b);
    expect(sequences).toEqual([43, 44, 45, 46, 47, 48, 49, 50, 51, 52]);
    expect(await counterLast(MAIN())).toBe(52);

    // Each version 0 froze the number of its record.
    const stored = await db.report.findMany({
      where: { sampleId: { in: ids } },
      select: { number: true, versions: { select: { version: true, number: true } } },
    });
    expect(stored).toHaveLength(10);
    for (const report of stored) expect(report.versions).toEqual([{ version: 0, number: report.number }]);
  });

  it("issues one report when the same sample is approved twice at once, and burns no number", async () => {
    const { createReportFor } = await import("./report-dispatch");
    const twice = await approvedSample(new Date(MAIN(), 5, 15, 12));
    const [first, second] = await Promise.all([createReportFor(twice), createReportFor(twice)]);
    expect(first?.number).toBe(`RAP-${MAIN()}-00053`);
    expect(second).toEqual(first);
    expect(await db.report.count({ where: { sampleId: twice } })).toBe(1);

    const next = await createReportFor(await approvedSample(new Date(MAIN(), 5, 15, 12, 5)));
    expect(next?.number).toBe(`RAP-${MAIN()}-00054`);
  });

  it("never burns a number on an issue that rolls back", async () => {
    const { drawReportNumber, ensureReportCounter } = await import("./report-number");
    const at = new Date(ROLLBACK(), 2, 1, 9);
    // As `createReportFor` does: the year's row exists before the issues lock it.
    await ensureReportCounter(db, at);
    expect(await counterLast(ROLLBACK())).toBe(0);
    const outcomes = await Promise.allSettled(
      Array.from({ length: 9 }, (_, i) =>
        db.$transaction(async (tx) => {
          const number = await drawReportNumber(tx, at);
          // Every third issue fails after its draw: the rollback releases the number.
          if (i % 3 === 2) throw new Error("échec simulé");
          return number;
        })
      )
    );
    const issued = outcomes.flatMap((o) => (o.status === "fulfilled" ? [sequenceOf(o.value)] : []));
    expect(outcomes.filter((o) => o.status === "rejected")).toHaveLength(3);
    expect(issued.sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(await counterLast(ROLLBACK())).toBe(6);
  });

  it("leaves no sample report-less under a burst of 60 approvals at once", async () => {
    // Every issue queues on the one counter row through a pool of five
    // connections: with Prisma's default 2 s to start, 14 of 30 had failed
    // (P2028) on a loaded machine and stayed approved without a report —
    // 60 is the burst that fails that way on an idle one too.
    const { createReportFor } = await import("./report-dispatch");
    const ids: string[] = [];
    for (let i = 0; i < 60; i += 1) ids.push(await approvedSample(new Date(BURST(), 3, 1, 9, i)));

    const reports = await Promise.all(ids.map((id) => createReportFor(id)));
    expect(reports.filter((r) => !r)).toHaveLength(0);
    const sequences = reports.map((r) => sequenceOf(r!.number)).sort((a, b) => a - b);
    expect(sequences).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    expect(await counterLast(BURST())).toBe(60);
    expect(await db.report.count({ where: { sampleId: { in: ids } } })).toBe(60);
  });

  it("reads a deadlock of the counter's own statements as a busy database, and runs it again", async () => {
    // The counter is locked only by raw statements, and Prisma reports their
    // deadlock as P2010 (MySQL 1213), not P2034: unread, the issue's retry
    // never ran for them. Two draws that lock two rows in opposite orders
    // deadlock for real; the victim, rolled back, runs again and both commit.
    const { nextNumber, setCounter } = await import("./counters");
    const { CONTENTION_CODES, retryCode, retryOnDuplicate } = await import("./retry-unique");
    // As `ensureReportCounter` guarantees: the rows exist before they are locked.
    for (const year of [DEADLOCK_A(), DEADLOCK_B()]) await setCounter(db, "RAPPORT", year, 0);

    // Each holds its first row before either asks for its second: the cycle is certain.
    let holding = 0;
    let bothHold!: () => void;
    const met = new Promise<void>((resolve) => (bothHold = resolve));
    const failures: unknown[] = [];
    const drawBoth = (first: number, second: number) =>
      retryOnDuplicate(
        async () => {
          try {
            return await db.$transaction(async (tx) => {
              const a = await nextNumber(tx, "RAPPORT", first);
              if (++holding === 2) bothHold();
              await Promise.race([met, new Promise((resolve) => setTimeout(resolve, 3000))]);
              const b = await nextNumber(tx, "RAPPORT", second);
              return { [first]: a.sequence, [second]: b.sequence };
            });
          } catch (error) {
            failures.push(error);
            throw error;
          }
        },
        5,
        ["P2002", ...CONTENTION_CODES]
      );

    const drawn = await Promise.all([drawBoth(DEADLOCK_A(), DEADLOCK_B()), drawBoth(DEADLOCK_B(), DEADLOCK_A())]);
    expect(failures.length).toBeGreaterThanOrEqual(1);
    for (const error of failures) {
      expect(error).toMatchObject({ code: "P2010" });
      expect(retryCode(error)).toBe("P2034");
    }
    // The victim's draws rolled back: each row drawn once by each, 1 then 2.
    for (const year of [DEADLOCK_A(), DEADLOCK_B()]) {
      expect(drawn.map((d) => d[year]).sort()).toEqual([1, 2]);
      expect(await counterLast(year)).toBe(2);
    }
  });

  it("starts each new year at 00001", async () => {
    const { createReportFor } = await import("./report-dispatch");
    const report = await createReportFor(await approvedSample(new Date(NEXT(), 0, 1, 0, 5)));
    expect(report?.number).toBe(`RAP-${NEXT()}-00001`);
    // The other year's sequence is untouched.
    expect(await counterLast(MAIN())).toBe(54);
  });
});
