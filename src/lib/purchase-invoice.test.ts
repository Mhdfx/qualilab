import { describe, expect, it } from "vitest";
import {
  correctionRefusal,
  isCorrectable,
  paidTotal,
  paymentAmountError,
  paymentCertificateRefusal,
  purchaseBalance,
  purchaseStatusLabel,
} from "./purchase-invoice";
import { PAYMENT_REQUIRES_TAX_CERTIFICATE, PURCHASE_PARTIAL_PAYMENTS } from "./lab-proposals";
import { validatePurchaseInvoice, validatePurchasePayment, validateAchatSettings } from "./achat-validation";

/**
 * Lot 3D, M1 and M6 — a supplier invoice's amounts, payments, « Statut »,
 * correction and « Annuler la saisie ».
 */

const invoice = { status: "A_PAYER" as const, amount: 1200, withholdingAmount: null, payments: [] as number[] };

describe("the balance of a supplier invoice", () => {
  it("sums the payments to the centime", () => {
    expect(paidTotal([0.1, 0.2])).toBe(0.3);
    expect(paidTotal([])).toBe(0);
  });

  it("measures what is left against the net à payer (TTC − retenue)", () => {
    expect(purchaseBalance(invoice)).toEqual({ net: 1200, paid: 0, remaining: 1200 });
    expect(purchaseBalance({ ...invoice, withholdingAmount: 150, payments: [500] })).toEqual({ net: 1050, paid: 500, remaining: 550 });
  });

  it("reads an invoice paid before lot 3D (no payment row) as paid in full", () => {
    expect(purchaseBalance({ ...invoice, status: "PAYEE" })).toEqual({ net: 1200, paid: 1200, remaining: 0 });
  });

  it("leaves nothing to pay on a cancelled entry", () => {
    expect(purchaseBalance({ ...invoice, status: "ANNULEE" }).remaining).toBe(0);
  });
});

describe("the « Statut » of the journal", () => {
  it("tells paid, partly paid, late, to pay and cancelled apart", () => {
    expect(purchaseStatusLabel({ ...invoice, status: "PAYEE" }, "OK")).toBe("Payée");
    expect(purchaseStatusLabel({ ...invoice, payments: [100] }, "RETARD")).toBe("Partiellement payée");
    expect(purchaseStatusLabel(invoice, "RETARD")).toBe("En retard");
    expect(purchaseStatusLabel(invoice, "BIENTOT")).toBe("À payer");
    expect(purchaseStatusLabel({ ...invoice, status: "ANNULEE" }, "OK")).toBe("Annulée");
  });
});

describe("correction and « Annuler la saisie »", () => {
  it("only for an invoice still to pay with no payment", () => {
    expect(isCorrectable({ status: "A_PAYER", paymentCount: 0 })).toBe(true);
    expect(isCorrectable({ status: "A_PAYER", paymentCount: 1 })).toBe(false);
    expect(isCorrectable({ status: "PAYEE", paymentCount: 0 })).toBe(false);
    expect(isCorrectable({ status: "ANNULEE", paymentCount: 0 })).toBe(false);
    expect(correctionRefusal({ status: "A_PAYER", paymentCount: 0 })).toBeNull();
    expect(correctionRefusal({ status: "A_PAYER", paymentCount: 2 })).toMatch(/déjà payée/);
    expect(correctionRefusal({ status: "ANNULEE", paymentCount: 0 })).toBe("Cette facture a été annulée.");
  });
});

describe("a payment's amount", () => {
  it("accepts a part or the whole remaining amount while partial payments are on", () => {
    expect(paymentAmountError(100, 550, true)).toBeNull();
    expect(paymentAmountError(550, 550, true)).toBeNull();
    expect(paymentAmountError(550.01, 550, true)).toMatch(/dépasse le reste à payer \(550,00 DH\)/);
    expect(paymentAmountError(0, 550, true)).toMatch(/positif/);
    expect(paymentAmountError(10, 0, true)).toBe("Cette facture est déjà réglée.");
  });

  it("demands the whole remaining amount when partial payments are off", () => {
    expect(paymentAmountError(100, 550, false)).toBe("Le paiement doit régler tout le reste à payer.");
    expect(paymentAmountError(550, 550, false)).toBeNull();
  });

  it("keeps the switches at the plan's proposal: partial payments on, a warning without attestation", () => {
    expect(PURCHASE_PARTIAL_PAYMENTS).toBe(true);
    expect(PAYMENT_REQUIRES_TAX_CERTIFICATE).toBe(false);
  });

  it("PAYMENT_REQUIRES_TAX_CERTIFICATE: off, every payment goes on; on, only a covered invoice is paid", () => {
    const refusal = "Aucune attestation de régularité fiscale valide ne couvre cette facture : enregistrez-la avant le paiement.";
    for (const state of ["VALIDE", "EXPIREE", "ABSENTE"] as const) expect(paymentCertificateRefusal(state, false)).toBeNull();
    expect(paymentCertificateRefusal("VALIDE", true)).toBeNull();
    expect(paymentCertificateRefusal("EXPIREE", true)).toBe(refusal);
    expect(paymentCertificateRefusal("ABSENTE", true)).toBe(refusal);
    // The default reads the switch (off).
    expect(paymentCertificateRefusal("ABSENTE")).toBeNull();
  });
});

