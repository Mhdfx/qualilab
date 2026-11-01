import { describe, expect, it, vi } from "vitest";

// Switch J3 off (`NO_CRITERION_NO_INTERPRETATION`): the bench judges every
// line again, so a sensitive parameter must carry a limit to alert — the
// pre-lot-3 refusal comes back (RETOUR-LABO-28-10.md §5 S3).
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  NO_CRITERION_NO_INTERPRETATION: false,
}));

const { validateParameter, sensitiveNeedsLimit } = await import("./parameter-validation");
const { contaminationAlertPlan } = await import("./contamination-alert-analyses");

describe("switch J3 off", () => {
  it("refuses a sensitive parameter without a limit", () => {
    expect(sensitiveNeedsLimit()).toBe(true);
    const result = validateParameter({ name: "Salmonella", category: "ALIMENTAIRE", unit: "/25 g", limitValue: "", alertOnExceed: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("limite");
  });

  it("the S3 plan gives a detection without a limit the limit 0 with its flag", () => {
    const plan = contaminationAlertPlan(
      [{ id: "s", name: "Salmonella", family: "MICRO", category: "ALIMENTAIRE", alertOnExceed: false, unit: "/25 g", limitValue: null }],
      "NONE"
    );
    expect(plan.toSet.map((r) => r.patch)).toEqual([{ alertOnExceed: true, limitValue: 0 }]);
  });
});
