import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  awaitsManualConformity,
  benchStartingReadings,
  benchUnit,
  benchUnits,
  limitConformity,
  manualChoiceOffered,
  unitsAgainstLimit,
  unreadableSensitiveReading,
  valueAgainstLimit,
  type StoredResult,
} from "./bench-reading";

describe("benchUnit — the unit the entry screen shows (Q40, 16/10)", () => {
  it("takes the criterion's unit over the parameter's, as the sheet and the report do", () => {
    expect(benchUnit({ unit: "/1 g" }, "/25 g")).toBe("/1 g");
  });

  it("falls back on the parameter's unit without a criterion, or a criterion without a unit", () => {
    expect(benchUnit(null, "/25 g")).toBe("/25 g");
    expect(benchUnit(undefined, "UFC/g")).toBe("UFC/g");
    expect(benchUnit({ unit: null }, "UFC/g")).toBe("UFC/g");
    expect(benchUnit(null, null)).toBeNull();
  });
});

describe("valueAgainstLimit — one value against the parameter's limit", () => {
  it("decides a count on its own, the factor applied first", () => {
    expect(valueAgainstLimit("50", 1, 100)).toMatchObject({ suggested: true, needsManual: false });
    expect(valueAgainstLimit("150", 1, 100)).toMatchObject({ suggested: false, needsManual: false });
    expect(valueAgainstLimit("20", 10, 100)).toMatchObject({ suggested: false, needsManual: false });
    // « 3(-2) » = 300: judged like any count, no choice asked (D-01).
    expect(valueAgainstLimit("3(-2)", 1, 100)).toMatchObject({ parsed: { numeric: 300, kind: "number" }, suggested: false, needsManual: false });
  });

  it("asks a choice for « > x » below the limit, and says why", () => {
    const open = valueAgainstLimit("> 50", 1, 100);
    expect(open).toMatchObject({ suggested: null, needsManual: true });
    expect(open.undecided).toBe("> 50 ne permet pas de conclure face à la limite 1.10² : lire une dilution supérieure.");
    // Over the limit once multiplied: decided.
    expect(valueAgainstLimit("> 50", 10, 100)).toMatchObject({ suggested: false, needsManual: false, undecided: null });
  });

  it("asks a choice for a reading that is not a number", () => {
    expect(valueAgainstLimit("Présence", 1, 100)).toMatchObject({ suggested: null, needsManual: true });
    // Without a limit, only when J3 is off (28/10, 2.11 — see the J3 block below).
    expect(valueAgainstLimit("voir cahier", 1, null, false)).toMatchObject({ needsManual: true });
    expect(valueAgainstLimit("Indénombrable", 1, null, false)).toMatchObject({ suggested: null, needsManual: true });
    expect(valueAgainstLimit("Indénombrable", 1, 100)).toMatchObject({ suggested: false, needsManual: false });
  });

  it("asks nothing for a count without a limit, nor for an empty line", () => {
    expect(valueAgainstLimit("50", 1, null)).toMatchObject({ suggested: null, needsManual: false });
    expect(valueAgainstLimit("", 1, 100)).toEqual({ parsed: null, suggested: null, undecided: null, needsManual: false });
    expect(valueAgainstLimit("   ", 10, 100)).toEqual({ parsed: null, suggested: null, undecided: null, needsManual: false });
  });
});

