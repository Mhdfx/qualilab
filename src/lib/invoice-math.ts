export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
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
