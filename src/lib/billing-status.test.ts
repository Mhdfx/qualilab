import { describe, expect, it } from "vitest";
import { BILLABLE_STATUSES, billedBeforeResult } from "./billing-status";

/**
 * PROGRAMME.md §6 — the invoice may be prepared as soon as the programme is
 * confirmed, and a cancelled line must never be proposed to the accountant.
 */
describe("BILLABLE_STATUSES", () => {
  it("opens billing at the confirmed programme", () => {
    expect(BILLABLE_STATUSES).toContain("PROGRAMME");
    expect(BILLABLE_STATUSES).toContain("EN_ANALYSE");
    expect(BILLABLE_STATUSES).toContain("RESULTATS_SAISIS");
    expect(BILLABLE_STATUSES).toContain("VALIDE");
    expect(BILLABLE_STATUSES).toContain("RAPPORT_ENVOYE");
  });

  it("never bills a cancelled line, nor one nothing was decided on", () => {
    expect(BILLABLE_STATUSES).not.toContain("ANNULE");
    expect(BILLABLE_STATUSES).not.toContain("RECU");
    expect(BILLABLE_STATUSES).not.toContain("PRELEVE");
  });
});

describe("billedBeforeResult", () => {
  it("flags a line invoiced before its results are validated", () => {
    expect(billedBeforeResult("PROGRAMME")).toBe(true);
    expect(billedBeforeResult("EN_ANALYSE")).toBe(true);
    expect(billedBeforeResult("RESULTATS_SAISIS")).toBe(true);
  });

  it("is silent once the results are validated", () => {
    expect(billedBeforeResult("VALIDE")).toBe(false);
    expect(billedBeforeResult("RAPPORT_ENVOYE")).toBe(false);
  });
});
