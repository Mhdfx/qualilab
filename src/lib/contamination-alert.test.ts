import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALERT_RESULT_WHERE, raisesContaminationAlert, type AlertCandidate } from "./contamination-alert";
import {
  judgeUnits,
  parseUnitReading,
  suggestUnitsConformity,
  summariseReadings,
  verdictToConform,
  type Plan,
} from "./interpretation";
import { benchConformity, parseLabValue, suggestConformity } from "./result-value";
import type { Interpretation } from "@/generated/prisma/enums";

/**
 * The 09/09 audit lesson: a fix to the alert path silently lost alerts. An
 * « Indénombrable » plate has no number (`numericValue` null), so any alert
 * filter that compared figures would miss the worst contamination of all.
 * These tests run the bench's own pipeline (parse → judge → store) and check
 * the filter the dispatch hands to the database.
 */

type StoredRow = AlertCandidate & { numericValue: number | null; value: string | null; interpretation: Interpretation | null };

/** What the results route stores for one germ read per unit against its plan. */
function storedFromBench(plan: Plan, typed: string[], alertOnExceed = true): StoredRow {
  const readings = typed.map(parseUnitReading);
  const judged = judgeUnits(plan, readings);
  const summary = summariseReadings(readings);
  return {
    value: summary.value,
    numericValue: summary.numeric,
    interpretation: judged.official?.verdict ?? null,
    informalInterpretation: judged.informal?.verdict ?? null,
    conform: verdictToConform(judged.official?.verdict ?? null),
    parameter: { alertOnExceed },
  };
}

/**
 * A minimal reading of a Prisma `where` — plain equality, nested relation
 * fields and `OR` — enough to evaluate ALERT_RESULT_WHERE exactly as written,
 * and to fail loudly on any operator it does not know.
 */
function matches(where: unknown, row: unknown): boolean {
  if (where === null || typeof where !== "object") return Object.is(where, row);
  const record = row as Record<string, unknown>;
  return Object.entries(where as Record<string, unknown>).every(([key, condition]) => {
    if (key === "OR") return (condition as unknown[]).some((branch) => matches(branch, row));
    if (key === "AND") return (condition as unknown[]).every((branch) => matches(branch, row));
    if (/^(gt|gte|lt|lte|not|in|notIn|equals|contains|is)$/.test(key)) {
      throw new Error(`Opérateur non pris en charge par le test : ${key}`);
    }
    return matches(condition, record?.[key]);
  });
}

const salmonellaLike: Plan = { n: 1, c: null, mKind: "VALUE", m: 100, bigM: null };
const threeClass: Plan = { n: 5, c: 2, mKind: "VALUE", m: 100, bigM: 10_000 };

describe("an « Indénombrable » plate raises the contamination alert", () => {
  it("is judged NON_SATISFAISANT against its criterion, with no number stored", () => {
    for (const word of ["Indénombrable", "indenombrable", "INCOMPTABLE", "TNTC"]) {
      const row = storedFromBench(threeClass, ["10", word, "10", "10", "10"]);
      expect(row.interpretation, word).toBe("NON_SATISFAISANT");
      expect(row.conform, word).toBe(false);
      expect(row.numericValue, word).toBeNull();
      expect(row.value, word).toBe(word);
    }
  });

  it("is selected by the dispatch's filter although numericValue is null", () => {
    const row = storedFromBench(salmonellaLike, ["Indénombrable"]);
    expect(row.numericValue).toBeNull();
    expect(matches(ALERT_RESULT_WHERE, row)).toBe(true);
    expect(raisesContaminationAlert(row)).toBe(true);
  });

  it("is selected too when judged only indicatively (fewer units than n)", () => {
    const row = storedFromBench(threeClass, ["Indénombrable"]);
    expect(row.interpretation).toBeNull();
    expect(row.informalInterpretation).toBe("NON_SATISFAISANT");
    expect(matches(ALERT_RESULT_WHERE, row)).toBe(true);
    expect(raisesContaminationAlert(row)).toBe(true);
  });

  it("never alerts a germ that is not sensitive, nor a satisfactory one", () => {
    expect(matches(ALERT_RESULT_WHERE, storedFromBench(salmonellaLike, ["Indénombrable"], false))).toBe(false);
    expect(matches(ALERT_RESULT_WHERE, storedFromBench(salmonellaLike, ["50"]))).toBe(false);
  });

  it("selects « > x » once x reaches the limit", () => {
    const row = storedFromBench(salmonellaLike, ["> 3.10²"]);
    expect(row).toMatchObject({ interpretation: "NON_SATISFAISANT", numericValue: 300, value: "> 3.10²" });
    expect(matches(ALERT_RESULT_WHERE, row)).toBe(true);
  });
});

