import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import {
  NOT_DONE_MESSAGE,
  applyCalcFactor,
  benchConformity,
  factoredText,
  isNotDoneText,
  isUncountableText,
  parseLabValue,
  singleValueEntry,
  suggestConformity,
  formatLabValue,
} from "./result-value";
import { parseUnitReading } from "./interpretation";

/**
 * Reading a bench value is the single most consequential function here: it
 * decides conformity, and it decides whether a contamination alert reaches the
 * client. A misread digit is a wrong verdict on a food sample.
 */
describe("parseLabValue", () => {
  it("reads the notation from the client's own alert email", () => {
    // 8,9.10² and 3.10² against a limit of 1.10², from the mail of 17/08/2026.
    expect(parseLabValue("8,9.10²").numeric).toBe(890);
    expect(parseLabValue("3.10²").numeric).toBe(300);
    expect(parseLabValue("1.10²").numeric).toBe(100);
  });

  it("accepts the other ways a technician writes a power of ten", () => {
    expect(parseLabValue("1,5 x 10^4").numeric).toBe(15000);
    expect(parseLabValue("1.5x10^4").numeric).toBe(15000);
    expect(parseLabValue("10^3").numeric).toBe(1000);
    expect(parseLabValue("2.5e3").numeric).toBe(2500);
  });

  it("reads plain numbers, with the comma as decimal separator", () => {
    expect(parseLabValue("150").numeric).toBe(150);
    expect(parseLabValue("0").numeric).toBe(0);
    expect(parseLabValue("12,5").numeric).toBe(12.5);
  });

  it("treats an absence as zero, however it is written", () => {
    for (const written of ["Absence", "absence /25 g", "ND", "néant", "abs"]) {
      const parsed = parseLabValue(written);
      expect(parsed.numeric, written).toBe(0);
      expect(parsed.kind, written).toBe("absence");
    }
  });

  it("treats a below-detection reading as zero but flags it as such", () => {
    const parsed = parseLabValue("< 10");
    expect(parsed.numeric).toBe(0);
    // Flagged so the interface can say "sous le seuil de détection" rather
    // than claiming an exact count of zero.
    expect(parsed.kind).toBe("below");
  });

  it("never guesses at something it cannot read", () => {
    for (const written of ["", "   ", "à refaire", "voir cahier", "??"]) {
      const parsed = parseLabValue(written);
      expect(parsed.numeric, written).toBeNull();
      expect(parsed.kind, written).toBe("unreadable");
    }
  });

  it("is not confused by surrounding spaces", () => {
    expect(parseLabValue("  8,9.10²  ").numeric).toBe(890);
  });

  it("reads an uncountable plate — no number, whatever the case and the accents", () => {
    for (const written of ["Indénombrable", "indenombrable", "INDÉNOMBRABLE", "Incomptable", "TNTC", "t.n.t.c."]) {
      expect(parseLabValue(written), written).toEqual({ numeric: null, kind: "uncountable" });
      expect(isUncountableText(written), written).toBe(true);
    }
    expect(isUncountableText("Absence")).toBe(false);
    expect(isUncountableText(null)).toBe(false);
  });

  it("reads « > x » as a lower bound, with the usual notations of x", () => {
    expect(parseLabValue(">300")).toEqual({ numeric: 300, kind: "above" });
    expect(parseLabValue("> 3.10^5")).toEqual({ numeric: 300_000, kind: "above" });
    expect(parseLabValue("> 3,0.10⁵")).toEqual({ numeric: 300_000, kind: "above" });
    expect(parseLabValue("> illisible")).toEqual({ numeric: null, kind: "unreadable" });
    expect(parseLabValue("> -5")).toEqual({ numeric: null, kind: "unreadable" });
  });
});

