import { toMoney } from "./money";

/**
 * Shapes an invoice for the wire.
 *
 * Money is stored as DECIMAL, and JSON would serialise those columns as
 * strings — so `"2184"` would reach the screens where a number is expected and
 * `sum + total` would quietly concatenate. Every invoice leaving an API route
 * goes through here.
 */
type RawItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: unknown;
  lineTotal: unknown;
};

type RawInvoice = {
  taxRate: unknown;
  subtotal: unknown;
  taxAmount: unknown;
  total: unknown;
  items?: RawItem[];
};

export function serializeInvoice<T extends RawInvoice>(invoice: T) {
  return {
    ...invoice,
    taxRate: toMoney(invoice.taxRate as never),
    subtotal: toMoney(invoice.subtotal as never),
    taxAmount: toMoney(invoice.taxAmount as never),
    total: toMoney(invoice.total as never),
    items: invoice.items?.map((item) => ({
      ...item,
      unitPrice: toMoney(item.unitPrice as never),
      lineTotal: toMoney(item.lineTotal as never),
    })),
  };
}
