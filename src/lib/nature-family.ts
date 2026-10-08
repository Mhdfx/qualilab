import type { Family, LineKind } from "@/generated/prisma/enums";

/**
 * RETOUR-LABO-06-10.md §5 (V3) — the nature of a sample is deduced, never
 * picked by the préleveur.
 *
 * Each sample of a série ticks « Analyses microbiologiques » and / or
 * « Analyses physico-chimiques »; its nature follows from its type (the line
 * kind) and the ticked family. A cell without a nature (mains ×
 * physico-chimie) is a greyed-out box. When both boxes are ticked the line
 * becomes two samples, one per family, each with the nature of its family.
 *
 * The finer natures (cosmetics, supplements…) are not in this table: the
 * laboratory picks them on the programme sheet, within the same family.
 * Samples entered before keep the nature they were given by hand.
 *
 * Pure — no Prisma client: the visit form uses it as well as the API.
 */

/** The two boxes of a sample. `Family.AUTRE` is never offered on a line. */
export type LineFamily = Extract<Family, "MICRO" | "CHIMIE">;

/** The boxes in display order: microbiology first, as on the paper. */
export const LINE_FAMILIES: readonly LineFamily[] = ["MICRO", "CHIMIE"];

/** The nature code of each type × family; null = no such analysis (greyed out). */
export const NATURE_CODE_BY_KIND: Readonly<Record<LineKind, Readonly<Record<LineFamily, string | null>>>> = {
  ALIMENT: { MICRO: "MICRO_ALIMENTS", CHIMIE: "PC_ALIMENTS" },
  SURFACE: { MICRO: "MICRO_SURFACES", CHIMIE: "PC_SURFACES" },
  /** Hands belong to surface microbiology; no physico-chemistry. */
  MAINS: { MICRO: "MICRO_SURFACES", CHIMIE: null },
  EAU: { MICRO: "MICRO_EAUX", CHIMIE: "PC_EAUX" },
  /** Both families since the 08/10 feedback (§8.2): « Physico-chimie de l'air ». */
  AIR: { MICRO: "MICRO_AIR", CHIMIE: "PC_AIR" },
  /** The aseptic effect is filed under physico-chemistry; microbiology of
   * other samples since the 08/10 feedback (§8.2). */
  AUTRE: { MICRO: "MICRO_AUTRE", CHIMIE: "EFFET_ASEPTISANT" },
};

/** The minimal shape of a nature this module reads. */
export type NatureRef = { id: string; code: string; family: Family; active?: boolean | null };

function isLineFamily(family: Family): family is LineFamily {
  return family === "MICRO" || family === "CHIMIE";
}

/** The nature code of a type × family, null when the box is greyed out. */
export function natureCodeFor(kind: LineKind, family: Family): string | null {
  if (!isLineFamily(family)) return null;
  return NATURE_CODE_BY_KIND[kind]?.[family] ?? null;
}

/** The families a sample of this type may tick, in display order. */
export function familiesFor(kind: LineKind): LineFamily[] {
  return LINE_FAMILIES.filter((family) => natureCodeFor(kind, family) !== null);
}

/** The box ticked on a new sample: microbiology when the type has it (every
 * type since 08/10, §8.2 — « Autre » included), otherwise the first box. */
export function defaultFamiliesFor(kind: LineKind): LineFamily[] {
  const available = familiesFor(kind);
  return available.includes("MICRO") ? ["MICRO"] : available.slice(0, 1);
}

/**
 * The active nature of a type × family among the natures loaded from the
 * catalogue; undefined when the box is greyed out or the nature is missing
 * or archived — the caller refuses the sample rather than guessing one.
 */
export function natureFor<N extends NatureRef>(
  natures: readonly N[],
  kind: LineKind,
  family: Family
): N | undefined {
  const code = natureCodeFor(kind, family);
  if (!code) return undefined;
  return natures.find((n) => n.code === code && n.active !== false);
}

/**
 * The family of a nature: its own column, or — for a nature known only by its
 * code — the column of the table that lists it. Undefined for a code outside
 * the table (a finer nature read without its family).
 */
export function familyOfNature(
  nature: { code?: string | null; family?: Family | null } | null | undefined
): Family | undefined {
  if (!nature) return undefined;
  if (nature.family) return nature.family;
  if (!nature.code) return undefined;
  for (const family of LINE_FAMILIES) {
    if (Object.values(NATURE_CODE_BY_KIND).some((row) => row[family] === nature.code)) return family;
  }
  return undefined;
}
