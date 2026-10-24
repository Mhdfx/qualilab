import { describe, expect, it, vi } from "vitest";
import { drawReportNumber, ensureReportCounter, highestReportSequence } from "./report-number";
import type { Prisma } from "@/generated/prisma/client";

/**
 * The report sequence (HANDOFF §9, lot 2D item 5). The draw itself — the
 * row lock, simultaneous approvals — runs against the local database in
 * report-number.race.test.ts; here, the rules that need none.
 */

describe("the highest report already issued", () => {
  it("reads « RAP-AAAA-NNNNN » of the year only", () => {
    const numbers = ["RAP-2026-00009", "RAP-2026-00002", "RAP-2025-00300", null, "RAP-2026-00004"];
    expect(highestReportSequence(2026, numbers)).toBe(9);
    expect(highestReportSequence(2025, numbers)).toBe(300);
    expect(highestReportSequence(2027, numbers)).toBe(0);
  });

  it("skips what is not a report number of the year", () => {
    expect(highestReportSequence(2026, ["FAC-2026-0042", "2780/26", "RAP-2026-00000", "RAP-2026-", "RAP-2025-00300-A1", ""])).toBe(0);
  });

  it("reads the digits at the head of a number whatever follows them (a suffix, a hand fix)", () => {
    expect(highestReportSequence(2026, ["RAP-2026-00012-A1"])).toBe(12);
    expect(highestReportSequence(2026, [" RAP-2026-00007 bis", "RAP-2026-00005"])).toBe(7);
  });
});

/**
 * A stand-in for the `Counter` table: enough of `setCounter` / `nextNumber`
 * (INSERT … GREATEST, SELECT … FOR UPDATE, UPDATE) to follow one draw.
 */
function fakeTx(reports: string[], counter: Map<string, number>) {
  const key = (values: unknown[]) => `${values[0]}:${values[1]}`;
  return {
    report: {
      findFirst: vi.fn(async ({ where }: { where: { number: { startsWith: string } } }) => {
        const found = reports.filter((n) => n.startsWith(where.number.startsWith)).sort().at(-1);
        return found ? { number: found } : null;
      }),
    },
    $executeRaw: vi.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
      const text = sql.join("?");
      if (text.includes("GREATEST")) {
        counter.set(key(values), Math.max(counter.get(key(values)) ?? 0, Number(values[2])));
      } else if (text.includes("INSERT")) {
        if (!counter.has(key(values))) counter.set(key(values), 0);
      } else {
        // UPDATE … SET last = ? WHERE kind = ? AND year = ?
        counter.set(`${values[1]}:${values[2]}`, Number(values[0]));
      }
      return 1;
    }),
    $queryRaw: vi.fn(async (_sql: TemplateStringsArray, ...values: unknown[]) => {
      const last = counter.get(key(values));
      return last === undefined ? [] : [{ last }];
    }),
  } as unknown as Prisma.TransactionClient;
}

describe("drawing a report number", () => {
  it("continues from the highest report issued on the first draw of the year", async () => {
    const counter = new Map<string, number>();
    const tx = fakeTx(["RAP-2026-00008", "RAP-2026-00009", "RAP-2025-00412"], counter);
    expect(await drawReportNumber(tx, new Date(2026, 9, 23, 10))).toBe("RAP-2026-00010");
    expect(await drawReportNumber(tx, new Date(2026, 9, 23, 10))).toBe("RAP-2026-00011");
    expect(counter.get("RAPPORT:2026")).toBe(11);
  });

  it("never goes back below the counter, and seats it above a number written outside it", async () => {
    const counter = new Map([["RAPPORT:2026", 20]]);
    expect(await drawReportNumber(fakeTx(["RAP-2026-00009"], counter), new Date(2026, 9, 23))).toBe("RAP-2026-00021");
    expect(await drawReportNumber(fakeTx(["RAP-2026-00030"], counter), new Date(2026, 9, 23))).toBe("RAP-2026-00031");
  });

  it("continues past a top record that carries a suffix, instead of clashing all year", async () => {
    // Read strictly, « RAP-2026-00012-A1 » seated the counter at 0: every
    // draw clashed with RAP-2026-00001 … and no report could be issued.
    const counter = new Map<string, number>();
    const tx = fakeTx(["RAP-2026-00011", "RAP-2026-00012", "RAP-2026-00012-A1"], counter);
    expect(await drawReportNumber(tx, new Date(2026, 9, 23, 10))).toBe("RAP-2026-00013");
  });

  it("numbers in the year of the issue, each year from 00001", async () => {
    const counter = new Map([["RAPPORT:2026", 4100]]);
    const tx = fakeTx(["RAP-2026-04100"], counter);
    expect(await drawReportNumber(tx, new Date(2026, 11, 31, 23, 59))).toBe("RAP-2026-04101");
    expect(await drawReportNumber(tx, new Date(2027, 0, 1, 0, 1))).toBe("RAP-2027-00001");
    expect(counter.get("RAPPORT:2026")).toBe(4101);
  });
});

describe("the year's counter row before the issuing transaction", () => {
  /** `fakeTx` plus the counter row's plain read. */
  function withRead(reports: string[], counter: Map<string, number>) {
    const tx = fakeTx(reports, counter) as unknown as Record<string, unknown>;
    tx.counter = {
      findUnique: vi.fn(async ({ where }: { where: { kind_year: { kind: string; year: number } } }) => {
        const last = counter.get(`${where.kind_year.kind}:${where.kind_year.year}`);
        return last === undefined ? null : { last };
      }),
    };
    return tx as unknown as Prisma.TransactionClient & { $executeRaw: ReturnType<typeof vi.fn> };
  }

  it("is created at the highest report issued when missing", async () => {
    const counter = new Map<string, number>();
    await ensureReportCounter(withRead(["RAP-2026-00009"], counter), new Date(2026, 9, 23));
    expect(counter.get("RAPPORT:2026")).toBe(9);
  });

  it("is only read once it exists: no write, no lock to queue on", async () => {
    const counter = new Map([["RAPPORT:2026", 40]]);
    const tx = withRead(["RAP-2026-00009"], counter);
    await ensureReportCounter(tx, new Date(2026, 9, 23));
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(counter.get("RAPPORT:2026")).toBe(40);
  });
});
