import { describe, expect, it } from "vitest";
import {
  benchLoadByTechnician,
  NO_LOAD,
  technicianLoadLabel,
  technicianLoadText,
  type BenchLoadSample,
} from "./technician-load";

/**
 * finalversion.md — attribution « avec visibilité sur la charge de chacun »:
 * the load counts what is on each bench now, with the bench's own rule
 * (a parameter's technician, else the sample's) and the dashboards' « En
 * retard » rule.
 */
const now = new Date("2026-10-10T12:00:00Z");
const yesterday = new Date("2026-10-09T12:00:00Z");
const tomorrow = new Date("2026-10-11T12:00:00Z");

const line = (overrides: Partial<BenchLoadSample> = {}): BenchLoadSample => ({
  technicianId: "tech1",
  status: "PROGRAMME",
  dueAt: tomorrow,
  parameters: [{ technicianId: null }, { technicianId: null }],
  ...overrides,
});

describe("benchLoadByTechnician", () => {
  it("counts the lines, the parameters that fall back to the sample's technician, and the late ones", () => {
    const loads = benchLoadByTechnician(
      [line(), line({ status: "EN_ANALYSE", dueAt: yesterday }), line({ dueAt: null, parameters: [] })],
      now
    );
    expect(loads).toEqual({ tech1: { samples: 3, parameters: 4, late: 1 } });
  });

  it("a parameter handed to another technician puts the line on both benches", () => {
    const loads = benchLoadByTechnician(
      [line({ dueAt: yesterday, parameters: [{ technicianId: null }, { technicianId: "tech2" }, { technicianId: "tech2" }] })],
      now
    );
    expect(loads).toEqual({
      tech1: { samples: 1, parameters: 1, late: 1 },
      tech2: { samples: 1, parameters: 2, late: 1 },
    });
  });

  it("a line with no default technician belongs only to its parameters' technicians", () => {
    const loads = benchLoadByTechnician(
      [line({ technicianId: null, parameters: [{ technicianId: "tech2" }, { technicianId: null }] })],
      now
    );
    expect(loads).toEqual({ tech2: { samples: 1, parameters: 1, late: 0 } });
  });

  it("ignores the lines that are not at the bench", () => {
    const loads = benchLoadByTechnician(
      [
        line({ status: "RECU", dueAt: yesterday }),
        line({ status: "RESULTATS_SAISIS", dueAt: yesterday }),
        line({ status: "VALIDE" }),
        line({ status: "ANNULE" }),
      ],
      now
    );
    expect(loads).toEqual({});
  });

  it("a promised date not yet passed is not late", () => {
    expect(benchLoadByTechnician([line({ dueAt: now })], now).tech1.late).toBe(0);
    expect(benchLoadByTechnician([line({ dueAt: new Date(now.getTime() - 1) })], now).tech1.late).toBe(1);
  });

  it("does not share its counters between technicians", () => {
    const loads = benchLoadByTechnician([line(), line({ technicianId: "tech2" })], now);
    expect(loads.tech1).not.toBe(loads.tech2);
    expect(NO_LOAD).toEqual({ samples: 0, parameters: 0, late: 0 });
  });
});

describe("technicianLoadLabel / technicianLoadText", () => {
  it("names the technician with their load, the delay only when some are late", () => {
    expect(technicianLoadLabel("Technicien Test", { samples: 12, parameters: 40, late: 3 })).toBe(
      "Technicien Test — 12 éch. · 3 en retard"
    );
    expect(technicianLoadLabel("Technicien Test", { samples: 12, parameters: 40, late: 0 })).toBe("Technicien Test — 12 éch.");
    expect(technicianLoadLabel("Technicien Test", NO_LOAD)).toBe("Technicien Test — 0 éch.");
    expect(technicianLoadLabel("Technicien Test")).toBe("Technicien Test");
    expect(technicianLoadLabel("Technicien Test", null)).toBe("Technicien Test");
  });

  it("says the load in words, singular and plural", () => {
    expect(technicianLoadText({ samples: 12, parameters: 40, late: 3 })).toBe(
      "12 échantillons programmés ou en analyse · 40 paramètres · dont 3 en retard"
    );
    expect(technicianLoadText({ samples: 1, parameters: 1, late: 0 })).toBe(
      "1 échantillon programmé ou en analyse · 1 paramètre"
    );
    expect(technicianLoadText(NO_LOAD)).toBe("Aucun échantillon programmé ou en analyse");
  });
});
