/**
 * Rounds to the centime, half away from zero — as a person would on paper.
 *
 * `Math.round(amount * 100) / 100` is wrong on half-centimes that floating
 * point stores a hair below the half: 1,45 × 10 % = 0,145 is held as
 * 0.14499999999999999 and came out 0,14 instead of 0,15 (thousands of such
 * cases at the 7, 10 and 14 % VAT rates, and on fractional quantities).
 * Scaling, then trimming to 12 significant digits, removes that noise before
 * the rounding (amounts stay far below 10^10 DH).
 */
export function roundMoney(amount: number): number {
  if (!Number.isFinite(amount)) return amount;
  const scaled = Number((Math.abs(amount) * 100).toPrecision(12));
  const rounded = Math.round(scaled) / 100;
  return amount < 0 ? -rounded : rounded;
}

export type LineAmounts = {
  lineHt: number;
  lineVat: number;
  lineTtc: number;
};

export function computeLineAmounts(
  quantity: number,
  unitPrice: number,
  taxRate: number
): LineAmounts {
  const lineHt = roundMoney(quantity * unitPrice);
  const lineVat = roundMoney(lineHt * (taxRate / 100));
  const lineTtc = roundMoney(lineHt + lineVat);
  return { lineHt, lineVat, lineTtc };
}

export type InvoiceTotals = {
  subtotal: number;
  taxAmount: number;
  total: number;
  lines: LineAmounts[];
};

export function computeInvoiceTotals(
  items: { quantity: number; unitPrice: number }[],
  taxRate: number
): InvoiceTotals {
  const lines = items.map((item) =>
    computeLineAmounts(item.quantity, item.unitPrice, taxRate)
  );
  const subtotal = roundMoney(lines.reduce((sum, line) => sum + line.lineHt, 0));
  const taxAmount = roundMoney(subtotal * (taxRate / 100));
  const total = roundMoney(subtotal + taxAmount);
  return { subtotal, taxAmount, total, lines };
}
