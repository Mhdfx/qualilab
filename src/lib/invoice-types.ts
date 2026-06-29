export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
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

export type Invoice = {
  id: string;
  number: string;
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