describe("suggestConformity", () => {
  it("is conform at or below the limit, not above", () => {
    expect(suggestConformity(50, 100)).toBe(true);
    expect(suggestConformity(100, 100)).toBe(true);
    expect(suggestConformity(101, 100)).toBe(false);
    expect(suggestConformity(890, 100)).toBe(false);
  });

  it("treats a zero limit as requiring absence", () => {
    expect(suggestConformity(0, 0)).toBe(true);
    expect(suggestConformity(1, 0)).toBe(false);
  });

  it("decides nothing when the value or the limit is unknown", () => {
    // The technician is asked instead — the system must not invent a verdict.
    expect(suggestConformity(null, 100)).toBeNull();
    expect(suggestConformity(50, null)).toBeNull();
    expect(suggestConformity(50, undefined)).toBeNull();
  });

  it("is non conform for « > x » once x reaches the limit, undecided below it", () => {
    expect(suggestConformity(300, 100, "above")).toBe(false);
    expect(suggestConformity(100, 100, "above")).toBe(false);
    // « > 50 » against 100: the count may be 60 or 10⁶ — read a higher dilution.
    expect(suggestConformity(50, 100, "above")).toBeNull();
    expect(suggestConformity(300, null, "above")).toBeNull();
  });

  it("is non conform for an uncountable plate whenever there is a limit", () => {
    const parsed = parseLabValue("Indénombrable");
    expect(suggestConformity(parsed.numeric, 100, parsed.kind)).toBe(false);
    expect(suggestConformity(parsed.numeric, 0, parsed.kind)).toBe(false);
    expect(suggestConformity(parsed.numeric, null, parsed.kind)).toBeNull();
  });
});

describe("factoredText", () => {
  it("rewrites a count and the bound of « > x », nothing else", () => {
    expect(factoredText(applyCalcFactor(parseLabValue("89"), 10))).toBe("8,9.10²");
    expect(factoredText(applyCalcFactor(parseLabValue("> 300"), 10))).toBe("> 3.10³");
    expect(applyCalcFactor(parseLabValue("> 300"), 10)).toEqual({ numeric: 3000, kind: "above" });
    expect(factoredText(applyCalcFactor(parseLabValue("Indénombrable"), 10))).toBeNull();
    expect(factoredText(applyCalcFactor(parseLabValue("< 10"), 10))).toBeNull();
    expect(factoredText(applyCalcFactor(parseLabValue("Absence"), 10))).toBeNull();
  });
});

describe("formatLabValue", () => {
  it("writes a count back the way the laboratory writes it", () => {
    expect(formatLabValue(890)).toBe("8,9.10²");
    expect(formatLabValue(300)).toBe("3.10²");
    expect(formatLabValue(100)).toBe("1.10²");
    expect(formatLabValue(15000)).toBe("1,5.10⁴");
  });

  it("leaves small numbers alone", () => {
    expect(formatLabValue(50)).toBe("50");
    expect(formatLabValue(0)).toBe("0");
  });

  it("round-trips through the parser", () => {
    for (const value of [890, 300, 100, 15000, 50, 0]) {
      expect(parseLabValue(formatLabValue(value)).numeric, String(value)).toBe(
        value
      );
    }
  });
});

/**
 * The calculation factor (dilution) turns the bench reading into the final
 * value — awaiting the lab's official formulas, the mechanism must already be
 * exact: it decides what the report prints and what an alert compares.
 */
describe("applyCalcFactor", () => {
  it("multiplies a plain reading by the factor", () => {
    const parsed = parseLabValue("8,9.10²");
    expect(applyCalcFactor(parsed, 10).numeric).toBe(8900);
    expect(applyCalcFactor(parsed, 10).kind).toBe("number");
  });

  it("leaves the reading untouched at factor 1 — today's default", () => {
    const parsed = parseLabValue("450");
    expect(applyCalcFactor(parsed, 1)).toEqual(parsed);
  });

  it("keeps Absence and < detections at zero whatever the factor", () => {
    expect(applyCalcFactor(parseLabValue("Absence"), 100).numeric).toBe(0);
    expect(applyCalcFactor(parseLabValue("< 10"), 100).numeric).toBe(0);
    expect(applyCalcFactor(parseLabValue("< 10"), 100).kind).toBe("below");
  });

  it("never turns an unreadable entry into a number", () => {
    const parsed = parseLabValue("illisible???");
    expect(applyCalcFactor(parsed, 10).numeric).toBeNull();
  });

  it("ignores a nonsensical factor rather than corrupting the value", () => {
    const parsed = parseLabValue("100");
    expect(applyCalcFactor(parsed, 0).numeric).toBe(100);
    expect(applyCalcFactor(parsed, Number.NaN).numeric).toBe(100);
    expect(applyCalcFactor(parsed, -5).numeric).toBe(100);
  });

  it("changes the conformity verdict exactly as a dilution would", () => {
    // Raw 50 is under a limit of 100 — but at ×10 the final 500 is over it.
    const parsed = parseLabValue("50");
    expect(suggestConformity(parsed.numeric, 100)).toBe(true);
    expect(suggestConformity(applyCalcFactor(parsed, 10).numeric, 100)).toBe(false);
  });
});

