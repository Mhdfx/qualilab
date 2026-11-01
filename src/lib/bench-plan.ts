import "server-only";
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

export async function loadBenchPlans(sampleId: string): Promise<BenchPlans> {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      unitCount: true,
      lineKind: true,
      surfaceAreaNote: true,
      airMethod: true,
      airExposureMin: true,
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
              // A criterion without a unit is read in the parameter's (`benchUnit`).
              parameter: { select: { unit: true } },
              normVersionId: true,
              normVersion: { select: { label: true, current: true, version: true } },
            },
          },
        },
      },
    },
  });
  const plans = new Map<string, BenchPlan>();
  if (!sample) return { unitCount: 1, productType: null, plans, context: PLAIN_UNIT_CONTEXT };
  const context: UnitContext = {
    lineKind: sample.lineKind,
    surfaceAreaNote: sample.surfaceAreaNote,
    airMethod: sample.airMethod,
    airExposureMin: sample.airExposureMin,
  };

  const byParameter = new Map<string, typeof sample.productType extends { criteria: infer C } | null ? C : never>();
  for (const criterion of sample.productType?.criteria ?? []) {
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
    productType: sample.productType ? { id: sample.productType.id, name: sample.productType.name } : null,
    plans,
    context,
  };
}
