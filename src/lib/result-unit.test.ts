import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_RESULT_UNIT,
  MAX_SURFACE_OBJECT,
  PLAIN_UNIT_CONTEXT,
  SURFACE_UNIT_MESSAGES,
  SURFACE_UNIT_PER_AREA,
  airUnitText,
  judgingLimit,
  judgingThreshold,
  resultUnit,
  surfaceObjectOf,
  surfaceUnitChoice,
  surfaceUnitChoices,
  surfaceUnitEditable,
  unitJudges,
  type UnitContext,
} from "./result-unit";
import { SURFACE_JUDGED_WHATEVER_UNIT, SURFACE_UNIT_CHOSEN_AT_ENTRY, UNIT_MISMATCH_NOT_JUDGED } from "./lab-proposals";

const surface = (note: string | null): UnitContext => ({ ...PLAIN_UNIT_CONTEXT, lineKind: "SURFACE", surfaceAreaNote: note });
const bio: UnitContext = { ...PLAIN_UNIT_CONTEXT, lineKind: "AIR", airMethod: "BIOCOLLECTEUR" };
const plate = (minutes: number | null): UnitContext => ({
  ...PLAIN_UNIT_CONTEXT,
  lineKind: "AIR",
  airMethod: "BOITE_EXPOSEE_30MIN",
  airExposureMin: minutes,
});

describe("J1 — a surface described in words: « UFC/<surface> » (28/10, 2.3)", () => {
  it("rewrites the count units of the catalogue (« UFC/cm² », « /cm² », « ufc/boite »…)", () => {
    for (const unit of ["UFC/cm²", "ufc/cm2", "UFC/25cm²", "/cm²", "UFC", "ufc/g"]) {
      expect(resultUnit(surface("couteau"), unit), unit).toBe("UFC/couteau");
    }
    expect(resultUnit(surface("  poignée de porte  "), "UFC/cm²")).toBe("UFC/poignée de porte");
  });

  it("leaves a unit that is no count, and a surface given in cm²", () => {
    for (const unit of ["/25 g", "%", "-", null]) {
      expect(resultUnit(surface("couteau"), unit), String(unit)).toBe(unit);
    }
    expect(resultUnit(surface(null), "UFC/cm²")).toBe("UFC/cm²");
    expect(resultUnit(surface("   "), "UFC/cm²")).toBe("UFC/cm²");
  });

  it("fits `Result.unit` VARCHAR(191) even for a surface described in 191 characters", () => {
    expect(MAX_RESULT_UNIT).toBe(191);
    for (const length of [186, 187, 188, 191]) {
      const note = "é".repeat(length);
      const unit = resultUnit(surface(note), "UFC/cm²") ?? "";
      expect(Array.from(unit).length, String(length)).toBeLessThanOrEqual(MAX_RESULT_UNIT);
      expect(unit.startsWith("UFC/éé")).toBe(true);
    }
    // 187 characters still fit whole; beyond, the end gives way to « … ».
    expect(resultUnit(surface("a".repeat(187)), "UFC/cm²")).toBe(`UFC/${"a".repeat(187)}`);
    expect(resultUnit(surface("a".repeat(191)), "UFC/cm²")).toBe(`UFC/${"a".repeat(186)}…`);
    // A character outside the BMP is never cut in half.
    const emoji = resultUnit(surface("🧪".repeat(191)), "UFC/cm²") ?? "";
    expect(Array.from(emoji)).toHaveLength(MAX_RESULT_UNIT);
    expect(emoji).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
  });

  it("only a SURFACE line: hands and foods keep their unit", () => {
    expect(resultUnit({ ...surface("couteau"), lineKind: "MAINS" }, "UFC/mains")).toBe("UFC/mains");
    expect(resultUnit({ ...surface("couteau"), lineKind: "ALIMENT" }, "UFC/g")).toBe("UFC/g");
  });

  it("lot 3B (J6 off): a criterion or a limit per cm² cannot judge it — sans interprétation (J3)", () => {
    const lot3b = (context: UnitContext, unit: string | null) => unitJudges(context, unit, true, false);
    expect(lot3b(surface("couteau"), "UFC/cm²")).toBe(false);
    expect(lot3b(surface("couteau"), "/25cm²")).toBe(false);
    // A presence test, or a count per object, still judges.
    expect(lot3b(surface("couteau"), "/25 g")).toBe(true);
    expect(lot3b(surface("couteau"), "UFC/surface")).toBe(true);
    expect(lot3b(surface("couteau"), null)).toBe(true);
    // A surface in cm² is judged by its criteria as before.
    expect(lot3b(surface(null), "UFC/cm²")).toBe(true);
  });

  it("lot 5A, J6 (a) — C-1 of 20/11: a surface is judged by its value whatever the unit", () => {
    expect(SURFACE_JUDGED_WHATEVER_UNIT).toBe(true);
    // « 120 UFC/couteau » against « ≤ 100 UFC/100 cm² »: the limit judges it (non conforme).
    expect(unitJudges(surface("couteau"), "UFC/cm²")).toBe(true);
    expect(unitJudges(surface("couteau"), "UFC/100 cm²")).toBe(true);
    expect(unitJudges(surface("couteau"), "/25cm²")).toBe(true);
    expect(judgingLimit(surface("couteau"), 100, "UFC/cm²")).toBe(100);
    expect(judgingThreshold(surface("couteau"), "≤ 100 UFC/cm²", "UFC/cm²")).toBe("≤ 100 UFC/cm²");
    expect(judgingLimit(surface(null), 100, "UFC/cm²")).toBe(100);
    // The air keeps the rule of lot 3B (hypothèse D-4).
    expect(unitJudges(plate(30), "ufc/m3")).toBe(false);
    expect(unitJudges(bio, "UFC/cm²")).toBe(false);
  });
});