describe("validatePurchaseInvoice — HT, TVA, TTC (M1)", () => {
  const base = { number: "F-1", issueDate: "2026-10-15" };

  it("computes the TVA and the TTC from the HT and the rate, to the centime", () => {
    const result = validatePurchaseInvoice({ ...base, amountHT: "1042,08", vatRate: "20" });
    expect(result.ok && result.value).toMatchObject({ amountHT: 1042.08, vatRate: 20, vatAmount: 208.42, amount: 1250.5 });
  });

  it("takes the settings' default rate when the rate is empty", () => {
    const result = validatePurchaseInvoice({ ...base, amountHT: "100", vatRate: "" }, { defaultVatRate: 10 });
    expect(result.ok && result.value).toMatchObject({ vatRate: 10, vatAmount: 10, amount: 110 });
  });

  it("keeps a VAT amount typed by hand (several rates, the supplier's rounding)", () => {
    const result = validatePurchaseInvoice({ ...base, amountHT: "1000", vatRate: "20", vatAmount: "150,40" });
    expect(result.ok && result.value).toMatchObject({ vatAmount: 150.4, amount: 1150.4 });
    expect(validatePurchaseInvoice({ ...base, amountHT: "1000", vatAmount: "-1" }).ok).toBe(false);
  });

  it("refuses an HT of zero, an unreadable rate, a rate above 100", () => {
    expect(validatePurchaseInvoice({ ...base, amountHT: "0" }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...base, amountHT: "10", vatRate: "abc" }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...base, amountHT: "10", vatRate: "120" }).ok).toBe(false);
  });

  it("still takes a TTC typed alone (an API caller of before lot 3D)", () => {
    const result = validatePurchaseInvoice({ ...base, amount: "1250,50" });
    expect(result.ok && result.value).toMatchObject({ amount: 1250.5, amountHT: null, vatRate: null, vatAmount: null });
  });
});

describe("validatePurchaseInvoice — currency (M6) and attestation (M7)", () => {
  const base = { number: "F-1", issueDate: "2026-10-15", amountHT: "1000" };

  it("records a foreign currency with its amount, the DH staying the base", () => {
    const result = validatePurchaseInvoice({ ...base, currency: "eur", amountForeign: "92,5", exchangeRate: "10,85" });
    expect(result.ok && result.value).toMatchObject({ currency: "EUR", amountForeign: 92.5, exchangeRate: 10.85, amount: 1200 });
    expect(validatePurchaseInvoice({ ...base, currency: "EUR" }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...base, currency: "EURO", amountForeign: "1" }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...base, currency: "EUR", amountForeign: "1", exchangeRate: "0" }).ok).toBe(false);
  });

  it("treats DH / MAD as no foreign currency", () => {
    const result = validatePurchaseInvoice({ ...base, currency: "MAD", amountForeign: "5" });
    expect(result.ok && result.value).toMatchObject({ currency: null, amountForeign: null });
  });

  it("reads the attestation given with the invoice and the rate typed (empty = the settings' proposal)", () => {
    const given = validatePurchaseInvoice({ ...base, taxCertificateProvided: true, taxCertificateDate: "2026-10-01", withholdingRate: "" });
    expect(given.ok && given.value).toMatchObject({ taxCertificateProvided: true, withholdingRate: null });
    expect(given.ok && given.value.taxCertificateDate?.toISOString().slice(0, 10)).toBe("2026-10-01");
    const notGiven = validatePurchaseInvoice({ ...base, taxCertificateProvided: false, taxCertificateDate: "2026-10-01" });
    expect(notGiven.ok && notGiven.value.taxCertificateDate).toBeNull();
    expect(validatePurchaseInvoice({ ...base, withholdingRate: "7,5" }).ok && true).toBe(true);
    expect(validatePurchaseInvoice({ ...base, withholdingRate: "150" }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...base, taxCertificateProvided: "on", taxCertificateDate: "2026-02-30" }).ok).toBe(false);
  });
});

