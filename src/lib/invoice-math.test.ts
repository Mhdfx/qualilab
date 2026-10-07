import { describe, it, expect } from "vitest";
import { computeInvoiceTotals, computeLineAmounts, roundMoney } from "./invoice-math";

/**
 * Half-centimes on an invoice (review 08/10/2026): `Math.round(x * 100) / 100`
 * rounded down the half-centimes floating point stores a hair below the
 * half — at the 7, 10 and 14 % VAT rates and on fractional quantities.
 */
describe("roundMoney", () => {
  it("rounds half-centimes up, as on paper", () => {
    expect(roundMoney(0.145)).toBe(0.15); // 1,45 × 10 %
    expect(roundMoney(1.45 * 0.1)).toBe(0.15);
    expect(roundMoney(5.75 * 0.1)).toBe(0.58);
    expect(roundMoney(7.25 * 0.14)).toBe(1.02);
    expect(roundMoney(1.5 * 0.19)).toBe(0.29);
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it("leaves exact amounts and ordinary roundings alone", () => {
    expect(roundMoney(2184)).toBe(2184);
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(12.344)).toBe(12.34);
    expect(roundMoney(12.346)).toBe(12.35);
    expect(roundMoney(0)).toBe(0);
  });

  it("is symmetric for a negative amount", () => {
    expect(roundMoney(-0.145)).toBe(-0.15);
  });

  it("agrees with integer arithmetic on the VAT of every amount from 0,01 to 2 000,00 DH", () => {
    const wrong: string[] = [];
    for (const rate of [7, 10, 14, 20]) {
      for (let cents = 1; cents <= 200_000; cents += 1) {
        // The VAT in hundredths of a centime is exact in integers: round it
        // half up to the centime, then read it in DH.
        const want = Math.floor((cents * rate + 50) / 100) / 100;
        if (roundMoney((cents / 100) * (rate / 100)) !== want) wrong.push(`${cents / 100} à ${rate} %`);
      }
    }
    expect(wrong).toEqual([]);
  });
});

describe("invoice totals at 10 %", () => {
  it("rounds the VAT of a line and of the invoice half up", () => {
    expect(computeLineAmounts(1, 1.45, 10)).toEqual({ lineHt: 1.45, lineVat: 0.15, lineTtc: 1.6 });
    const totals = computeInvoiceTotals([{ quantity: 1, unitPrice: 5.75 }], 10);
    expect(totals.taxAmount).toBe(0.58);
    expect(totals.total).toBe(6.33);
  });
});
