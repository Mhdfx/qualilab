import { describe, it, expect } from "vitest";
import { toMoney, isValidAmount } from "./money";
import { computeInvoiceTotals, computeLineAmounts, roundMoney } from "./invoice-math";

/**
 * Money on an invoice the laboratory issues under its ICE and RC. These tests
 * exist because the prototype stored amounts as floating point, and because
 * DECIMAL columns arrive as objects or strings depending on the path they took.
 */
describe("toMoney", () => {
  it("reads a Decimal that JSON turned into a string", () => {
    expect(toMoney("2184")).toBe(2184);
    expect(toMoney("540.50")).toBe(540.5);
  });

  it("reads a plain number", () => {
    expect(toMoney(320)).toBe(320);
  });

  it("reads an object with a toString, as Prisma's Decimal has", () => {
    const decimalLike = { toString: () => "1234.56" } as never;
    expect(toMoney(decimalLike)).toBe(1234.56);
  });

  it("treats a missing amount as zero rather than NaN", () => {
    expect(toMoney(null)).toBe(0);
    expect(toMoney(undefined)).toBe(0);
    expect(toMoney("pas un nombre")).toBe(0);
  });

  it("rounds to centimes", () => {
    expect(toMoney(10.005)).toBe(10.01);
    expect(toMoney("0.1")).toBe(0.1);
  });
});

describe("isValidAmount", () => {
  it("accepts a usable amount", () => {
    expect(isValidAmount(0)).toBe(true);
    expect(isValidAmount(320.5)).toBe(true);
  });

  it("refuses what must never reach an invoice", () => {
    // A negative unit price was accepted by the prototype.
    expect(isValidAmount(-1)).toBe(false);
    expect(isValidAmount(Number.NaN)).toBe(false);
    expect(isValidAmount(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isValidAmount("abc")).toBe(false);
  });
});

describe("invoice totals", () => {
  it("computes a line the way the invoice prints it", () => {
    expect(computeLineAmounts(2, 320, 20)).toEqual({
      lineHt: 640,
      lineVat: 128,
      lineTtc: 768,
    });
  });

  it("reproduces the seeded invoice exactly", () => {
    // FAC-2026-0001: 2 184,00 DH TTC.
    const totals = computeInvoiceTotals(
      [
        { quantity: 1, unitPrice: 450 },
        { quantity: 1, unitPrice: 480 },
        { quantity: 1, unitPrice: 320 },
        { quantity: 1, unitPrice: 570 },
      ],
      20
    );
    expect(totals.subtotal).toBe(1820);
    expect(totals.taxAmount).toBe(364);
    expect(totals.total).toBe(2184);
  });

  it("does not drift on amounts that break floating point", () => {
    const totals = computeInvoiceTotals(
      [
        { quantity: 3, unitPrice: 0.1 },
        { quantity: 3, unitPrice: 0.2 },
      ],
      20
    );
    // 0.1*3 + 0.2*3 = 0.9 exactly, not 0.8999999999999999.
    expect(totals.subtotal).toBe(0.9);
    expect(totals.total).toBe(1.08);
  });

  it("handles a zero rate and an empty invoice", () => {
    expect(computeInvoiceTotals([{ quantity: 1, unitPrice: 100 }], 0)).toMatchObject({
      subtotal: 100,
      taxAmount: 0,
      total: 100,
    });
    expect(computeInvoiceTotals([], 20)).toMatchObject({
      subtotal: 0,
      taxAmount: 0,
      total: 0,
    });
  });

  it("rounds half up, to the centime", () => {
    expect(roundMoney(10.005)).toBe(10.01);
    expect(roundMoney(10.004)).toBe(10);
  });
});
