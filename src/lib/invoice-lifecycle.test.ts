import { describe, expect, it } from "vitest";
import {
  balance,
  cancelRefusal,
  canCancel,
  canEditDraft,
  canIssue,
  checkCreditNote,
  checkPayment,
  checkReason,
  invoiceState,
  INVOICE_STATE_LABELS,
  isIssued,
  isRecordablePaymentMode,
  PAYMENT_MODE_LABELS,
  remainingCreditable,
  statusAfterPayments,
} from "./invoice-lifecycle";
import { formatCounterNumber, formatDocumentNumber } from "./counters";

/**
 * FACTURATION.md — the rules an invoice the laboratory issues under its ICE
 * must obey: a number never reused, an issued invoice never edited, a
 * settlement never beyond what is due, credit notes never beyond the total.
 */

describe("balance — reste à payer", () => {
  it("is the total less the credit notes and the settlements", () => {
    expect(balance(2184, 1000, 184)).toBe(1000);
    expect(balance("2184.00", "0", "0")).toBe(2184);
  });

  it("is computed in centimes, not floating point", () => {
    expect(balance(0.3, 0.1, 0.2)).toBe(0);
    expect(balance("100.10", "33.37", "33.36")).toBe(33.37);
  });

  it("is never negative", () => {
    expect(balance(100, 150, 0)).toBe(0);
    expect(balance(100, 60, 60)).toBe(0);
  });

  it("reads Decimal-like objects and missing values", () => {
    const decimalLike = { toString: () => "768.00" } as never;
    expect(balance(decimalLike, null, undefined)).toBe(768);
  });
});

describe("remainingCreditable", () => {
  it("is the total less the credit notes already issued", () => {
    expect(remainingCreditable(768, 200)).toBe(568);
    expect(remainingCreditable(768, 768)).toBe(0);
    expect(remainingCreditable(768, 900)).toBe(0);
  });
});

describe("statusAfterPayments", () => {
  it("is PAYEE when nothing is left to pay", () => {
    expect(statusAfterPayments(768, 768, 0)).toBe("PAYEE");
    expect(statusAfterPayments(768, 568, 200)).toBe("PAYEE");
  });

  it("goes back to EN_ATTENTE when a settlement is removed", () => {
    expect(statusAfterPayments(768, 500, 0)).toBe("EN_ATTENTE");
    expect(statusAfterPayments(768, 0, 0)).toBe("EN_ATTENTE");
  });
});

describe("invoiceState", () => {
  const issued = { status: "EN_ATTENTE", kind: "FACTURE" } as const;

  it("reads a credit note as « Avoir », whatever its status", () => {
    expect(invoiceState({ status: "EN_ATTENTE", kind: "AVOIR", total: 100, paid: 0, credited: 0 })).toBe("AVOIR");
  });

  it("reads drafts and cancelled invoices as such, whatever the amounts", () => {
    expect(invoiceState({ status: "BROUILLON", kind: "FACTURE", total: 100, paid: 0, credited: 0 })).toBe("BROUILLON");
    expect(invoiceState({ status: "ANNULEE", kind: "FACTURE", total: 100, paid: 0, credited: 0 })).toBe("ANNULEE");
  });

  it("reads an issued invoice from its settlements", () => {
    expect(invoiceState({ ...issued, total: 768, paid: 0, credited: 0 })).toBe("EMISE");
    expect(invoiceState({ ...issued, total: 768, paid: 300, credited: 0 })).toBe("PARTIELLEMENT_PAYEE");
    expect(invoiceState({ ...issued, total: 768, paid: 768, credited: 0 })).toBe("PAYEE");
  });

  it("does not call a credit note alone a partial payment", () => {
    expect(invoiceState({ ...issued, total: 768, paid: 0, credited: 200 })).toBe("EMISE");
    expect(invoiceState({ ...issued, total: 768, paid: 568, credited: 200 })).toBe("PAYEE");
  });

  it("reads a migrated « Repris » invoice as paid", () => {
    expect(invoiceState({ status: "PAYEE", kind: "FACTURE", total: "2184.00", paid: "2184.00", credited: 0 })).toBe("PAYEE");
  });

  it("has a French label for every state", () => {
    expect(INVOICE_STATE_LABELS.PARTIELLEMENT_PAYEE).toBe("Partiellement payée");
    expect(INVOICE_STATE_LABELS.EMISE).toBe("Émise");
  });
});

