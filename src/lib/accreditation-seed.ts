import type { AccreditationStatus } from "@/generated/prisma/enums";
import { accreditationFromLegacyName, type AccreditationUpdate } from "./accreditation";

/**
 * The first list of accredited parameters (lot 4, S12 — RETOUR-LABO-04-11.md
 * §2 Q13: « en microbiologie et histamine, ça dépend des cas »). Until the
 * laboratory sends its list (C-4), the proposal is — hypothèse, à confirmer
 * par C-4:
 *
 *   1. a mark of the old software in the name decides (« * » = non accrédité,
 *      « (SA) » / « (SN) » = sous-traité) — never overridden;
 *   2. ONLY WITH `domains: true` (script flag `--domains`): otherwise a
 *      microbiology parameter (`family` MICRO) and a histamine (by name,
 *      whatever the family) are « Accrédité ». Off by default: the laboratory
 *      wrote « ça dépend des cas », so a blanket « Accrédité » would print the
 *      accreditation logo on reports the lab never confirmed (ISO 17025 §7.8).
 *      Never `--domains` in production before the lab's list (C-4);
 *   3. everything else stays « à préciser » (null: no mark, no logo).
 *
 * Only parameters still « à préciser » are proposed: a status already
 * recorded by hand is never rewritten. Pure — used by
 * `scripts/s12-accreditation.mts`, which writes through the admin route
 * (`PATCH /api/parameters/accreditation`, journalled).
 */

export type AccreditationSeedRow = {
  id: string;
  name: string;
  family: string | null;
  accreditation: AccreditationStatus | null;
};

export type AccreditationSeedWhy = "MARQUE_ANCIEN_LOGICIEL" | "MICROBIOLOGIE" | "HISTAMINE";

export type AccreditationSeedEntry = AccreditationUpdate & { name: string; why: AccreditationSeedWhy };

export type AccreditationSeedPlan = {
  /** What the script writes. */
  set: AccreditationSeedEntry[];
  /** Already carrying a status: left as recorded. */
  kept: number;
  /** Still « à préciser » after the plan (physico-chimie other than histamine, « autre »). */
  leftUnknown: number;
};

const HISTAMINE = /histamine/i;

/** The status proposed for one parameter still « à préciser », or null (left so). */
export type AccreditationSeedOptions = {
  /** Also propose « Accrédité » for microbiology and histamine (hypothèse C-4). Default false: old-software marks only. */
  domains?: boolean;
};

export function accreditationSeedFor(
  row: Pick<AccreditationSeedRow, "name" | "family">,
  opts: AccreditationSeedOptions = {},
): { status: AccreditationStatus; why: AccreditationSeedWhy } | null {
  const legacy = accreditationFromLegacyName(row.name);
  if (legacy) return { status: legacy, why: "MARQUE_ANCIEN_LOGICIEL" };
  if (!opts.domains) return null;
  if (HISTAMINE.test(row.name)) return { status: "ACCREDITE", why: "HISTAMINE" };
  if (row.family === "MICRO") return { status: "ACCREDITE", why: "MICROBIOLOGIE" };
  return null;
}

export function accreditationSeedPlan(rows: readonly AccreditationSeedRow[], opts: AccreditationSeedOptions = {}): AccreditationSeedPlan {
  const set: AccreditationSeedEntry[] = [];
  let kept = 0;
  let leftUnknown = 0;
  for (const row of rows) {
    if (row.accreditation !== null && row.accreditation !== undefined) {
      kept += 1;
      continue;
    }
    const seed = accreditationSeedFor(row, opts);
    if (!seed) {
      leftUnknown += 1;
      continue;
    }
    set.push({ id: row.id, accreditation: seed.status, name: row.name, why: seed.why });
  }
  return { set, kept, leftUnknown };
}
