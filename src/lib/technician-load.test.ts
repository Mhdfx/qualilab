import { describe, expect, it } from "vitest";
import {
  benchHoldWarning,
  benchLoadByTechnician,
  leavesBench,
  NO_LOAD,
  technicianLoadText,
  type BenchLoadSample,
} from "./technician-load";

/**
 * PROGRAMME.md §10 — prise en charge libre: a technician holds what they
 * took, plus the lines a legacy programme handed them parameter by
 * parameter, with the bench's own rule (a parameter's technician, else the
 * sample's) and the dashboards' « En retard » rule. The admin's « Paillasse —
 * qui tient quoi » reads it; an account leaving the bench with samples still
 * taken is a warning, never a refusal.
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
  it("counts the taken lines, their parameters (the holder's), and the late ones", () => {
    const loads = benchLoadByTechnician(
      [line(), line({ status: "EN_ANALYSE", dueAt: yesterday }), line({ dueAt: null, parameters: [] })],
      now
    );
    expect(loads).toEqual({ tech1: { samples: 3, parameters: 4, late: 1 } });
  });

  it("a free line (« À prendre ») is nobody's load", () => {
    expect(benchLoadByTechnician([line({ technicianId: null }), line({ technicianId: null, dueAt: yesterday })], now)).toEqual({});
  });

  it("a legacy line handed parameter by parameter is on each holder's bench", () => {
    const loads = benchLoadByTechnician(
      [line({ dueAt: yesterday, parameters: [{ technicianId: null }, { technicianId: "tech2" }, { technicianId: "tech2" }] })],
      now
    );
    expect(loads).toEqual({
      tech1: { samples: 1, parameters: 1, late: 1 },
      tech2: { samples: 1, parameters: 2, late: 1 },
    });
  });

  it("a legacy line nobody took belongs only to its parameters' technicians", () => {
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

describe("technicianLoadText", () => {
  it("says what is taken, singular and plural, the delay only when some are late", () => {
    expect(technicianLoadText({ samples: 3, parameters: 12, late: 1 })).toBe("3 échantillons pris · dont 1 en retard");
    expect(technicianLoadText({ samples: 12, parameters: 40, late: 3 })).toBe("12 échantillons pris · dont 3 en retard");
    expect(technicianLoadText({ samples: 1, parameters: 1, late: 0 })).toBe("1 échantillon pris");
    expect(technicianLoadText({ samples: 1, parameters: 2, late: 1 })).toBe("1 échantillon pris · dont 1 en retard");
    expect(technicianLoadText(NO_LOAD)).toBe("Aucun échantillon pris");
  });
});

describe("leavesBench / benchHoldWarning — an account leaving the bench", () => {
  const technician = { role: "TECHNICIEN", banned: false };

  it("leaves when disabled now, or when no longer a technician", () => {
    expect(leavesBench(technician, { role: "TECHNICIEN", banned: true })).toBe(true);
    expect(leavesBench(technician, { role: "VALIDATEUR", banned: false })).toBe(true);
    expect(leavesBench(technician, { role: "VALIDATEUR", banned: true })).toBe(true);
    // Any account disabled is checked — a former technician may still hold
    // samples; the count of what it holds decides whether to warn.
    expect(leavesBench({ role: "VALIDATEUR", banned: null }, { role: "VALIDATEUR", banned: true })).toBe(true);
  });

  it("stays when nothing changes for the bench", () => {
    expect(leavesBench(technician, technician)).toBe(false);
    // Already disabled: the warning was given when it was.
    expect(leavesBench({ role: "TECHNICIEN", banned: true }, { role: "TECHNICIEN", banned: true })).toBe(false);
    // Re-enabled, or becoming a technician: back on the bench, not off it.
    expect(leavesBench({ role: "TECHNICIEN", banned: true }, technician)).toBe(false);
    expect(leavesBench({ role: "VALIDATEUR", banned: false }, technician)).toBe(false);
  });

  it("warns with the count, singular and plural, and says nothing when nothing is held", () => {
    expect(benchHoldWarning(0)).toBeNull();
    expect(benchHoldWarning(-1)).toBeNull();
    expect(benchHoldWarning(1)).toBe(
      "Ce technicien tient encore 1 échantillon à la paillasse : libérez-le depuis la paillasse (s'il n'a aucun résultat) ou terminez-le en tant qu'administrateur."
    );
    expect(benchHoldWarning(3)).toBe(
      "Ce technicien tient encore 3 échantillons à la paillasse : libérez-les depuis la paillasse (s'ils n'ont aucun résultat) ou terminez-les en tant qu'administrateur."
    );
  });
});