describe("draft, issue, cancel", () => {
  it("edits and issues a draft invoice only", () => {
    expect(canEditDraft({ status: "BROUILLON", kind: "FACTURE" })).toBe(true);
    expect(canIssue({ status: "BROUILLON", kind: "FACTURE" })).toBe(true);
    for (const status of ["EN_ATTENTE", "PAYEE", "ANNULEE"] as const) {
      expect(canEditDraft({ status, kind: "FACTURE" })).toBe(false);
      expect(canIssue({ status, kind: "FACTURE" })).toBe(false);
    }
    expect(canEditDraft({ status: "BROUILLON", kind: "AVOIR" })).toBe(false);
  });

  it("knows an issued invoice by its status", () => {
    expect(isIssued({ status: "BROUILLON", kind: "FACTURE" })).toBe(false);
    expect(isIssued({ status: "ANNULEE", kind: "FACTURE" })).toBe(true);
  });

  it("cancels an issued invoice with no settlement and no credit note", () => {
    expect(canCancel({ status: "EN_ATTENTE", kind: "FACTURE" }, 0)).toBe(true);
    expect(canCancel({ status: "EN_ATTENTE", kind: "FACTURE", credited: 0 }, 0)).toBe(true);
  });

  it("refuses the rest, each with its reason", () => {
    expect(cancelRefusal({ status: "BROUILLON", kind: "FACTURE" }, 0)).toMatch(/brouillon/);
    expect(cancelRefusal({ status: "ANNULEE", kind: "FACTURE" }, 0)).toMatch(/déjà annulée/);
    expect(cancelRefusal({ status: "EN_ATTENTE", kind: "AVOIR" }, 0)).toMatch(/avoir ne s'annule pas/);
    expect(cancelRefusal({ status: "EN_ATTENTE", kind: "FACTURE" }, 1)).toMatch(/avoir/);
    expect(cancelRefusal({ status: "PAYEE", kind: "FACTURE" }, 1)).toMatch(/règlement/);
    // Soldée by credit notes alone: the refusal names the credit note, not a
    // settlement that never existed.
    expect(cancelRefusal({ status: "PAYEE", kind: "FACTURE", credited: "240.00" }, 0)).toMatch(/déjà un avoir/);
    // An invoice of 0,00 is soldée at issue: still never cancelled, and said so.
    expect(cancelRefusal({ status: "PAYEE", kind: "FACTURE" }, 0)).toMatch(/soldée/);
    expect(cancelRefusal({ status: "EN_ATTENTE", kind: "FACTURE", credited: "50.00" }, 0)).toMatch(/déjà un avoir/);
  });

  it("requires a written reason", () => {
    expect(checkReason("Erreur de client")).toBeNull();
    expect(checkReason("  ")).not.toBeNull();
    expect(checkReason(undefined)).not.toBeNull();
    expect(checkReason("x".repeat(5001))).toMatch(/trop long/);
    expect(checkReason("x".repeat(5000))).toBeNull();
  });
});

describe("checkPayment", () => {
  it("accepts a positive amount up to the balance", () => {
    expect(checkPayment(300, 768)).toBeNull();
    expect(checkPayment(768, 768)).toBeNull();
    expect(checkPayment("768,00", "768.00")).toBeNull();
    expect(checkPayment(0.1, 0.3)).toBeNull();
  });

  it("refuses zero, negative and unreadable amounts", () => {
    expect(checkPayment(0, 768)).toMatch(/supérieur à zéro/);
    expect(checkPayment(-5, 768)).toMatch(/supérieur à zéro/);
    expect(checkPayment("abc", 768)).toMatch(/supérieur à zéro/);
    expect(checkPayment(Number.NaN, 768)).toMatch(/supérieur à zéro/);
  });

  it("refuses fractions of a centime", () => {
    expect(checkPayment(10.005, 768)).toMatch(/deux décimales/);
  });

  it("refuses a settlement beyond what is left to pay", () => {
    expect(checkPayment(768.01, 768)).toMatch(/dépasse le reste à payer/);
    expect(checkPayment(1, 0)).toMatch(/soldée/);
  });
});

describe("checkCreditNote", () => {
  const line = { description: "Analyse microbiologique — reprise", quantity: 1, unitPrice: 100 };

  it("computes the credit note at the invoice's VAT rate", () => {
    const check = checkCreditNote([line], 768, 20);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.totals).toMatchObject({ subtotal: 100, taxAmount: 20, total: 120 });
  });

  it("allows a credit note up to exactly what remains creditable", () => {
    expect(checkCreditNote([{ ...line, unitPrice: 640 }], 768, 20).ok).toBe(true);
  });

  it("refuses a credit note beyond what remains creditable", () => {
    const check = checkCreditNote([{ ...line, unitPrice: 640.01 }], 768, 20);
    expect(check).toMatchObject({ ok: false });
    if (!check.ok) expect(check.error).toMatch(/dépasse le montant encore créditable/);
    const full = checkCreditNote([line], 0, 20);
    if (!full.ok) expect(full.error).toMatch(/entièrement couverte/);
    else throw new Error("expected a refusal");
  });

  it("refuses empty or malformed lines", () => {
    expect(checkCreditNote([], 768, 20)).toMatchObject({ ok: false });
    expect(checkCreditNote([{ ...line, description: " " }], 768, 20)).toMatchObject({ ok: false, error: expect.stringMatching(/Ligne 1/) });
    expect(checkCreditNote([line, { ...line, quantity: 0 }], 768, 20)).toMatchObject({ ok: false, error: expect.stringMatching(/Ligne 2/) });
    expect(checkCreditNote([{ ...line, unitPrice: -1 }], 768, 20)).toMatchObject({ ok: false });
    expect(checkCreditNote([{ ...line, unitPrice: 0 }], 768, 20)).toMatchObject({ ok: false, error: expect.stringMatching(/supérieur à zéro/) });
  });
});

