import type { LimitKind } from "@/generated/prisma/enums";
import type { CriterionRef, ProductTypeRef, ProgrammeReferentialData } from "./programme-sheet-types";

/**
 * The programme sheet's referential as it travels (lot performance P2-1):
 * the programme page's RSC payload and the JSON of
 * `GET /api/samples/[id]/programme`.
 *
 * The referential carries every family of the catalogue with all its
 * criteria — thousands of rows. Sent as `ProgrammeReferentialData`, each
 * criterion repeats its germ's name and its norm version as objects. Here a
 * criterion is a tuple, and the names and norm versions are said once, in
 * two dictionaries; `hydrateReferential` rebuilds exactly the
 * `ProgrammeReferentialData` the sheet's logic reads — nothing else changes.
 *
 * Pure and client-safe.
 */

/** One criterion: `[parameterId, n, c, mKind, m, bigM, unit, normVersionId]`. */
export type CompactCriterion = [
  parameterId: string,
  n: number,
  c: number | null,
  mKind: LimitKind,
  m: number | null,
  bigM: number | null,
  unit: string | null,
  normVersionId: string | null,
];

export type CompactProductType = Omit<ProductTypeRef, "criteria"> & { criteria: CompactCriterion[] };

export type ProgrammeReferentialWire = Omit<ProgrammeReferentialData, "productTypes"> & {
  productTypes: CompactProductType[];
  /** The name of every germ a criterion names, by parameter id. */
  criterionParameterNames: Record<string, string>;
  /** Every norm version a criterion names, by its id. */
  criterionNormVersions: Record<string, NonNullable<CriterionRef["normVersion"]>>;
};

/** The referential as it travels: each criterion a tuple, names and norm versions said once. */
export function compactReferential(referential: ProgrammeReferentialData): ProgrammeReferentialWire {
  const criterionParameterNames: Record<string, string> = {};
  const criterionNormVersions: Record<string, NonNullable<CriterionRef["normVersion"]>> = {};
  const productTypes = referential.productTypes.map(({ criteria, ...type }) => ({
    ...type,
    criteria: criteria.map((criterion): CompactCriterion => {
      criterionParameterNames[criterion.parameterId] = criterion.parameterName;
      if (criterion.normVersionId !== null && criterion.normVersion) {
        criterionNormVersions[criterion.normVersionId] = criterion.normVersion;
      }
      return [
        criterion.parameterId,
        criterion.n,
        criterion.c,
        criterion.mKind,
        criterion.m,
        criterion.bigM,
        criterion.unit,
        criterion.normVersionId,
      ];
    }),
  }));
  return { ...referential, productTypes, criterionParameterNames, criterionNormVersions };
}

/**
 * The referential the sheet reads, rebuilt from what travelled. An already
 * whole referential (no dictionaries) is returned as it is.
 */
export function hydrateReferential(
  wire: ProgrammeReferentialWire | ProgrammeReferentialData
): ProgrammeReferentialData {
  if (!("criterionParameterNames" in wire)) return wire;
  const { criterionParameterNames, criterionNormVersions, productTypes, ...rest } = wire;
  return {
    ...rest,
    productTypes: productTypes.map(({ criteria, ...type }) => ({
      ...type,
      criteria: criteria.map(([parameterId, n, c, mKind, m, bigM, unit, normVersionId]): CriterionRef => ({
        parameterId,
        parameterName: criterionParameterNames[parameterId] ?? "",
        n,
        c,
        mKind,
        m,
        bigM,
        unit,
        normVersionId,
        normVersion: normVersionId === null ? null : (criterionNormVersions[normVersionId] ?? null),
      })),
    })),
  };
}
