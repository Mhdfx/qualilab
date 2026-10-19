import { describe, expect, it } from "vitest";
import type { SampleStatus } from "@/generated/prisma/enums";
import {
  isPortalStage,
  PORTAL_STAGE_LABELS,
  PORTAL_STAGES,
  portalStage,
  portalStageFilter,
  PORTAL_REPORT_NOT_YET,
  portalReportRefusal,
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

describe("portalReportRefusal", () => {
  it("serves a sent report that is not being amended", () => {
    expect(portalReportRefusal("RAPPORT_ENVOYE", { amendmentPending: false })).toBeNull();
  });

  it("says « pas encore » while the report may still come", () => {
    for (const status of ALL.filter((s) => s !== "RAPPORT_ENVOYE" && s !== "ANNULE")) {
      expect(portalReportRefusal(status, null)).toBe(PORTAL_REPORT_NOT_YET);
    }
    expect(portalReportRefusal("RAPPORT_ENVOYE", null)).toBe(PORTAL_REPORT_NOT_YET);
    expect(portalReportRefusal("RAPPORT_ENVOYE", { amendmentPending: true })).toBe(PORTAL_REPORT_NOT_YET);
  });

  it("keeps a validated report not yet sent at the laboratory: « En analyse », nothing to download (16/10, Q92)", () => {
    // « Valider » no longer sends: the sample stays VALIDE until « Envoyer au client ».
    expect(portalStage("VALIDE")).toBe("EN_ANALYSE");
    expect(PORTAL_STAGE_LABELS[portalStage("VALIDE")]).toBe("En analyse");
    expect(reportAvailableOnPortal("VALIDE")).toBe(false);
    expect(portalReportRefusal("VALIDE", { amendmentPending: false })).toBe(PORTAL_REPORT_NOT_YET);
  });

  it("never promises a report to a cancelled sample", () => {
    const refusal = portalReportRefusal("ANNULE", null);
    expect(refusal).toMatch(/annulé/);
    expect(refusal).not.toMatch(/pas encore/);
  });
});
