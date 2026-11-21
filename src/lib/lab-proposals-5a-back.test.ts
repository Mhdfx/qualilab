import { describe, expect, it, vi } from "vitest";

/**
 * The switches lot 5A set from the answers of 20/11 (RETOUR-LABO-20-11.md
 * §5), put back where they were before it (src/lib/lab-proposals.ts): J6
 * `SURFACE_JUDGED_WHATEVER_UNIT` and `SURFACE_UNIT_CHOSEN_AT_ENTRY` off, I10
 * `IDENTIFICATION_TO_VERIFY` off, J7 `COLLEAGUE_SAMPLES_HIDDEN` off, J8
 * `TAKE_LIST_BY_NUMBER` off, K11 `UNSENT_REPORT_CORRECTED_IN_PLACE` off.
 * Each must give back the behaviour of lot 4 exactly, through the rules' own
 * defaults — the way back the switches promise. The module is mocked, so the
 * pure rules read these values as the server and the screens would.
 */
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  SURFACE_JUDGED_WHATEVER_UNIT: false,
  SURFACE_UNIT_CHOSEN_AT_ENTRY: false,
  IDENTIFICATION_TO_VERIFY: false,
  COLLEAGUE_SAMPLES_HIDDEN: false,
  TAKE_LIST_BY_NUMBER: false,
  UNSENT_REPORT_CORRECTED_IN_PLACE: false,
}));

const { PLAIN_UNIT_CONTEXT, judgingLimit, surfaceUnitChoice, surfaceUnitChoices, unitJudges } = await import("./result-unit");
const { DEFAULT_COMPLEMENTARY_THRESHOLDS, complementaryChecklist, identificationHint } = await import("./reception-complementary");
const { proposedConformity } = await import("./reception-rules");
const { canReadAtBench, colleagueNamed, colleagueSampleHidden, colleaguesListed, takeRefusal, untakeRefusal, TAKE_MESSAGES } = await import("./bench-access");
const { takeOverRefusal } = await import("./take-over");
const { BENCH_ORDER, takeListDescription, takeListOrder } = await import("./bench-order");
const { correctionRefusal, CORRECTION_MESSAGES, pendingReportChange, reopenMode, unsentReopenWarning } = await import("./report-amendment");

const couteau = { ...PLAIN_UNIT_CONTEXT, lineKind: "SURFACE" as const, surfaceAreaNote: "couteau" };

describe("lot 5A — the switches back to lot 4", () => {
  it("J6 back: a surface described in words is « sans interprétation » against a criterion per cm²; its unit is computed", () => {
    expect(unitJudges(couteau, "UFC/cm²")).toBe(false);
    expect(judgingLimit(couteau, 100, "UFC/cm²")).toBeNull();
    expect(surfaceUnitChoices(couteau, "UFC/cm²")).toEqual([]);
    // A posted unit is ignored: the computed one is stored.
    expect(surfaceUnitChoice(couteau, "UFC/cm²", "UFC/100 cm²")).toEqual({ unit: "UFC/couteau" });
  });

  it("I10 back: C5 « Non » is non conforme again, « corriger la fiche avant de valider »", () => {
    const rows = complementaryChecklist({ lineKind: "ALIMENT", family: "MICRO" }, null, DEFAULT_COMPLEMENTARY_THRESHOLDS, {
      identificationOk: false,
    });
    expect(rows.find((row) => row.code === "C5")).toMatchObject({ status: "NON_CONFORME", reason: "IDENTIFICATION" });
    expect(proposedConformity(rows)).toMatchObject({ conformity: false, forced: true, code: "C5" });
    expect(identificationHint("ALIMENT", false)).toBe("Corriger la fiche avant de valider");
  });

  it("J7 back: the colleagues' samples are listed and open read-only, « Reprendre » is offered, « Libérer » waits for an empty sheet", () => {
    const held = { technicianId: "tech1", parameters: [] };
    expect(colleagueSampleHidden(held, "tech2")).toBe(false);
    expect(canReadAtBench({ ...held, status: "EN_ANALYSE" }, "tech2")).toBe(true);
    expect(colleaguesListed("TECHNICIEN")).toBe(true);
    const state = { status: "EN_ANALYSE" as const, analysisBlocked: false, technicianId: "tech1", holderName: "A", heldByParameter: false };
    expect(takeOverRefusal(state, { id: "tech2", role: "TECHNICIEN" })).toBeNull();
    expect(untakeRefusal(state, 2, { id: "adm", role: "ADMIN" })).toEqual({ status: 409, error: TAKE_MESSAGES.typed });
    // The refusals name the holder again.
    expect(colleagueNamed("A")).toBe("A");
    expect(takeRefusal(state, "tech2")).toEqual({ status: 409, error: "Déjà pris par A." });
    expect(untakeRefusal(state, 0, { id: "tech2", role: "TECHNICIEN" })?.error).toBe(TAKE_MESSAGES.notYours("A"));
  });

  it("J8 back: « À prendre » — the urgent first, then the oldest receptions", () => {
    expect(takeListOrder("serie")).toEqual(BENCH_ORDER);
    expect(takeListOrder("controle")).toEqual(BENCH_ORDER);
    expect(takeListDescription("serie")).toContain("les urgents d'abord");
  });

  it("K11 back: every reopening is an amendment; the dialog warns about a report never sent", () => {
    expect(reopenMode(false)).toBe("amend");
    expect(pendingReportChange(true, false)).toBe("amendment");
    expect(unsentReopenWarning("RAP-2026-00001", false)).toMatch(/Le client n'a jamais reçu RAP-2026-00001/);
    expect(
      correctionRefusal({ status: "VALIDE", role: "ADMIN", reason: "Erreur de lot", sent: false, amendmentPending: false })
    ).toBe(CORRECTION_MESSAGES.disabled);
  });
});