describe("formatLabValue — mantissa carry", () => {
  it("carries a mantissa that rounds to 10 into the exponent", () => {
    expect(formatLabValue(995)).toBe("1.10³");
    expect(formatLabValue(9950)).toBe("1.10⁴");
  });

  it("keeps ordinary readings unchanged", () => {
    expect(formatLabValue(890)).toBe("8,9.10²");
    expect(formatLabValue(100)).toBe("1.10²");
  });
});

describe("benchConformity — what the server stores against the parameter's limit", () => {
  const stored = (typed: string, limit: number | null, chosen: unknown) => {
    const parsed = parseLabValue(typed);
    return benchConformity(suggestConformity(parsed.numeric, limit, parsed.kind), chosen);
  };

  it("keeps the suggestion whatever the request says", () => {
    // « Indénombrable » or « > x » over the limit: never conforme, never blank.
    for (const chosen of [true, null, undefined, "oui"]) {
      expect(stored("Indénombrable", 100, chosen), String(chosen)).toBe(false);
      expect(stored("TNTC", 100, chosen), String(chosen)).toBe(false);
      expect(stored("> 3.10^5", 100, chosen), String(chosen)).toBe(false);
      expect(stored("150", 100, chosen), String(chosen)).toBe(false);
      expect(stored("50", 100, chosen), String(chosen)).toBe(true);
    }
  });

  it("takes the technician's choice only where the screen asks for one", () => {
    // « > 5 » below the limit proves nothing; « Présence » and no limit have no suggestion.
    expect(stored("> 5", 100, true)).toBe(true);
    expect(stored("> 5", 100, false)).toBe(false);
    expect(stored("Indénombrable", null, false)).toBe(false);
    expect(stored("Indénombrable", null, true)).toBe(true);
    expect(stored("Indénombrable", null, "non")).toBeNull();
    expect(stored("Présence", 100, undefined)).toBeNull();
  });
});

describe("« 3(-2) » on a line read as one value (D-01, 16/10)", () => {
  it("reads the colonies and their dilution exactly as the unit grid does", () => {
    expect(parseLabValue("3(-2)")).toEqual({ numeric: 300, kind: "number" });
    expect(parseLabValue(" 15 ( -1 ) ")).toEqual({ numeric: 150, kind: "number" });
    expect(parseLabValue("3(2)")).toEqual({ numeric: 300, kind: "number" });
    for (const typed of ["3(-2)", "15(-1)", "0(-1)", "0(-3)", "120(-4)"]) {
      const unit = parseUnitReading(typed);
      expect(parseLabValue(typed).numeric, typed).toBe(unit.value);
      expect(parseLabValue(typed).kind, typed).toBe(unit.kind === "count" ? "number" : unit.kind);
    }
  });

  it("reads « 0(-1) » — no colony at 10⁻¹ — as below the detection limit", () => {
    expect(parseLabValue("0(-1)")).toEqual({ numeric: 0, kind: "below" });
  });

  it("takes the shorthand alone, never after « > » or « < », nor with a two-digit exponent", () => {
    for (const typed of ["> 3(-2)", "< 3(-2)", "3(-12)", "3(-2", "(-2)", "3,5(-2)"]) {
      expect(parseLabValue(typed), typed).toEqual({ numeric: null, kind: "unreadable" });
    }
  });

  it("judges it against the limit, so no manual conformity is asked for", () => {
    const over = parseLabValue("3(-2)");
    expect(suggestConformity(over.numeric, 100, over.kind)).toBe(false);
    expect(suggestConformity(over.numeric, 1000, over.kind)).toBe(true);
    const none = parseLabValue("0(-1)");
    expect(suggestConformity(none.numeric, 100, none.kind)).toBe(true);
  });
});