describe("unitsAgainstLimit — every unit against the parameter's limit", () => {
  it("lets the worst unit decide", () => {
    expect(unitsAgainstLimit(["10", "20", "30"], 1, 100)).toMatchObject({ suggested: true, needsManual: false, typedUnits: 3 });
    expect(unitsAgainstLimit(["10", "Indénombrable", "30"], 1, 100)).toMatchObject({ suggested: false, needsManual: false });
    expect(unitsAgainstLimit(["10", "3(-2)", "30"], 1, 100)).toMatchObject({ suggested: false, needsManual: false });
  });

  it("asks a choice for a presence, or a « > x » below the limit with nothing over it", () => {
    expect(unitsAgainstLimit(["10", "Présence", "20"], 1, 100)).toMatchObject({ suggested: null, needsManual: true });
    expect(unitsAgainstLimit(["> 50", "10", "20"], 1, 100)).toMatchObject({ suggested: null, needsManual: true });
  });

  it("asks nothing while a repetition must be retyped or nothing is typed", () => {
    const unreadable = unitsAgainstLimit(["abc", "Présence", ""], 1, 100);
    expect(unreadable).toMatchObject({ needsManual: false, unreadable: ["R1"], typedUnits: 2 });
    expect(unitsAgainstLimit(["", "", ""], 1, 100)).toMatchObject({ needsManual: false, typedUnits: 0, parsed: null });
  });

  it("reads the units with the factor applied, as the server stores them", () => {
    const read = benchUnits(["3", "< 10", ""], 10);
    expect(read.readings.map((reading) => reading.value)).toEqual([30, 0, null]);
    expect(read.typedUnits).toBe(2);
    expect(read.unreadable).toEqual([]);
  });
});

describe("awaitsManualConformity — the submission checks the screen's rule again (Q78, D-08)", () => {
  const single = (patch: Partial<StoredResult>): StoredResult => ({
    criterion: null,
    conform: null,
    value: null,
    rawValue: null,
    units: [],
    ...patch,
  });
  const line = { unitCount: 1, factor: 1, limitValue: 100 };

  it("refuses « > 50 » against a limit of 100, no criterion and no choice", () => {
    expect(awaitsManualConformity(single({ value: "> 50" }), line)).toBe(true);
  });

  it("lets it go once the choice is stored, either way", () => {
    expect(awaitsManualConformity(single({ value: "> 50", conform: true }), line)).toBe(false);
    expect(awaitsManualConformity(single({ value: "> 50", conform: false }), line)).toBe(false);
  });

  it("never asks a line judged by its criterion: the verdict decides", () => {
    const criterion = { n: 1, c: null, mKind: "VALUE", m: 100, bigM: null };
    expect(awaitsManualConformity(single({ value: "Présence", criterion }), line)).toBe(false);
  });

  it("never asks a line the reading decides, nor a count without a limit", () => {
    expect(awaitsManualConformity(single({ value: "50" }), { ...line, limitValue: null })).toBe(false);
    expect(awaitsManualConformity(single({ value: "3.10²", rawValue: "3(-2)", conform: false }), line)).toBe(false);
    // A shorthand stored raw before 16/10 reads as a count now: nothing to choose.
    expect(awaitsManualConformity(single({ value: "3(-2)" }), line)).toBe(false);
  });

  it("reads the typed reading with the line's factor — never the stored final value twice", () => {
    // « > 30 » × 10 = « > 3.10² », below 1000: still open. Read from the
    // final value, × 10 again, it would wrongly pass as over the limit.
    const stored = single({ value: "> 3.10²", rawValue: "> 30" });
    expect(awaitsManualConformity(stored, { unitCount: 1, factor: 10, limitValue: 1000 })).toBe(true);
    expect(awaitsManualConformity(stored, { unitCount: 1, factor: 10, limitValue: 300 })).toBe(false);
  });

  it("reads a line taken on several units from its stored readings, in their order", () => {
    const units = [
      { unitIndex: 3, rawValue: "20" },
      { unitIndex: 1, rawValue: "10" },
      { unitIndex: 2, rawValue: "Présence" },
    ];
    const perUnit = { unitCount: 3, factor: 1, limitValue: 100 };
    expect(awaitsManualConformity(single({ value: "Présence", units }), perUnit)).toBe(true);
    expect(awaitsManualConformity(single({ value: "Présence", units, conform: false }), perUnit)).toBe(false);
    const counted = units.map((unit) => (unit.unitIndex === 2 ? { ...unit, rawValue: "150" } : unit));
    expect(awaitsManualConformity(single({ value: "1,5.10²", units: counted }), perUnit)).toBe(false);
  });
});

