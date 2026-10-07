import { describe, expect, it } from "vitest";
import { invoiceNotices, sampleBillingNotice } from "./invoice-notices";

/**
 * PROGRAMME.md §6 — the invoice says when it was issued before the result,
 * and when a billed line was cancelled afterwards.
 */
describe("sampleBillingNotice", () => {
  it("flags a billed line whose results are not validated yet", () => {
    expect(sampleBillingNotice("PROGRAMME")).toBe("BEFORE_RESULT");
    expect(sampleBillingNotice("EN_ANALYSE")).toBe("BEFORE_RESULT");
    expect(sampleBillingNotice("RESULTATS_SAISIS")).toBe("BEFORE_RESULT");
  });

  it("flags a line cancelled after it was billed", () => {
    expect(sampleBillingNotice("ANNULE")).toBe("CANCELLED");
  });

  it("says nothing once the results are validated", () => {
    expect(sampleBillingNotice("VALIDE")).toBeNull();
    expect(sampleBillingNotice("RAPPORT_ENVOYE")).toBeNull();
  });

  it("says nothing for a sample reopened for amendment (AMENDEMENT.md §2)", () => {
    expect(sampleBillingNotice("RESULTATS_SAISIS", true)).toBeNull();
    // A cancellation still shows, whatever the report.
    expect(sampleBillingNotice("ANNULE", true)).toBe("CANCELLED");
  });
});

describe("invoiceNotices", () => {
  const sample = (id: string, status: Parameters<typeof sampleBillingNotice>[0], controlCode: string | null = null) => ({
    id,
    code: `CODE-${id}`,
    status,
    controlCode,
  });

  it("groups the samples by notice, each once, the cancellation first", () => {
    const notices = invoiceNotices([
      { sample: sample("a", "PROGRAMME", "00012") },
      { sample: sample("a", "PROGRAMME", "00012") },
      { sample: sample("b", "ANNULE", "00013") },
      { sample: sample("c", "VALIDE", "00014") },
      { sample: null },
      { sample: sample("d", "EN_ANALYSE") },
    ]);
    expect(notices).toEqual([
      { kind: "CANCELLED", references: ["00013"] },
      { kind: "BEFORE_RESULT", references: ["00012", "CODE-d"] },
    ]);
  });

  it("leaves out a sample whose report is being amended", () => {
    expect(
      invoiceNotices([{ sample: { ...sample("e", "RESULTATS_SAISIS", "00015"), amendmentPending: true } }])
    ).toEqual([]);
  });

  it("is empty for an invoice typed by hand or fully validated", () => {
    expect(invoiceNotices([{ sample: null }, { sample: sample("x", "RAPPORT_ENVOYE") }])).toEqual([]);
  });
});