describe("singleValueEntry — what a line read as one value stores", () => {
  it("stores the shorthand in the lab's notation, with the typed reading kept", () => {
    expect(singleValueEntry("3(-2)", 1)).toEqual({
      parsed: { numeric: 300, kind: "number" },
      value: "3.10²",
      rawValue: "3(-2)",
    });
    expect(singleValueEntry(" 0(-1) ", 1)).toEqual({ parsed: { numeric: 0, kind: "below" }, value: "< 10", rawValue: "0(-1)" });
    expect(singleValueEntry("0(-3)", 1).value).toBe("< 1.10³");
    expect(singleValueEntry("4(-1)", 1)).toMatchObject({ value: "40", rawValue: "4(-1)" });
  });

  it("applies a programmed factor once, to the shorthand as to any count", () => {
    const factored = singleValueEntry("3(-2)", 10);
    expect(factored).toEqual({ parsed: { numeric: 3000, kind: "number" }, value: "3.10³", rawValue: "3(-2)" });
    // The same final value as the count typed in full.
    expect(singleValueEntry("300", 10)).toEqual({ ...factored, rawValue: "300" });
    // No colony stays below the limit of detection, whatever the factor.
    expect(singleValueEntry("0(-1)", 10)).toEqual({ parsed: { numeric: 0, kind: "below" }, value: "< 10", rawValue: "0(-1)" });
  });

  it("rewrites a count or the bound of « > x » only under a factor, as before", () => {
    expect(singleValueEntry("> 300", 10)).toEqual({ parsed: { numeric: 3000, kind: "above" }, value: "> 3.10³", rawValue: "> 300" });
    expect(singleValueEntry("8,9.10²", 1)).toEqual({ parsed: { numeric: 890, kind: "number" }, value: "8,9.10²", rawValue: null });
    expect(singleValueEntry("> 3.10⁵", 1)).toMatchObject({ value: "> 3.10⁵", rawValue: null });
  });

  it("stores as typed, with no raw value, what neither rewrites", () => {
    for (const typed of ["Absence", "< 10", "Indénombrable", "voir cahier"]) {
      for (const factor of [1, 10]) {
        const entry = singleValueEntry(typed, factor);
        expect(entry.value, `${typed} ×${factor}`).toBe(typed);
        expect(entry.rawValue, `${typed} ×${factor}`).toBeNull();
      }
    }
  });

  it("stores nothing for an empty line", () => {
    expect(singleValueEntry("   ", 10)).toEqual({ parsed: { numeric: null, kind: "unreadable" }, value: null, rawValue: null });
  });
});

describe("isNotDoneText — « NE » is not a result (16/10, Q91)", () => {
  it("recognises « NE », « N.E. », « non effectué », « non fait » whatever the case, accents and dots", () => {
    for (const typed of [
      "NE",
      "ne",
      "N.E.",
      "n.e",
      "N E",
      "Non effectué",
      "NON EFFECTUE",
      "non effectuée",
      "non-effectué",
      "Non fait",
      "non faite",
      "Non réalisé",
      "pas fait",
      "  NE  ",
    ]) {
      expect(isNotDoneText(typed), typed).toBe(true);
    }
  });

  it("never mistakes a reading for it", () => {
    for (const typed of ["", "Absence", "ND", "Non détecté", "< 10", "3(-2)", "Néant", "Présence", "Indénombrable", "1,2.10²", "Nef", "Effectué"]) {
      expect(isNotDoneText(typed), typed).toBe(false);
    }
    expect(isNotDoneText(null)).toBe(false);
    expect(isNotDoneText(undefined)).toBe(false);
  });

  it("says who withdraws the analysis instead", () => {
    expect(NOT_DONE_MESSAGE).toBe("Une analyse non faite se retire du programme (responsable des paramètres).");
  });

  it("is refused by the results route as a single value and as a unit reading, and never submitted", () => {
    const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");
    const save = read("../app/api/samples/[id]/results/route.ts");
    expect(save).toContain("if (isNotDoneText(value)) return notDone(parameter.name, value);");
    expect(save).toContain("if (isNotDoneText(text)) return notDone(parameter.name, text);");
    expect(save).toMatch(/NOT_DONE_MESSAGE[^]*status: 400/);
    // A value saved before the refusal existed stays on the bench.
    expect(read("../app/api/samples/[id]/results/submit/route.ts")).toContain("isNotDoneText(result.rawValue ?? result.value)");
  });
});