describe("benchStartingReadings — a line opens with what was typed", () => {
  const single = (value: string | null, rawValue: string | null = null) => ({ value, rawValue, units: [] });
  const perUnit = (...typed: [number, string][]) => ({
    value: "worst ×10",
    rawValue: null,
    units: typed.map(([unitIndex, rawValue]) => ({ unitIndex, rawValue })),
  });

  it("nothing saved: an empty grid, an empty value", () => {
    expect(benchStartingReadings(undefined, true, 3)).toEqual({ units: ["", "", ""], value: "" });
    expect(benchStartingReadings(null, false, 1)).toEqual({ units: [], value: "" });
    expect(benchStartingReadings(undefined, true, 0)).toEqual({ units: [""], value: "" });
  });

  it("the usual cases are unchanged: R1 … Rn in their places, the single value as typed", () => {
    expect(benchStartingReadings(perUnit([1, "12"], [3, "0(-1)"]), true, 3).units).toEqual(["12", "", "0(-1)"]);
    expect(benchStartingReadings(single("1,5.10²", "15"), false, 1)).toEqual({ units: [], value: "15" });
    expect(benchStartingReadings(single("Absence"), false, 1)).toEqual({ units: [], value: "Absence" });
  });

  it("a criterion added since a single value was saved: the value opens as R1, never an empty grid", () => {
    expect(benchStartingReadings(single("10"), true, 1).units).toEqual(["10"]);
    expect(benchStartingReadings(single("300", "3(-2)"), true, 3).units).toEqual(["3(-2)", "", ""]);
    // An empty single value adds nothing.
    expect(benchStartingReadings(single(""), true, 2).units).toEqual(["", ""]);
    expect(benchStartingReadings(single(null), true, 1).units).toEqual([""]);
  });

  it("a criterion withdrawn since a lone R1 was saved: R1 opens as the single value, not the figure × factor", () => {
    // R1 « 5 » with a factor 10 was stored « 50 »: the field must show « 5 »,
    // else the next save stores « 500 ».
    expect(benchStartingReadings({ value: "50", rawValue: null, units: [{ unitIndex: 1, rawValue: "5" }] }, false, 1)).toEqual({
      units: [],
      value: "5",
    });
  });

  it("several readings for a line now read once: the stored value, as before", () => {
    expect(benchStartingReadings(perUnit([1, "5"], [2, "7"]), false, 1).value).toBe("worst ×10");
  });

  it("the bench page opens its lines through it", () => {
    const page = readFileSync(fileURLToPath(new URL("../app/technicien/[id]/page.tsx", import.meta.url)), "utf8");
    expect(page).toContain("benchStartingReadings(existing, perUnit, bench.unitCount)");
  });
});

describe("one rule for the screen and the server", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("the entry screen asks with the helpers the submission checks with", () => {
    const form = read("../components/technicien/ResultEntryForm.tsx");
    expect(form).toContain("valueAgainstLimit(line.value, factor, line.limitValue)");
    expect(form).toContain("unitsAgainstLimit(line.units, factor, line.limitValue)");
    // The factor the save applies: the dilution typed (J4), else the programme's.
    expect(form).toContain("const factor = lineFactor(line) ?? line.calcFactor;");
    const submit = read("../app/api/samples/[id]/results/submit/route.ts");
    expect(submit).toContain("awaitsManualConformity(result, {");
    expect(submit).toContain("factor: readingFactor(result?.dilutionUsed, line.dilutionFactor, parameter.calcFactor)");
  });

  it("the entry page shows the unit the sheet and the stored result use", () => {
    expect(read("../app/technicien/[id]/page.tsx")).toContain("unit: resultUnit(bench.context, benchUnit(plan, parameter.unit))");
    expect(read("../app/api/bench-sheet/route.ts")).toContain("unit: resultUnit(bench.context, benchUnit(plan, parameter.unit))");
    expect(read("../app/api/samples/[id]/results/route.ts")).toContain("unit: resultUnit(bench.context, benchUnit(plan, parameter.unit))");
  });
});