describe("J6 (b) — the unit of a surface, chosen at entry (C-1 of 20/11)", () => {
  it("is on by default; only a SURFACE line counted in UFC offers the choice", () => {
    expect(SURFACE_UNIT_CHOSEN_AT_ENTRY).toBe(true);
    expect(surfaceUnitEditable(surface("couteau"), "UFC/cm²")).toBe(true);
    expect(surfaceUnitEditable(surface(null), "UFC/cm²")).toBe(true);
    expect(surfaceUnitEditable(surface("couteau"), "/25 g")).toBe(false);
    expect(surfaceUnitEditable(surface("couteau"), null)).toBe(false);
    expect(surfaceUnitEditable({ ...surface("couteau"), lineKind: "MAINS" }, "UFC/mains")).toBe(false);
    expect(surfaceUnitEditable(bio, "UFC/m³")).toBe(false);
    expect(surfaceUnitEditable(surface("couteau"), "UFC/cm²", false)).toBe(false);
  });

  it("proposes the computed unit first, « UFC/100 cm² », « UFC/<objet> » and the criterion's, never twice", () => {
    expect(SURFACE_UNIT_PER_AREA).toBe("UFC/100 cm²");
    expect(surfaceUnitChoices(surface("couteau"), "UFC/cm²")).toEqual(["UFC/couteau", "UFC/100 cm²", "UFC/cm²"]);
    expect(surfaceUnitChoices(surface(null), "UFC/100 cm²")).toEqual(["UFC/100 cm²"]);
    expect(surfaceUnitChoices(surface(null), "UFC/25 cm²")).toEqual(["UFC/25 cm²", "UFC/100 cm²"]);
    expect(surfaceUnitChoices(surface("couteau"), "/25 g")).toEqual([]);
  });

  it("cuts the object prefilled from the description to 60 characters", () => {
    expect(MAX_SURFACE_OBJECT).toBe(60);
    expect(surfaceObjectOf(surface("  poignée   de porte "))).toBe("poignée de porte");
    expect(Array.from(surfaceObjectOf(surface("é".repeat(100))))).toHaveLength(60);
    expect(surfaceObjectOf(surface(null))).toBe("");
  });

  it("stores the unit chosen, else the computed one", () => {
    const couteau = surface("couteau");
    // Nothing posted: the computed unit, as before lot 5A.
    expect(surfaceUnitChoice(couteau, "UFC/cm²", undefined)).toEqual({ unit: "UFC/couteau" });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "")).toEqual({ unit: "UFC/couteau" });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", null)).toEqual({ unit: "UFC/couteau" });
    // One of the choices, whatever the case and the spaces.
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "ufc/100   cm²")).toEqual({ unit: "UFC/100 cm²" });
    // Another object.
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "UFC/ planche à découper ")).toEqual({ unit: "UFC/planche à découper" });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", `UFC/${"a".repeat(60)}`)).toEqual({ unit: `UFC/${"a".repeat(60)}` });
  });

  it("« autre objet » left empty posts a bare « UFC/ »: the computed unit, as the sheet shows it — never a 400 (review of lot 5A)", () => {
    const couteau = surface("couteau");
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "UFC/")).toEqual({ unit: "UFC/couteau" });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", " ufc / ")).toEqual({ unit: "UFC/couteau" });
    expect(surfaceUnitChoice(surface(null), "UFC/cm²", "UFC/")).toEqual({ unit: "UFC/cm²" });
    // Still refused where no unit is chosen: a line whose unit is computed.
    expect(surfaceUnitChoice(PLAIN_UNIT_CONTEXT, "UFC/g", "UFC/")).toEqual({ error: SURFACE_UNIT_MESSAGES.notChoosable });
  });

  it("refuses an invalid unit, or one posted on a line whose unit is computed (the route's 400)", () => {
    const couteau = surface("couteau");
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "mg/L")).toEqual({ error: SURFACE_UNIT_MESSAGES.invalid });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", `UFC/${"a".repeat(61)}`)).toEqual({ error: SURFACE_UNIT_MESSAGES.invalid });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", 12)).toEqual({ error: SURFACE_UNIT_MESSAGES.invalid });
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "UFC/a\u0000b")).toEqual({ error: SURFACE_UNIT_MESSAGES.invalid });
    expect(surfaceUnitChoice(PLAIN_UNIT_CONTEXT, "UFC/g", "UFC/100 cm²")).toEqual({ error: SURFACE_UNIT_MESSAGES.notChoosable });
    expect(surfaceUnitChoice(bio, "UFC/m³", "UFC/100 cm²")).toEqual({ error: SURFACE_UNIT_MESSAGES.notChoosable });
    // Switch off: a posted unit is ignored, the computed one is stored.
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "UFC/100 cm²", false)).toEqual({ unit: "UFC/couteau" });
    expect(surfaceUnitChoice(PLAIN_UNIT_CONTEXT, "UFC/g", "UFC/100 cm²", false)).toEqual({ unit: "UFC/g" });
  });

  it("the choice never changes the verdict: the limit judges the surface whatever unit is chosen", () => {
    for (const chosen of ["UFC/100 cm²", "UFC/couteau", "UFC/poignée"]) {
      expect(surfaceUnitChoice(surface("couteau"), "UFC/cm²", chosen)).not.toHaveProperty("error");
      expect(judgingLimit(surface("couteau"), 100, "UFC/cm²")).toBe(100);
    }
  });
});

