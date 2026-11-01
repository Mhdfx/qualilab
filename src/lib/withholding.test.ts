import { describe, expect, it } from "vitest";
import { parseIsoDay } from "./date-only";
import {
  addMonths,
  certificateEnd,
  certificateEndDay,
  certificateState,
  effectiveCertificateState,
  netToPay,
  parseRate,
  proposedWithholdingRate,
  withholdingAmountFor,
  withholdingApplies,
  withholdingBaseAmount,
  withholdingRefusal,
  type WithholdingSettings,
} from "./withholding";

/**
 * Lot 3D, M7 — la retenue à la source et l'attestation de régularité
 * fiscale (the NB of 28/10; hypothèses à confirmer par R-24). No rate in
 * the code: every figure here comes from the settings.
 */

const d = (day: string) => parseIsoDay(day) as Date;

const settings: WithholdingSettings = {
  scope: "FOURNISSEURS_SOUMIS",
  base: "TVA",
  rateWithCertificate: 75,
  rateWithoutCertificate: 100,
  certificateValidityMonths: 3,
};

describe("the scope of the retenue", () => {
  it("withholds nothing by default, from flagged suppliers, or from all", () => {
    expect(withholdingApplies("AUCUN", true)).toBe(false);
    expect(withholdingApplies("FOURNISSEURS_SOUMIS", true)).toBe(true);
    expect(withholdingApplies("FOURNISSEURS_SOUMIS", false)).toBe(false);
    expect(withholdingApplies("TOUS", false)).toBe(true);
  });
});