describe("payment modes", () => {
  it("labels every mode in French", () => {
    expect(PAYMENT_MODE_LABELS.EFFET).toBe("Effet");
    expect(PAYMENT_MODE_LABELS.ESPECES).toBe("Espèces");
  });

  it("never offers AUTRE, kept for the migrated settlements", () => {
    expect(isRecordablePaymentMode("CHEQUE")).toBe(true);
    expect(isRecordablePaymentMode("AUTRE")).toBe(false);
    expect(isRecordablePaymentMode("BITCOIN")).toBe(false);
  });
});

describe("invoice and credit note numbers (counters FACTURE / AVOIR)", () => {
  it("formats « FAC-AAAA-NNNN » and « AV-AAAA-NNNN »", () => {
    expect(formatDocumentNumber("FACTURE", 42, 2026)).toBe("FAC-2026-0042");
    expect(formatDocumentNumber("AVOIR", 3, 2026)).toBe("AV-2026-0003");
    expect(formatDocumentNumber("FACTURE", 12345, 2026)).toBe("FAC-2026-12345");
  });

  it("keeps the lab format for the séries and samples", () => {
    expect(formatCounterNumber("SERIE", 2780, 2026)).toBe("2780/26");
    expect(formatCounterNumber("CONTROLE", 20353, 2026)).toBe("20353/26");
    expect(formatCounterNumber("FACTURE", 1, 2027)).toBe("FAC-2027-0001");
  });
});