describe("J3 — no criterion, no limit: no interpretation (28/10, 2.11)", () => {
  it("is on by default (the switch of lab-proposals.ts)", () => {
    expect(manualChoiceOffered(null)).toBe(false);
    expect(manualChoiceOffered(undefined)).toBe(false);
  });

  it("asks no choice for « Présence », « Indénombrable » or a text without a limit", () => {
    for (const typed of ["Présence", "Indénombrable", "voir cahier", "Positif"]) {
      expect(valueAgainstLimit(typed, 1, null), typed).toMatchObject({ suggested: null, needsManual: false });
      expect(unitsAgainstLimit([typed, "10"], 1, null), typed).toMatchObject({ suggested: null, needsManual: false });
    }
  });

  it("keeps the choice wherever the catalogue gives a limit — the limit counts as a criterion", () => {
    expect(manualChoiceOffered(100)).toBe(true);
    expect(manualChoiceOffered(0)).toBe(true);
    expect(valueAgainstLimit("Présence", 1, 100)).toMatchObject({ needsManual: true });
    expect(valueAgainstLimit("> 50", 1, 100)).toMatchObject({ needsManual: true });
    expect(unitsAgainstLimit(["10", "Présence"], 1, 100)).toMatchObject({ needsManual: true });
  });

  it("off, the bench asks it again exactly as before", () => {
    expect(manualChoiceOffered(null, false)).toBe(true);
    expect(valueAgainstLimit("Présence", 1, null, false)).toMatchObject({ needsManual: true });
    expect(unitsAgainstLimit(["Présence"], 1, null, false)).toMatchObject({ needsManual: true });
  });

  it("stores no conformity on such a line, whatever a stale page or a forged request sends", () => {
    for (const chosen of [true, false, null, undefined]) {
      expect(limitConformity(null, chosen, null)).toBeNull();
    }
    // Off: the technician's choice, as before.
    expect(limitConformity(null, false, null, false)).toBe(false);
    // A reading that decides on its own is never overridden.
    expect(limitConformity(false, true, 100)).toBe(false);
    expect(limitConformity(true, false, 100)).toBe(true);
  });

  it("the submission no longer waits for a choice on such a line", () => {
    const stored: StoredResult = { criterion: null, conform: null, value: "Présence", rawValue: null, units: [] };
    expect(awaitsManualConformity(stored, { unitCount: 1, factor: 1, limitValue: null })).toBe(false);
    const units = [{ unitIndex: 1, rawValue: "Présence" }, { unitIndex: 2, rawValue: "Indénombrable" }];
    expect(awaitsManualConformity({ ...stored, units }, { unitCount: 2, factor: 1, limitValue: null })).toBe(false);
    // …but still waits where a limit asks it (the « > x » the technician reads again).
    expect(awaitsManualConformity({ ...stored, value: "> 50" }, { unitCount: 1, factor: 1, limitValue: 100 })).toBe(true);
  });
});

describe("O-12 × J3 — a sensitive germ without criterion must be read in a notation the alert understands", () => {
  const sensitive = { limitValue: null, sensitive: true };
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("refuses a text that says neither presence nor absence", () => {
    for (const typed of ["voir remarque", "présente", "douteux"]) {
      expect(unreadableSensitiveReading(typed, sensitive), typed).toBe(true);
    }
  });

  it("accepts every reading the alert rule reads", () => {
    for (const typed of ["Présence", "Absence", "50", "< 10", "> 3.10²", "Indénombrable", "3(-2)", "Positif", ""]) {
      expect(unreadableSensitiveReading(typed, sensitive), typed).toBe(false);
    }
  });

  it("concerns only a sensitive germ with no limit, and only while J3 is on", () => {
    expect(unreadableSensitiveReading("voir remarque", { limitValue: null, sensitive: false })).toBe(false);
    expect(unreadableSensitiveReading("voir remarque", { limitValue: 100, sensitive: true })).toBe(false);
    expect(unreadableSensitiveReading("voir remarque", sensitive, false)).toBe(false);
  });

  it("the submission and the screen apply it", () => {
    expect(read("../app/api/samples/[id]/results/submit/route.ts")).toContain("unreadableSensitiveReading(");
    expect(read("../components/technicien/ResultEntryForm.tsx")).toContain("unreadableSensitiveReading(line.value, line)");
  });
});