describe("the attestation's validity", () => {
  it("adds whole months, the 31st landing on a shorter month's last day", () => {
    expect(addMonths(d("2026-01-31"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(d("2026-11-15"), 3).toISOString().slice(0, 10)).toBe("2027-02-15");
  });

  it("ends on the typed day, else the day before the same day N months later", () => {
    expect(certificateEnd(d("2026-10-01"), d("2026-12-31"), 3)?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(certificateEnd(d("2026-10-01"), null, 3)?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(certificateEnd(null, null, 3)).toBeNull();
    expect(certificateEndDay(d("2026-10-01"), null, 6)).toBe("2027-03-31");
    expect(certificateEndDay(null, null, 6)).toBe("");
  });

  it("covers an invoice by the attestation given with it, or the supplier's, still valid on its day", () => {
    const base = {
      issueDate: d("2026-11-10"),
      invoiceProvided: false,
      invoiceCertificateDate: null,
      supplierCertificateDate: null,
      supplierCertificateValidUntil: null,
      validityMonths: 3,
    };
    expect(certificateState(base)).toBe("ABSENTE");
    expect(certificateState({ ...base, invoiceProvided: true, invoiceCertificateDate: d("2026-11-05") })).toBe("VALIDE");
    // Given with the invoice but dated more than 3 months before it.
    expect(certificateState({ ...base, invoiceProvided: true, invoiceCertificateDate: d("2026-07-01") })).toBe("EXPIREE");
    // Given with the invoice without a date: the invoice's day stands for it.
    expect(certificateState({ ...base, invoiceProvided: true })).toBe("VALIDE");
    expect(certificateState({ ...base, supplierCertificateDate: d("2026-09-01") })).toBe("VALIDE");
    expect(certificateState({ ...base, supplierCertificateDate: d("2026-06-01") })).toBe("EXPIREE");
    expect(certificateState({ ...base, supplierCertificateValidUntil: d("2026-11-10") })).toBe("VALIDE");
    expect(certificateState({ ...base, supplierCertificateValidUntil: d("2026-11-09") })).toBe("EXPIREE");
  });
});

describe("an attestation is valid ON the invoice's day (review of 01/11, RETOUR §5 M7)", () => {
  const base = {
    issueDate: d("2026-01-10"),
    invoiceProvided: false,
    invoiceCertificateDate: null,
    supplierCertificateDate: null,
    supplierCertificateValidUntil: null,
    validityMonths: 3,
  };

  it("does not count an attestation dated after the invoice: the January invoice stays « sans attestation »", () => {
    // The supplier's attestation of October does not cover an invoice of 10/01.
    expect(certificateState({ ...base, supplierCertificateDate: d("2026-10-01") })).toBe("ABSENTE");
    expect(certificateState({ ...base, supplierCertificateDate: d("2026-10-01"), supplierCertificateValidUntil: d("2026-12-31") })).toBe("ABSENTE");
    // Given with the invoice but dated after it: not valid on its day either.
    expect(certificateState({ ...base, invoiceProvided: true, invoiceCertificateDate: d("2026-01-11") })).toBe("ABSENTE");
  });

  it("counts one dated on the invoice's day or before, ending on it or after", () => {
    expect(certificateState({ ...base, supplierCertificateDate: d("2026-01-10") })).toBe("VALIDE");
    expect(certificateState({ ...base, invoiceProvided: true, invoiceCertificateDate: d("2026-01-10") })).toBe("VALIDE");
    // Only its end typed: its start is unknown, its end decides.
    expect(certificateState({ ...base, supplierCertificateValidUntil: d("2026-01-10") })).toBe("VALIDE");
    // An older one, ended before the day: « expirée ».
    expect(certificateState({ ...base, supplierCertificateDate: d("2025-09-01") })).toBe("EXPIREE");
  });

  it("keeps an invoice covered at its recording covered when the supplier's attestation is replaced", () => {
    // Recorded VALIDE in January; in October the supplier's last attestation is of October.
    const live = certificateState({ ...base, supplierCertificateDate: d("2026-10-01") });
    expect(effectiveCertificateState("VALIDE", live)).toBe("VALIDE");
    // Recorded without: an attestation recorded since covers it only if valid on its day.
    expect(effectiveCertificateState("ABSENTE", live)).toBe("ABSENTE");
    expect(effectiveCertificateState("ABSENTE", "VALIDE")).toBe("VALIDE");
    // An invoice of before (no stored state): what is known today.
    expect(effectiveCertificateState(null, "EXPIREE")).toBe("EXPIREE");
  });
});

describe("the rate proposed and the amount withheld", () => {
  it("proposes the settings' rate by attestation, nothing outside the scope", () => {
    expect(proposedWithholdingRate(settings, true, "VALIDE")).toBe(75);
    expect(proposedWithholdingRate(settings, true, "EXPIREE")).toBe(100);
    expect(proposedWithholdingRate(settings, true, "ABSENTE")).toBe(100);
    expect(proposedWithholdingRate(settings, false, "ABSENTE")).toBeNull();
    expect(proposedWithholdingRate({ ...settings, scope: "AUCUN" }, true, "ABSENTE")).toBeNull();
    expect(proposedWithholdingRate({ ...settings, rateWithCertificate: null }, true, "VALIDE")).toBeNull();
  });

  it("applies the rate to the settings' base, to the centime", () => {
    const amounts = { ht: 1000, tva: 200, ttc: 1200 };
    expect(withholdingBaseAmount("HT", amounts)).toBe(1000);
    expect(withholdingBaseAmount("TVA", amounts)).toBe(200);
    expect(withholdingBaseAmount("TTC", amounts)).toBe(1200);
    expect(withholdingAmountFor("TVA", 75, amounts)).toBe(150);
    expect(withholdingAmountFor("HT", 1.5, { ht: 333.33, tva: 66.67, ttc: 400 })).toBe(5);
    expect(withholdingAmountFor("TTC", 10, { ht: null, tva: null, ttc: 99.99 })).toBe(10);
  });

  it("withholds nothing without a rate, or on a base the invoice does not hold", () => {
    expect(withholdingAmountFor("TVA", null, { ht: 1000, tva: 200, ttc: 1200 })).toBe(0);
    expect(withholdingAmountFor("TVA", 0, { ht: 1000, tva: 200, ttc: 1200 })).toBe(0);
    // A TTC-only invoice of before lot 3D holds no TVA.
    expect(withholdingAmountFor("TVA", 75, { ht: null, tva: null, ttc: 1200 })).toBe(0);
  });

  it("refuses a rate on the HT or the TVA of a TTC-only invoice instead of withholding 0 (review of 01/11)", () => {
    const ttcOnly = { ht: null, tva: null, ttc: 1200 };
    expect(withholdingRefusal("TVA", 75, ttcOnly)).toBe(
      "La retenue à la source se calcule sur le montant de la TVA : saisissez le montant HT."
    );
    expect(withholdingRefusal("HT", 1.5, ttcOnly)).toBe("La retenue à la source se calcule sur le montant HT : saisissez le montant HT.");
    // On the TTC, or with the HT typed, or nothing withheld: recorded.
    expect(withholdingRefusal("TTC", 10, ttcOnly)).toBeNull();
    expect(withholdingRefusal("TVA", 75, { ht: 1000, tva: 200, ttc: 1200 })).toBeNull();
    expect(withholdingRefusal("TVA", null, ttcOnly)).toBeNull();
    expect(withholdingRefusal("TVA", 0, ttcOnly)).toBeNull();
  });

  it("refuses a retenue that takes the whole TTC: nothing would be left to pay", () => {
    expect(withholdingRefusal("TTC", 100, { ht: 1000, tva: 200, ttc: 1200 })).toBe(
      "La retenue à la source ne peut pas absorber tout le TTC : il ne resterait rien à payer."
    );
    expect(withholdingRefusal("TTC", 99.99, { ht: 1000, tva: 200, ttc: 1200 })).toBeNull();
    // 100 % of the TVA leaves the HT to pay.
    expect(withholdingRefusal("TVA", 100, { ht: 1000, tva: 200, ttc: 1200 })).toBeNull();
  });

  it("nets the retenue out of the TTC, never below zero", () => {
    expect(netToPay(1200, 150)).toBe(1050);
    expect(netToPay(1200, null)).toBe(1200);
    expect(netToPay(0.3, 0.1)).toBe(0.2);
    expect(netToPay(100, 150)).toBe(0);
  });

  it("reads a typed rate between 0 and 100, a decimal comma included", () => {
    expect(parseRate("75")).toBe(75);
    expect(parseRate("7,5")).toBe(7.5);
    expect(parseRate(20)).toBe(20);
    expect(parseRate("")).toBeNull();
    expect(parseRate(null)).toBeNull();
    expect(parseRate("101")).toBeNaN();
    expect(parseRate("-1")).toBeNaN();
    expect(parseRate("abc")).toBeNaN();
  });
});
