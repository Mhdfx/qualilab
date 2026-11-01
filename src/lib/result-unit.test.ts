import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PLAIN_UNIT_CONTEXT,
  airUnitText,
  judgingLimit,
  judgingThreshold,
  resultUnit,
  unitJudges,
  type UnitContext,
} from "./result-unit";

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

  it("only a SURFACE line: hands and foods keep their unit", () => {
    expect(resultUnit({ ...surface("couteau"), lineKind: "MAINS" }, "UFC/mains")).toBe("UFC/mains");
    expect(resultUnit({ ...surface("couteau"), lineKind: "ALIMENT" }, "UFC/g")).toBe("UFC/g");
  });

  it("a criterion or a limit per cm² cannot judge it — sans interprétation (J3)", () => {
    expect(unitJudges(surface("couteau"), "UFC/cm²")).toBe(false);
    expect(unitJudges(surface("couteau"), "/25cm²")).toBe(false);
    expect(judgingLimit(surface("couteau"), 100, "UFC/cm²")).toBeNull();
    expect(judgingThreshold(surface("couteau"), "≤ 100 UFC/cm²", "UFC/cm²")).toBeNull();
    // A presence test, or a count per object, still judges.
    expect(unitJudges(surface("couteau"), "/25 g")).toBe(true);
    expect(unitJudges(surface("couteau"), "UFC/surface")).toBe(true);
    expect(unitJudges(surface("couteau"), null)).toBe(true);
    // A surface in cm² is judged by its criteria as before.
    expect(judgingLimit(surface(null), 100, "UFC/cm²")).toBe(100);
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

describe("one unit everywhere: the save, the bench, its sheet and the submission read it alike", () => {
  const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8");

  it("the save stores the derived unit on all three paths, and judges with the judging limit only", () => {
    const route = read("../app/api/samples/[id]/results/route.ts");
    expect(route).toContain("unit: resultUnit(bench.context, benchUnit(plan, parameter.unit)),");
    expect(route.match(/unit: resultUnit\(bench\.context, parameter\.unit\),/g)).toHaveLength(2);
    expect(route).toContain("limitValue: judgingLimit(bench.context, line.parameter.limitValue, line.parameter.unit),");
  });

  it("the submission checks the same limit as the save", () => {
    expect(read("../app/api/samples/[id]/results/submit/route.ts")).toContain(
      "judgingLimit(context, parameter.limitValue, parameter.unit)"
    );
  });

  it("the bench screen and the printed sheet show the stored unit", () => {
    expect(read("../app/technicien/[id]/page.tsx")).toContain("unit: resultUnit(bench.context, benchUnit(plan, parameter.unit)),");
    expect(read("../app/api/bench-sheet/route.ts")).toContain("unit: resultUnit(bench.context, benchUnit(plan, parameter.unit)),");
  });

  it("the criteria loaded for the bench drop those expressed per another basis", () => {
    expect(read("./bench-plan.ts")).toContain("if (!unitJudges(context, criterion.unit ?? criterion.parameter.unit)) continue;");
  });
});
