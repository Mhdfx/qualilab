import { describe, expect, it, vi } from "vitest";

/**
 * The switches of lot 3D turned the OTHER way (src/lib/lab-proposals.ts):
 * PAYMENT_REQUIRES_TAX_CERTIFICATE on — the expected answer to R-24 if the
 * accountant wants the payment blocked — and PURCHASE_PARTIAL_PAYMENTS off.
 * The module is mocked, so the pure rules read the values as the server
 * would (review of 01/11).
 */
vi.mock("./lab-proposals", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./lab-proposals")>()),
  PAYMENT_REQUIRES_TAX_CERTIFICATE: true,
  PURCHASE_PARTIAL_PAYMENTS: false,
}));

const { paymentCertificateRefusal, paymentAmountError } = await import("./purchase-invoice");
const { PURCHASE_PARTIAL_PAYMENTS } = await import("./lab-proposals");

describe("lot 3D — the switches turned", () => {
  it("PAYMENT_REQUIRES_TAX_CERTIFICATE on: the payment of an invoice no valid attestation covers is refused", () => {
    const refusal = "Aucune attestation de régularité fiscale valide ne couvre cette facture : enregistrez-la avant le paiement.";
    expect(paymentCertificateRefusal("ABSENTE")).toBe(refusal);
    expect(paymentCertificateRefusal("EXPIREE")).toBe(refusal);
    expect(paymentCertificateRefusal("VALIDE")).toBeNull();
  });

  it("PURCHASE_PARTIAL_PAYMENTS off: a payment settles the whole remaining amount", () => {
    expect(PURCHASE_PARTIAL_PAYMENTS).toBe(false);
    expect(paymentAmountError(100, 550, PURCHASE_PARTIAL_PAYMENTS)).toBe("Le paiement doit régler tout le reste à payer.");
    expect(paymentAmountError(550, 550, PURCHASE_PARTIAL_PAYMENTS)).toBeNull();
  });
});
