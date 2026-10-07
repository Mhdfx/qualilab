import type { Prisma } from "@/generated/prisma/client";
import { nextNumber } from "./counters";

/**
 * Invoice and credit-note numbers (FACTURATION.md §1–2).
 *
 * « FAC-AAAA-NNNN » and « AV-AAAA-NNNN » are drawn from the counters table
 * (kinds FACTURE and AVOIR), inside the transaction that issues the
 * document: the counter row stays locked until it commits, so two
 * accountants issuing at the same second never draw the same number, and an
 * issue that fails rolls back without leaving a gap. A draft has no number.
 *
 * The former `generateInvoiceNumber()` (highest number + 1, read outside any
 * transaction) is gone: two issues at the same second could read the same
 * highest number. The 09/10/2026 migration started the FACTURE counter at
 * the highest number it had reached.
 */

/** The year a document issued at `at` is numbered in (the container runs in the lab's zone). */
export function documentYear(at: Date): number {
  return at.getFullYear();
}

/** Draws the next « FAC-… » or « AV-… » number. Call inside the issuing `$transaction`. */
export async function drawDocumentNumber(
  tx: Prisma.TransactionClient,
  kind: "FACTURE" | "AVOIR",
  at: Date = new Date()
): Promise<string> {
  const { formatted } = await nextNumber(tx, kind, documentYear(at));
  return formatted;
}
