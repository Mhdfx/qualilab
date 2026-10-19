import { describe, expect, it } from "vitest";
import { billedOnInvoice, invoiceNotices, sampleBillingNotice, sampleBillingNotices } from "./invoice-notices";

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

describe("« Analyses modifiées après facturation » (16/10 — F6, F8, C5 after billing)", () => {
  const sample = (id: string, status: Parameters<typeof sampleBillingNotice>[0], analysesChanged = false) => ({
    id,
    code: `CODE-${id}`,
    controlCode: null,
    status,
    analysesChanged,
  });

  it("is said with the sample's status notice, after the cancellation and before « avant résultat »", () => {
    expect(sampleBillingNotices({ status: "EN_ANALYSE", analysesChanged: true })).toEqual(["BEFORE_RESULT", "ANALYSES_CHANGED"]);
    expect(sampleBillingNotices({ status: "VALIDE", analysesChanged: true })).toEqual(["ANALYSES_CHANGED"]);
    expect(sampleBillingNotices({ status: "VALIDE" })).toEqual([]);
    expect(
      invoiceNotices([
        { sample: sample("a", "EN_ANALYSE", true) },
        { sample: sample("b", "ANNULE") },
        { sample: sample("c", "RAPPORT_ENVOYE", true) },
      ])
    ).toEqual([
      { kind: "CANCELLED", references: ["CODE-b"] },
      { kind: "ANALYSES_CHANGED", references: ["CODE-a", "CODE-c"] },
      { kind: "BEFORE_RESULT", references: ["CODE-a"] },
    ]);
  });

  it("reads the invoice a journal line names, and nothing from anything else", () => {
    expect(billedOnInvoice(JSON.stringify({ reason: "x", billedOn: { invoiceId: "inv1", number: "FAC-2026-00001" } }))).toBe("inv1");
    expect(billedOnInvoice(JSON.stringify({ reason: "x" }))).toBeNull();
    expect(billedOnInvoice(JSON.stringify({ billedOn: { invoiceId: 3 } }))).toBeNull();
    expect(billedOnInvoice("{pas du json")).toBeNull();
    expect(billedOnInvoice(null)).toBeNull();
  });
});