describe("the filter and the screen's rule are the same rule", () => {
  const cases: AlertCandidate[] = [];
  for (const alertOnExceed of [true, false]) {
    for (const conform of [true, false, null]) {
      for (const informalInterpretation of [null, "SATISFAISANT", "ACCEPTABLE", "NON_SATISFAISANT", "INCOMPLET"] as const) {
        cases.push({ conform, informalInterpretation, parameter: { alertOnExceed } });
      }
    }
  }

  it("agree on every combination", () => {
    for (const row of cases) {
      expect(matches(ALERT_RESULT_WHERE, row), JSON.stringify(row)).toBe(raisesContaminationAlert(row));
    }
  });

  it("never filters on a number", () => {
    expect(JSON.stringify(ALERT_RESULT_WHERE)).not.toMatch(/numericValue|value/i);
  });

  it("is the filter the dispatch actually uses", () => {
    const source = readFileSync(fileURLToPath(new URL("./report-dispatch.ts", import.meta.url)), "utf8");
    expect(source).toContain("where: ALERT_RESULT_WHERE");
  });
});

describe("without a criterion, the server's own judgement keeps the alert", () => {
  // What the results route stores on the two paths that judge against the
  // parameter's limit — even when a stale or forged request says « conforme ».
  const limit = 100;

  it("a single « Indénombrable » or « > x » over the limit is stored non conforme and alerts", () => {
    for (const typed of ["Indénombrable", "TNTC", "> 3.10^5"]) {
      const parsed = parseLabValue(typed);
      const row: StoredRow = {
        value: typed,
        numericValue: parsed.numeric,
        interpretation: null,
        informalInterpretation: null,
        conform: benchConformity(suggestConformity(parsed.numeric, limit, parsed.kind), true),
        parameter: { alertOnExceed: true },
      };
      expect(row.conform, typed).toBe(false);
      expect(raisesContaminationAlert(row), typed).toBe(true);
      expect(matches(ALERT_RESULT_WHERE, row), typed).toBe(true);
    }
  });

  it("per unit, an uncountable repetition is stored non conforme and alerts", () => {
    const readings = ["10", "Indénombrable", "20"].map(parseUnitReading);
    const summary = summariseReadings(readings);
    const row: StoredRow = {
      value: summary.value,
      numericValue: summary.numeric,
      interpretation: null,
      informalInterpretation: null,
      conform: benchConformity(suggestUnitsConformity(readings, limit), null),
      parameter: { alertOnExceed: true },
    };
    expect(row.numericValue).toBeNull();
    expect(row.conform).toBe(false);
    expect(matches(ALERT_RESULT_WHERE, row)).toBe(true);
  });

  it("the results route stores that judgement, not the request's", () => {
    const source = readFileSync(fileURLToPath(new URL("../app/api/samples/[id]/results/route.ts", import.meta.url)), "utf8");
    expect(source).not.toMatch(/conform:\s*typeof raw\.conform/);
    expect(source).toContain("benchConformity(suggestUnitsConformity(readings, parameter.limitValue), raw.conform)");
    expect(source).toContain("benchConformity(suggestConformity(parsed.numeric, parameter.limitValue, parsed.kind), raw.conform)");
  });
});
