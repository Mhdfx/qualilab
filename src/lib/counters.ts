import type { Prisma } from "@/generated/prisma/client";

/**
 * The laboratory's yearly sequences.
 *
 * The lab has always numbered its work « NNNN/AA »: one sequence per year for
 * the séries (visits and deposits — « 2780/26 ») and one for the samples
 * (« 20353/26 »). These numbers are on the tubes, the cahiers, the invoices
 * and the client portal, so the new system continues them rather than
 * inventing its own.
 *
 * `nextNumber()` must be called INSIDE the transaction that creates the
 * numbered row: the counter row is locked (`SELECT … FOR UPDATE`) until the
 * transaction commits, so two receptions running at the same second can
 * never draw the same number, and a failed creation never burns one.
 */

export type CounterKind = "SERIE" | "CONTROLE" | "FACTURE" | "AVOIR";

/**
 * FACTURATION.md §1–2 — the invoices (« FAC-2026-0042 ») and the credit notes
 * (« AV-2026-0003 ») have their own yearly sequences in the same table. The
 * 09/10/2026 migration started FACTURE at the highest number already issued.
 */
export const DOCUMENT_NUMBER_PREFIX = { FACTURE: "FAC", AVOIR: "AV" } as const;

type Tx = Prisma.TransactionClient;

/** « FAC-2026-0042 » / « AV-2026-0003 » — prefix, four-digit year, at least four digits. */
export function formatDocumentNumber(
  kind: "FACTURE" | "AVOIR",
  sequence: number,
  year: number
) {
  return `${DOCUMENT_NUMBER_PREFIX[kind]}-${year}-${String(sequence).padStart(4, "0")}`;
}

/** The number a counter draw prints: lab format for the séries and samples, document format for invoices. */
export function formatCounterNumber(kind: CounterKind, sequence: number, year: number) {
  return kind === "FACTURE" || kind === "AVOIR"
    ? formatDocumentNumber(kind, sequence, year)
    : formatLabNumber(sequence, year);
}

/** « 2780/26 » — the lab's format: sequence, slash, two-digit year. */
export function formatLabNumber(sequence: number, year: number) {
  return `${sequence}/${String(year % 100).padStart(2, "0")}`;
}

/**
 * Parses « 2780/26 » back into its parts. Returns null for anything else,
 * so a search box can tell a lab number from a free text.
 */
export function parseLabNumber(
  value: string
): { sequence: number; year: number } | null {
  const match = /^\s*(\d{1,6})\s*\/\s*(\d{2})\s*$/.exec(value);
  if (!match) return null;
  const sequence = Number(match[1]);
  const yy = Number(match[2]);
  if (sequence < 1) return null;
  // The lab's numbering starts in the 2000s; « /99 » would be 2099, which
  // is fine — the two-digit year is unambiguous for a century.
  return { sequence, year: 2000 + yy };
}

/**
 * Draws the next number of a sequence, atomically, inside `tx`.
 *
 * The row is created on first use of a year. The lock is held by the
 * transaction: callers must draw the number and create the row that carries
 * it in the same `$transaction`. `formatted` follows the kind: « 2780/26 »
 * for SERIE / CONTROLE, « FAC-2026-0042 » / « AV-2026-0003 » for FACTURE /
 * AVOIR — a failed issue rolls back and never burns a number.
 */
export async function nextNumber(
  tx: Tx,
  kind: CounterKind,
  year: number
): Promise<{ sequence: number; formatted: string }> {
  await tx.$executeRaw`
    INSERT INTO \`Counter\` (\`kind\`, \`year\`, \`last\`)
    VALUES (${kind}, ${year}, 0)
    ON DUPLICATE KEY UPDATE \`last\` = \`last\``;

  const rows = await tx.$queryRaw<{ last: number }[]>`
    SELECT \`last\` FROM \`Counter\`
    WHERE \`kind\` = ${kind} AND \`year\` = ${year}
    FOR UPDATE`;

  const sequence = Number(rows[0]?.last ?? 0) + 1;

  await tx.$executeRaw`
    UPDATE \`Counter\` SET \`last\` = ${sequence}
    WHERE \`kind\` = ${kind} AND \`year\` = ${year}`;

  return { sequence, formatted: formatCounterNumber(kind, sequence, year) };
}

/**
 * Sets the value the next draw will follow — used once at switch-over so the
 * sequences continue where the old software stopped (e.g. 2779 → next 2780).
 * Refuses to go backwards below what is already used.
 */
export async function setCounter(
  tx: Tx,
  kind: CounterKind,
  year: number,
  last: number
) {
  if (!Number.isInteger(last) || last < 0) {
    throw new Error("La valeur du compteur doit être un entier positif.");
  }
  await tx.$executeRaw`
    INSERT INTO \`Counter\` (\`kind\`, \`year\`, \`last\`)
    VALUES (${kind}, ${year}, ${last})
    ON DUPLICATE KEY UPDATE \`last\` = GREATEST(\`last\`, ${last})`;
}
