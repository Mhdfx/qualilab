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

export type CounterKind = "SERIE" | "CONTROLE";

type Tx = Prisma.TransactionClient;

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
 * it in the same `$transaction`.
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

  return { sequence, formatted: formatLabNumber(sequence, year) };
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
