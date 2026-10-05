import { describe, expect, it } from "vitest";
import {
  BENCH_STATUSES,
  benchQueueWhereFor,
  benchTechnicianIds,
  benchWhereFor,
  canEditParameter,
  isOnBenchOf,
  parameterTechnicianId,
  splitParameters,
} from "./bench-access";

/**
 * PROGRAMME.md §6 — a technician works their own parameters and nobody
 * else's; a line never programmed keeps working exactly as before.
 */
const ecoli = { parameterId: "p-ecoli", technicianId: null };
const salmonella = { parameterId: "p-salm", technicianId: "tech2" };
const histamine = { parameterId: "p-hist", technicianId: "tech1" };

/** Micro to tech1 by default, salmonella handed to tech2. */
const shared = { technicianId: "tech1", parameters: [ecoli, salmonella, histamine] };
/** An old row: the reception assigned tech1, no per-parameter technician. */
const legacy = { technicianId: "tech1", parameters: [ecoli, { parameterId: "p-flore", technicianId: null }] };
/** Programmed without anybody yet. */
const unassigned = { technicianId: null, parameters: [ecoli] };

describe("parameterTechnicianId", () => {
  it("falls back to the sample's technician", () => {
    expect(parameterTechnicianId(shared, ecoli)).toBe("tech1");
    expect(parameterTechnicianId(shared, salmonella)).toBe("tech2");
    expect(parameterTechnicianId(unassigned, ecoli)).toBeNull();
  });
});

describe("canEditParameter", () => {
  it("lets the sample's technician edit the parameters without one of their own", () => {
    expect(canEditParameter(shared, ecoli, "tech1")).toBe(true);
    expect(canEditParameter(shared, histamine, "tech1")).toBe(true);
  });

  it("reserves a parameter handed to another technician", () => {
    expect(canEditParameter(shared, salmonella, "tech1")).toBe(false);
    expect(canEditParameter(shared, salmonella, "tech2")).toBe(true);
    expect(canEditParameter(shared, ecoli, "tech2")).toBe(false);
  });

  it("keeps an old row exactly as before: everything to the sample's technician", () => {
    for (const parameter of legacy.parameters) {
      expect(canEditParameter(legacy, parameter, "tech1")).toBe(true);
      expect(canEditParameter(legacy, parameter, "tech2")).toBe(false);
    }
  });

  it("lets nobody edit a parameter nobody holds", () => {
    expect(canEditParameter(unassigned, ecoli, "tech1")).toBe(false);
  });
});

describe("isOnBenchOf", () => {
  it("lists the line for the sample's technician and for a parameter's", () => {
    expect(isOnBenchOf(shared, "tech1")).toBe(true);
    expect(isOnBenchOf(shared, "tech2")).toBe(true);
  });

  it("hides it from a third technician, and from everyone when unassigned", () => {
    expect(isOnBenchOf(shared, "tech3")).toBe(false);
    expect(isOnBenchOf(unassigned, "tech1")).toBe(false);
  });
});

describe("splitParameters", () => {
  it("tells my parameters from the ones left to others", () => {
    const tech1 = splitParameters(shared, "tech1");
    expect(tech1.mine.map((p) => p.parameterId)).toEqual(["p-ecoli", "p-hist"]);
    expect(tech1.others.map((p) => p.parameterId)).toEqual(["p-salm"]);

    const tech2 = splitParameters(shared, "tech2");
    expect(tech2.mine.map((p) => p.parameterId)).toEqual(["p-salm"]);
    expect(tech2.others).toHaveLength(2);
  });
});

describe("benchTechnicianIds", () => {
  it("prints each technician once, the sample's first", () => {
    expect(benchTechnicianIds(shared)).toEqual(["tech1", "tech2"]);
    expect(benchTechnicianIds(legacy)).toEqual(["tech1"]);
    expect(benchTechnicianIds(unassigned)).toEqual([]);
  });

  it("lists a technician who only holds parameters", () => {
    expect(
      benchTechnicianIds({ technicianId: null, parameters: [salmonella, histamine, salmonella] })
    ).toEqual(["tech2", "tech1"]);
  });
});

describe("benchWhereFor", () => {
  it("narrows a technician to the lines they hold or share", () => {
    expect(benchWhereFor({ id: "tech1", role: "TECHNICIEN" })).toEqual({
      OR: [{ technicianId: "tech1" }, { parameters: { some: { technicianId: "tech1" } } }],
    });
  });

  it("leaves the other admitted roles the whole bench", () => {
    expect(benchWhereFor({ id: "a1", role: "ADMIN" })).toEqual({});
    expect(benchWhereFor({ id: "v1", role: "VALIDATEUR" })).toEqual({});
    expect(benchWhereFor({ id: "p1", role: "PROGRAMMATEUR" })).toEqual({});
  });

  it("puts only programmed and running lines on the bench", () => {
    expect(BENCH_STATUSES).toEqual(["PROGRAMME", "EN_ANALYSE"]);
    expect(benchQueueWhereFor({ id: "a1", role: "ADMIN" })).toEqual({
      status: { in: ["PROGRAMME", "EN_ANALYSE"] },
    });
    const mine = benchQueueWhereFor({ id: "tech1", role: "TECHNICIEN" });
    expect(mine.status).toEqual({ in: ["PROGRAMME", "EN_ANALYSE"] });
    expect(mine.OR).toHaveLength(2);
  });
});