describe("J2 — the air's unit by its sampling means (28/10, 2.17, Q50)", () => {
  it("biocollecteur: « UFC/m³ »; exposed plate: « UFC/boîte (exposée N min) », 30 by default", () => {
    expect(airUnitText("BIOCOLLECTEUR")).toBe("UFC/m³");
    expect(airUnitText("BOITE_EXPOSEE_30MIN", 45)).toBe("UFC/boîte (exposée 45 min)");
    expect(airUnitText("BOITE_EXPOSEE_30MIN", null)).toBe("UFC/boîte (exposée 30 min)");
    expect(resultUnit(bio, "ufc/m3")).toBe("UFC/m³");
    expect(resultUnit(bio, "UFC/cm²")).toBe("UFC/m³");
    expect(resultUnit(plate(15), "ufc/boite")).toBe("UFC/boîte (exposée 15 min)");
    expect(resultUnit(plate(null), "ufc/Boite")).toBe("UFC/boîte (exposée 30 min)");
  });

  it("an air line entered before the method existed keeps its unit; « mg/m³ » is no count", () => {
    expect(resultUnit({ ...PLAIN_UNIT_CONTEXT, lineKind: "AIR" }, "UFC/m³")).toBe("UFC/m³");
    expect(resultUnit(bio, "mg/m3")).toBe("mg/m3");
    expect(unitJudges(plate(30), "mg/m3")).toBe(true);
  });

  it("a criterion per m³ never judges an exposed plate, nor one per plate a biocollecteur", () => {
    expect(unitJudges(plate(30), "ufc/m3")).toBe(false);
    expect(unitJudges(plate(30), "UFC/m³")).toBe(false);
    expect(unitJudges(plate(30), "ufc/boite")).toBe(true);
    expect(unitJudges(bio, "ufc/Boite")).toBe(false);
    expect(unitJudges(bio, "ufc/m3")).toBe(true);
    // Per area: never the air's basis.
    expect(unitJudges(bio, "UFC/cm²")).toBe(false);
    expect(unitJudges(plate(30), "UFC/cm²")).toBe(false);
    expect(judgingLimit(plate(30), 50, "ufc/m3")).toBeNull();
    expect(judgingLimit(bio, 50, "ufc/m3")).toBe(50);
  });

  it("foods, waters and every other line: nothing changes", () => {
    for (const unit of ["UFC/g", "UFC/100 mL", "/25 g", "ufc", null]) {
      expect(resultUnit(PLAIN_UNIT_CONTEXT, unit)).toBe(unit);
      expect(unitJudges(PLAIN_UNIT_CONTEXT, unit)).toBe(true);
    }
  });
});

