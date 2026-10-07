import type { Prisma } from "@/generated/prisma/client";
import { nextNumber } from "./counters";

/**
 * Sample numbering — Phase 9.
 *
 * The laboratory has two numbers and has always had them:
 *
 * - the **N° de série** (« 2780/26 »), one per série (visit or deposit),
 *   drawn at creation — it is on the signed protocol, it is not secret;
 * - the **N° de contrôle** (« 20353/26 »), one per sample, drawn at
 *   RECEPTION only and never returned to a PRELEVEUR session (the blind rule
 *   of `sample-select.ts`).
 *
 * The internal `Sample.code` is derived, not drawn: « 2780/26-3 » is line 3
 * of série 2780/26. Rows created before Phase 9 keep their old codes
 * (QL-…, QLC-…, SN-…); nothing is renumbered.
 *
 * RETOUR-LABO-06-10.md §5 (V3): a line whose two families are ticked becomes
 * two samples under the same line number, told apart by a letter —
 * « 2780/26-3M » (microbiology) and « 2780/26-3P » (physico-chemistry). A
 * line with a single family keeps the bare « 2780/26-3 ».
 */

/** The letter of each of the two samples of one line. */
export type SampleTwin = "M" | "P";

/** « M » for the microbiology sample of a two-family line, « P » for the
 * physico-chemistry one. */
export function twinFor(family: "MICRO" | "CHIMIE"): SampleTwin {
  return family === "MICRO" ? "M" : "P";
}

/** « 2780/26-3 » — the line's own reference, visible to the préleveur;
 * « 2780/26-3M » / « 2780/26-3P » for the two samples of a two-family line. */
export function sampleCodeFor(serieNumber: string, lineNumber: number, twin?: SampleTwin) {
  return `${serieNumber}-${lineNumber}${twin ?? ""}`;
}

/** Draws the next N° de contrôle inside the receiving transaction. */
export async function assignControlCode(
  tx: Prisma.TransactionClient,
  year = new Date().getFullYear()
) {
  const { formatted } = await nextNumber(tx, "CONTROLE", year);
  return formatted;
}
