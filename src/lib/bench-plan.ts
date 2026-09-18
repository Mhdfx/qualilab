import "server-only";
import { prisma } from "./prisma";
import { effectivePlan, pickCriterion, planLabel, type Plan } from "./interpretation";

/**
 * The criteria a sample is judged against, one per germ: the bench grid,
 * the results API, the submit check and the validation screen all read the
 * same map, so the verdict shown while typing is the verdict stored.
 */
export type BenchPlan = {
  parameterId: string;
  /** The plan applied to this sample (n capped by the units taken). */
  plan: Plan;
  /** The criterion as written in the catalogue (n = 5…). */
  nominalN: number;
  label: string;
  unit: string | null;
  normVersionId: string | null;
  normLabel: string | null;
};

export type BenchPlans = {
  unitCount: number;
  productType: { id: string; name: string } | null;
  plans: Map<string, BenchPlan>;
};

export async function loadBenchPlans(sampleId: string): Promise<BenchPlans> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      unitCount: true,
      productType: {
        select: {
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
              normVersionId: true,
              normVersion: { select: { label: true, current: true, version: true } },
            },
          },
        },
      },
    },
  });
  const plans = new Map<string, BenchPlan>();
  if (!sample) return { unitCount: 1, productType: null, plans };

  const byParameter = new Map<string, typeof sample.productType extends { criteria: infer C } | null ? C : never>();
  for (const criterion of sample.productType?.criteria ?? []) {
    const list = byParameter.get(criterion.parameterId) ?? [];
    list.push(criterion);
    byParameter.set(criterion.parameterId, list);
  }
  for (const [parameterId, list] of byParameter) {
    const criterion = pickCriterion(list);
    if (!criterion) continue;
    const nominal: Plan = { n: criterion.n, c: criterion.c, mKind: criterion.mKind, m: criterion.m, bigM: criterion.bigM };
    plans.set(parameterId, {
      parameterId,
      plan: effectivePlan(nominal, sample.unitCount),
      nominalN: criterion.n,
      label: planLabel({ ...nominal, unit: criterion.unit }),
      unit: criterion.unit,
      normVersionId: criterion.normVersionId,
      normLabel: criterion.normVersion?.label ?? null,
    });
  }
  return {
    unitCount: sample.unitCount,
    productType: sample.productType ? { id: sample.productType.id, name: sample.productType.name } : null,
    plans,
  };
}
