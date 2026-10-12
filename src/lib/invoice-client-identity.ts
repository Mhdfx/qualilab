/**
 * The client an invoice is addressed to, frozen at issue (FACTURATION.md §1:
 * « once issued it is never modified again »).
 *
 * An issued invoice or credit note keeps, in `Invoice.clientSnapshot`, the six
 * fields its PDF prints — name, address, contact, phone, e-mail, ICE — copied
 * from the client in the issuing transaction. A later rename, a new address
 * or a merge (`/api/clients/[id]/merge` moves the invoices to the kept client)
 * then no longer changes what an issued document says. A draft has no
 * snapshot: it is addressed to the client as it is today until it is issued.
 *
 * Pure and client-safe: the routes write `clientSnapshotOf(...)`, the PDF and
 * the invoice fiche read `invoiceClientIdentity(...)`.
 */

/** What an invoice prints about its client. */
export type InvoiceClientIdentity = {
  name: string;
  address: string | null;
  contact: string | null;
  phone: string | null;
  email: string | null;
  ice: string | null;
};

const OPTIONAL_FIELDS = ["address", "contact", "phone", "email", "ice"] as const;

/** The client columns the snapshot copies (a Prisma `select`). */
export const CLIENT_IDENTITY_SELECT = {
  name: true,
  address: true,
  contact: true,
  phone: true,
  email: true,
  ice: true,
} as const;

/**
 * The snapshot to store at issue: exactly the six printed fields of the
 * client row (or of the credited invoice's identity, for a credit note).
 */
export function clientSnapshotOf(client: InvoiceClientIdentity): InvoiceClientIdentity {
  return {
    name: client.name,
    address: client.address ?? null,
    contact: client.contact ?? null,
    phone: client.phone ?? null,
    email: client.email ?? null,
    ice: client.ice ?? null,
  };
}

/**
 * Reads a stored snapshot back, or null when there is none or it is not of
 * the expected shape (never throws: a damaged row falls back to the live
 * client rather than breaking the PDF). A JSON string is accepted too, in
 * case the driver hands the column back unparsed.
 */
export function parseClientSnapshot(value: unknown): InvoiceClientIdentity | null {
  let raw = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  if (typeof record.name !== "string" || !record.name.trim()) return null;
  const identity: InvoiceClientIdentity = {
    name: record.name,
    address: null,
    contact: null,
    phone: null,
    email: null,
    ice: null,
  };
  for (const field of OPTIONAL_FIELDS) {
    const fieldValue = record[field];
    if (fieldValue === undefined || fieldValue === null) continue;
    if (typeof fieldValue !== "string") return null;
    identity[field] = fieldValue;
  }
  return identity;
}

/**
 * The client as the invoice prints it: the snapshot taken at issue, else the
 * live client. A draft (no number) always reads the live client — it is not
 * issued yet, and a stray snapshot on it is ignored.
 */
export function invoiceClientIdentity(invoice: {
  number: string | null;
  clientSnapshot?: unknown;
  client: InvoiceClientIdentity;
}): InvoiceClientIdentity {
  const snapshot = invoice.number !== null ? parseClientSnapshot(invoice.clientSnapshot) : null;
  return snapshot ?? clientSnapshotOf(invoice.client);
}
