/**
 * How an analysis reads where it is ticked (the old software's « Paramètre(s)
 * à rechercher », reviewed with the laboratory on 14/10): its name, then a
 * muted line with the norm version in force and the unit — « NM ISO 6579 -
 * 1:2021 · /25g », as the old software printed « Recherche des
 * Salmonella~NM ISO 6579 - 1:2021 /25g ». Display only: what a form sends
 * never changes. No Prisma here, so a client component and a route both
 * read it.
 */

/** A version of one of the norms a parameter's criteria cite (`normVersionsForParameters`). */
export type NormVersionLike = { label: string; current: boolean };

/**
 * The version in force of a parameter, as the report prints it: the first
 * version flagged `current`, in the order `normVersionsForParameters` lists
 * them (by norm code, the version in force first) — the one the programme
 * sheet proposes when no product type names another (`defaultNormVersionId`).
 * Null when the parameter cites no norm, or none of its norms has a version
 * in force.
 */
export function normInForce(versions: readonly NormVersionLike[]): string | null {
  const version = versions.find((candidate) => candidate.current && candidate.label.trim() !== "");
  return version ? version.label.trim() : null;
}

/**
 * The muted line under an analysis: « norme · unité ». Either part alone
 * when the other is unknown; null when neither is — the name then stands
 * alone.
 */
export function parameterCaption(parameter: { normLabel?: string | null; unit?: string | null }): string | null {
  const parts = [parameter.normLabel, parameter.unit].flatMap((part) => {
    const trimmed = part?.trim();
    return trimmed ? [trimmed] : [];
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}
