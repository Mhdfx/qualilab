import { describe, expect, it } from "vitest";
import type { SampleStatus } from "@/generated/prisma/enums";
import {
  isPortalStage,
  PORTAL_STAGE_LABELS,
  PORTAL_STAGES,
  portalStage,
  portalStageFilter,
  reportAvailableOnPortal,
} from "./portal-status";

/** PORTAIL.md §2 — a client sees four states, never the laboratory's internal steps. */

const ALL: SampleStatus[] = [
  "PRELEVE",
  "RECU",
  "PROGRAMME",
  "EN_ANALYSE",
  "RESULTATS_SAISIS",
  "VALIDE",
  "RAPPORT_ENVOYE",
  "ANNULE",
];

describe("portalStage", () => {
  it("shows nothing of the bench or the validation before the report is sent", () => {
    for (const status of ["PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS", "VALIDE"] as const) {
      expect(portalStage(status)).toBe("EN_ANALYSE");
    }
  });

  it("reads the other statuses", () => {
    expect(portalStage("PRELEVE")).toBe("RECU");
    expect(portalStage("RECU")).toBe("RECU");
    expect(portalStage("RAPPORT_ENVOYE")).toBe("RAPPORT_DISPONIBLE");
    expect(portalStage("ANNULE")).toBe("ANNULE");
  });

  it("labels each state in French", () => {
    expect(PORTAL_STAGES.map((stage) => PORTAL_STAGE_LABELS[stage])).toEqual([
      "Reçu",
      "En analyse",
      "Rapport disponible",
      "Annulé",
    ]);
  });
});

describe("portalStageFilter", () => {
  it("gives the statuses behind each state", () => {
    expect(portalStageFilter("RAPPORT_DISPONIBLE")).toEqual(["RAPPORT_ENVOYE"]);
    expect(portalStageFilter("RECU").sort()).toEqual(["PRELEVE", "RECU"]);
    expect(portalStageFilter("ANNULE")).toEqual(["ANNULE"]);
  });

  it("covers every status exactly once across the four states", () => {
    const covered = PORTAL_STAGES.flatMap((stage) => portalStageFilter(stage));
    expect(covered.sort()).toEqual([...ALL].sort());
    for (const status of ALL) expect(portalStageFilter(portalStage(status))).toContain(status);
  });
});

describe("guards", () => {
  it("recognises a state from a query string", () => {
    expect(isPortalStage("EN_ANALYSE")).toBe(true);
    expect(isPortalStage("VALIDE")).toBe(false);
    expect(isPortalStage(undefined)).toBe(false);
  });

  it("offers the report only once sent", () => {
    for (const status of ALL) expect(reportAvailableOnPortal(status)).toBe(status === "RAPPORT_ENVOYE");
  });
});
