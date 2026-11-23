import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "./prisma";
import { pickCriterion, planLabel, type Plan } from "./interpretation";
import { PLAIN_UNIT_CONTEXT, unitJudges, type UnitContext } from "./result-unit";

/**
 * The criteria a sample is judged against, one per germ: the bench grid,
 * the results API, the submit check and the validation screen all read the
 * same map, so the verdict shown while typing is the verdict stored.
 */
export type BenchPlan = {
  parameterId: string;
  /** The criterion as written in the catalogue (n = 5…); `judgeUnits`
   *  applies it to the units the sampler took. */
  plan: Plan;
  label: string;
  unit: string | null;
  normVersionId: string | null;
  normLabel: string | null;
};

export type BenchPlans = {
  unitCount: number;
  productType: { id: string; name: string } | null;
  plans: Map<string, BenchPlan>;
  /**
   * What was sampled, for the unit of each result (`resultUnit`: J1
   * « UFC/couteau », J2 « UFC/m³ ») and the limits that can judge it
   * (`unitJudges`).
   */
  context: UnitContext;
};

/** What the plans read of a sample (`loadBenchPlansMany`). */
const SAMPLE_PLAN_SELECT = {
  id: true,
  unitCount: true,
  lineKind: true,
  surfaceAreaNote: true,
  airMethod: true,
  airExposureMin: true,
  productTypeId: true,
} as const satisfies Prisma.SampleSelect;

/** What the plans read of a product type: its active criteria, with their norm. */
const PRODUCT_TYPE_PLAN_SELECT = {
  id: true,
  name: true,
  active: true,
  criteria: {
    where: { active: true },
    select: {
      parameterId: true,
      n: true,
      c: true,
      mKind: true,
      m: true,
      bigM: true,
      unit: true,
      // A criterion without a unit is read in the parameter's (`benchUnit`).
      parameter: { select: { unit: true } },
      normVersionId: true,
      normVersion: { select: { label: true, current: true, version: true } },
    },
  },
} as const satisfies Prisma.ProductTypeSelect;

type PlanProductType = Prisma.ProductTypeGetPayload<{ select: typeof PRODUCT_TYPE_PLAN_SELECT }>;

/** A sample unknown to the database: judged by nothing, read plainly. */
export function emptyBenchPlans(): BenchPlans {
  return { unitCount: 1, productType: null, plans: new Map(), context: PLAIN_UNIT_CONTEXT };
}

/** One sample's plans from its product type's criteria — the same pick for every reader. */
function buildBenchPlans(
  sample: { unitCount: number } & UnitContext,
  productType: PlanProductType | null
): BenchPlans {
  const plans = new Map<string, BenchPlan>();
  const context: UnitContext = {
    lineKind: sample.lineKind,
    surfaceAreaNote: sample.surfaceAreaNote,
    airMethod: sample.airMethod,
    airExposureMin: sample.airExposureMin,
  };

  const byParameter = new Map<string, PlanProductType["criteria"]>();
  for (const criterion of productType?.criteria ?? []) {
    const list = byParameter.get(criterion.parameterId) ?? [];
    list.push(criterion);
    byParameter.set(criterion.parameterId, list);
  }
  for (const [parameterId, list] of byParameter) {
    const criterion = pickCriterion(list);
    if (!criterion) continue;
    // Expressed per another basis than what was sampled (« UFC/cm² » on a
    // couteau, « ufc/m3 » on an exposed plate): it cannot judge this line,
    // which is read without it — sans interprétation (J1, J2, J3).
    if (!unitJudges(context, criterion.unit ?? criterion.parameter.unit)) continue;
    const plan: Plan = { n: criterion.n, c: criterion.c, mKind: criterion.mKind, m: criterion.m, bigM: criterion.bigM };
    plans.set(parameterId, {
      parameterId,
      plan,
      label: planLabel({ ...plan, unit: criterion.unit }),
      unit: criterion.unit,
      normVersionId: criterion.normVersionId,
      normLabel: criterion.normVersion?.label ?? null,
    });
  }
  return {
    unitCount: sample.unitCount,
    productType: productType ? { id: productType.id, name: productType.name } : null,
    plans,
    context,
  };
}

/**
 * The plans of several samples at once — the printed bench sheet (Perf 3,
 * P2-6): one read of the samples, one of their distinct product types with
 * their criteria, whatever the number of samples. Keyed by sample id; a
 * sample the database does not know is absent (`loadBenchPlans` reads it
 * as judged by nothing).
 */
export async function loadBenchPlansMany(sampleIds: readonly string[]): Promise<Map<string, BenchPlans>> {
  const result = new Map<string, BenchPlans>();
  const ids = [...new Set(sampleIds)];
  if (ids.length === 0) return result;
  const samples = await prisma.sample.findMany({ where: { id: { in: ids } }, select: SAMPLE_PLAN_SELECT });
  const typeIds = [...new Set(samples.flatMap((sample) => (sample.productTypeId ? [sample.productTypeId] : [])))];
  const types =
    typeIds.length > 0
      ? await prisma.productType.findMany({ where: { id: { in: typeIds } }, select: PRODUCT_TYPE_PLAN_SELECT })
      : [];
  const typeById = new Map(types.map((type) => [type.id, type]));
  for (const sample of samples) {
    result.set(sample.id, buildBenchPlans(sample, sample.productTypeId ? typeById.get(sample.productTypeId) ?? null : null));
  }
  return result;
}

/** One sample's plans: the bench screen, the results API, the submit check, the validation screen. */
export async function loadBenchPlans(sampleId: string): Promise<BenchPlans> {
  return (await loadBenchPlansMany([sampleId])).get(sampleId) ?? emptyBenchPlans();
}