describe("validatePurchasePayment (M1)", () => {
  const context = { today: "2026-11-01", issueDay: "2026-10-15" };

  it("dates a payment today by default, never in the future nor before the invoice", () => {
    const result = validatePurchasePayment({ method: "VIREMENT" }, context);
    expect(result.ok && result.value.paidOn.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(validatePurchasePayment({ method: "VIREMENT", paidOn: "2026-11-02" }, context)).toEqual({
      ok: false,
      error: "La date de paiement ne peut pas être dans le futur.",
    });
    expect(validatePurchasePayment({ method: "VIREMENT", paidOn: "2026-10-14" }, context)).toEqual({
      ok: false,
      error: "La date de paiement ne peut pas précéder la date de la facture.",
    });
    expect(validatePurchasePayment({ method: "VIREMENT", paidOn: "2026-10-15" }, context).ok).toBe(true);
  });

  it("requires a method among the recordable ones; the reference and the amount are optional", () => {
    expect(validatePurchasePayment({}, context)).toEqual({ ok: false, error: "Choisissez le mode de paiement." });
    expect(validatePurchasePayment({ method: "AUTRE" }, context).ok).toBe(false);
    const result = validatePurchasePayment({ method: "CHEQUE", reference: " CHQ 0042 ", amount: "100,5" }, context);
    expect(result.ok && result.value).toMatchObject({ method: "CHEQUE", reference: "CHQ 0042", amount: 100.5 });
    const whole = validatePurchasePayment({ method: "ESPECES", amount: "" }, context);
    expect(whole.ok && whole.value.amount).toBeNull();
    expect(validatePurchasePayment({ method: "ESPECES", amount: "-3" }, context).ok).toBe(false);
    expect(validatePurchasePayment({ method: "ESPECES", reference: "r".repeat(192) }, context).ok).toBe(false);
  });
});

describe("validateAchatSettings", () => {
  const valid = {
    expiryWarningDays: "30",
    defaultVatRate: "20",
    withholdingScope: "AUCUN",
    withholdingBase: "TVA",
    withholdingRateWithCertificate: "",
    withholdingRateWithoutCertificate: "",
    taxCertificateValidityMonths: "3",
  };

  it("accepts the defaults: no retenue, no rate", () => {
    const result = validateAchatSettings(valid);
    expect(result.ok && result.value).toEqual({
      expiryWarningDays: 30,
      defaultVatRate: 20,
      withholdingScope: "AUCUN",
      withholdingBase: "TVA",
      withholdingRateWithCertificate: null,
      withholdingRateWithoutCertificate: null,
      taxCertificateValidityMonths: 3,
    });
  });

  it("requires a rate once a scope is chosen, and sane bounds everywhere", () => {
    expect(validateAchatSettings({ ...valid, withholdingScope: "TOUS" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, withholdingScope: "TOUS", withholdingRateWithoutCertificate: "100" }).ok).toBe(true);
    expect(validateAchatSettings({ ...valid, withholdingScope: "PARFOIS" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, withholdingBase: "NET" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, expiryWarningDays: "" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, expiryWarningDays: "400" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, defaultVatRate: "" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, taxCertificateValidityMonths: "0" }).ok).toBe(false);
    expect(validateAchatSettings({ ...valid, withholdingRateWithCertificate: "abc" }).ok).toBe(false);
  });

  it("refuses 100 % on the TTC, which would leave nothing to pay (review of 01/11)", () => {
    const ttc = { ...valid, withholdingScope: "TOUS", withholdingBase: "TTC" };
    expect(validateAchatSettings({ ...ttc, withholdingRateWithoutCertificate: "100" })).toEqual({
      ok: false,
      error: "Sur le montant TTC, un taux de retenue de 100 % ne laisse rien à payer : indiquez un taux inférieur.",
    });
    expect(validateAchatSettings({ ...ttc, withholdingRateWithCertificate: "100", withholdingRateWithoutCertificate: "10" }).ok).toBe(false);
    expect(validateAchatSettings({ ...ttc, withholdingRateWithoutCertificate: "10" }).ok).toBe(true);
  });
});
