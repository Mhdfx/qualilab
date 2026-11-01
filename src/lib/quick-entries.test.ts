import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { applyQuickEntry, quickEntries, type QuickEntry } from "./quick-entries";
import { parseLabValue } from "./result-value";
import { parseUnitReading } from "./interpretation";

/** G1 (18/10 re-ask 2.20 (g), « Oui » on 28/10, « Indénombrable » struck out). */
const entry = (text: string): QuickEntry => {
  const found = quickEntries(null).find((candidate) => candidate.text.trim() === text.trim());
  if (!found) throw new Error(`no button ${text}`);
  return found;
};

describe("quickEntries — the buttons of a line, by its plan", () => {
  it("an absence test: « Absence », « Présence »", () => {
    expect(quickEntries({ mKind: "ABSENCE" }).map((e) => e.text)).toEqual(["Absence", "Présence"]);
  });

  it("a count against a criterion: « < 10 », « > », « .10² » … « .10⁶ »", () => {
    expect(quickEntries({ mKind: "VALUE" }).map((e) => e.text.trim())).toEqual([
      "< 10", ">", ".10²", ".10³", ".10⁴", ".10⁵", ".10⁶",
    ]);
    expect(quickEntries({ mKind: "UNSPECIFIED" })).toEqual(quickEntries({ mKind: "VALUE" }));
  });

  it("no criterion: both", () => {
    expect(quickEntries(null).map((e) => e.text.trim())).toEqual([
      "< 10", ">", ".10²", ".10³", ".10⁴", ".10⁵", ".10⁶", "Absence", "Présence",
    ]);
  });

  it("never offers « Indénombrable » (struck out by the laboratory)", () => {
    for (const plan of [null, { mKind: "VALUE" as const }, { mKind: "ABSENCE" as const }]) {
      expect(quickEntries(plan).some((e) => /ind[ée]nombrable|tntc/i.test(e.text))).toBe(false);
    }
  });

  it("every button has a French accessible name", () => {
    for (const e of quickEntries(null)) expect(e.label).toMatch(/^(Saisir|Insérer) « /);
  });
});

describe("applyQuickEntry — what the field holds after a click", () => {
  it("a whole reading replaces the field", () => {
    expect(applyQuickEntry("12", 2, 2, entry("< 10"))).toEqual({ value: "< 10", caret: 4 });
    expect(applyQuickEntry("", null, null, entry("Absence"))).toEqual({ value: "Absence", caret: 7 });
    expect(applyQuickEntry("Absence", 0, 7, entry("Présence"))).toEqual({ value: "Présence", caret: 8 });
  });

  it("a power of ten goes in at the cursor, after the mantissa, without a space", () => {
    expect(applyQuickEntry("3", 1, 1, entry(".10⁵"))).toEqual({ value: "3.10⁵", caret: 5 });
    expect(applyQuickEntry("8,9 ", 4, 4, entry(".10²"))).toEqual({ value: "8,9.10²", caret: 7 });
    expect(applyQuickEntry("3.", 2, 2, entry(".10³"))).toEqual({ value: "3.10³", caret: 5 });
    // A selection is replaced.
    expect(applyQuickEntry("3.10²", 1, 5, entry(".10⁴"))).toEqual({ value: "3.10⁴", caret: 5 });
    // No cursor known: at the end.
    expect(applyQuickEntry("1,5", null, null, entry(".10⁶"))).toEqual({ value: "1,5.10⁶", caret: 7 });
  });

  it("« > » leads the reading, once", () => {
    expect(applyQuickEntry("", 0, 0, entry(">"))).toEqual({ value: "> ", caret: 2 });
    expect(applyQuickEntry("3.10⁵", 5, 5, entry(">"))).toEqual({ value: "> 3.10⁵", caret: 7 });
    expect(applyQuickEntry("> 3.10⁵", 7, 7, entry(">"))).toEqual({ value: "> 3.10⁵", caret: 7 });
    expect(applyQuickEntry(">3", 2, 2, entry(">"))).toEqual({ value: "> 3", caret: 3 });
  });

  it("builds readings the bench reads", () => {
    let field = applyQuickEntry("", 0, 0, entry(">"));
    field = { value: `${field.value}3`, caret: field.caret + 1 };
    field = applyQuickEntry(field.value, field.caret, field.caret, entry(".10⁵"));
    expect(field.value).toBe("> 3.10⁵");
    expect(parseLabValue(field.value)).toEqual({ numeric: 300_000, kind: "above" });
    expect(parseUnitReading(applyQuickEntry("1,2", 3, 3, entry(".10²")).value)).toMatchObject({ value: 120, kind: "count" });
    expect(parseUnitReading("< 10")).toMatchObject({ kind: "below" });
    expect(parseUnitReading("Présence")).toMatchObject({ kind: "presence", detected: true });
    expect(parseUnitReading("Absence")).toMatchObject({ kind: "absence", detected: false });
  });

  it("the bench screen offers them under every reading", () => {
    const form = readFileSync(fileURLToPath(new URL("../components/technicien/ResultEntryForm.tsx", import.meta.url)), "utf8");
    expect(form).toContain("quickEntries(line.plan)");
    expect(form).toContain("applyQuickEntry(");
  });
});