describe("UNIT_MISMATCH_NOT_JUDGED — setting a criterion aside is a hypothèse (R-29), behind a switch", () => {
  it("is on by default", () => {
    expect(UNIT_MISMATCH_NOT_JUDGED).toBe(true);
  });

  it("off: every criterion and limit judges again, as before lot 3B — the unit printed stays J1 / J2's", () => {
    expect(unitJudges(surface("couteau"), "UFC/cm²", false, false)).toBe(true);
    expect(unitJudges(plate(30), "ufc/m3", false)).toBe(true);
    expect(unitJudges(bio, "ufc/Boite", false)).toBe(true);
    expect(resultUnit(surface("couteau"), "UFC/cm²")).toBe("UFC/couteau");
  });
});

describe("one unit everywhere: the save, the bench, its sheet and the submission read it alike", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("the save stores the derived — or, on a surface, chosen — unit on all three paths, and judges with the judging limit only", () => {
    const route = read("../app/api/samples/[id]/results/route.ts");
    expect(route).toContain("const unitChoice = surfaceUnitChoice(bench.context, baseUnit, raw.unit);");
    // The one unit, on the three entries (per unit with a plan, per unit without, single value).
    expect(route.match(/^\s+unit,$/gm)).toHaveLength(3);
    expect(route).not.toMatch(/unit: resultUnit\(/);
    expect(route).toContain("limitValue: judgingLimit(bench.context, line.parameter.limitValue, line.parameter.unit),");
  });

  it("the submission checks the same limit as the save", () => {
    expect(read("../app/api/samples/[id]/results/submit/route.ts")).toContain(
      "judgingLimit(context, parameter.limitValue, parameter.unit)"
    );
  });

  it("the bench screen and the printed sheet show the stored unit", () => {
    expect(read("../app/technicien/[id]/page.tsx")).toContain("const unitChoices = surfaceUnitChoices(bench.context, baseUnit);");
    expect(read("../app/api/bench-sheet/route.ts")).toContain(
      "unit: stored && surfaceUnitEditable(bench.context, base) ? stored : resultUnit(bench.context, base),"
    );
  });

  it("the save rejects a unit it cannot store, line by line, in French (400)", () => {
    const route = read("../app/api/samples/[id]/results/route.ts");
    expect(route).toContain('if ("error" in unitChoice) {');
    expect(route).toContain("return NextResponse.json({ error: `${parameter.name} : ${unitChoice.error}`, parameterId }, { status: 400 });");
    // Journalled: the unit before → after, where the save changes it.
    expect(route).toContain("...(Object.keys(written.unitChanges).length > 0 ? { units: written.unitChanges } : {}),");
  });

  it("the criteria loaded for the bench drop those expressed per another basis", () => {
    expect(read("./bench-plan.ts")).toContain("if (!unitJudges(context, criterion.unit ?? criterion.parameter.unit)) continue;");
  });
});
