import type { BilledSample } from "./invoice-notices";

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /**
   * The sample this line bills, when it came from an analysis (PROGRAMME.md
   * §6): its status tells the invoice sheet whether it was billed before
   * result or cancelled afterwards. Absent on a line typed by hand.
   */
  sample?: BilledSample | null;
};

export type InvoiceClient = {
  id: string;
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ice: string | null;
};

export type InvoiceStatus = "EN_ATTENTE" | "PAYEE";

export type Invoice = {
  id: string;
  number: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  taxRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  client: InvoiceClient;
  createdBy?: { id: string; name: string } | null;
  items: InvoiceItem[];
};
