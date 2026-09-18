import type { Interpretation, LimitKind } from "@/generated/prisma/enums";
import { parseLabValue } from "./result-value";

/**
 * The interpretation engine of chantier 2 (CRITERES.md §4) — pure.
 *
 * A criterion is a sampling plan: n units read, a target m, a ceiling M and
 * a tolerance c (how many units may sit between m and M). The same function
 * runs on the bench while the technician types, at validation and when the
 * report is built, so the three never disagree.
 */

export type Plan = {
  n: number;
  /** Null = 2-class plan (no tolerance). */
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
};

export type UnitReading = {
  raw: string;
  /** The count the reading stands for; null when it is not a count. */
  value: number | null;
  /** Absence tests: true = detected (present), false = absent, null = not an absence test. */
  detected: boolean | null;
  kind: "count" | "below" | "absence" | "presence" | "empty" | "unreadable";
};

export type Verdict = {
  verdict: Interpretation;
  /** Units strictly above M (or above m when M is absent). */
  countAboveM: number;
  /** Units in ]m, M]. */
  countBetween: number;
  /** Units missing or unreadable. */
  missing: number;
  /** One French sentence the screens show next to the verdict. */
  reason: string;
};

const PRESENCE = /^(pr[ée]sence|pr[ée]sent|d[ée]tect[ée]e?|positif|positive|p)$/i;

/**
 * A bench reading, as typed: « 1,2.10² », « < 10 », « Absence », « Présence »
 * or the raw colony count with its dilution, « 3(-2) » = 3 colonies at 10⁻²
 * = 300, « 0(-1) » = below 10 (Q29 refines the dilution rule).
 */
export function parseUnitReading(raw: string): UnitReading {
  const text = (raw ?? "").trim();
  if (!text) return { raw: text, value: null, detected: null, kind: "empty" };
  if (PRESENCE.test(text)) return { raw: text, value: null, detected: true, kind: "presence" };

  const dilution = text.match(/^(\d+)\s*\(\s*-?\s*(\d)\s*\)$/);
  if (dilution) {
    const colonies = Number(dilution[1]);
    const factor = 10 ** Number(dilution[2]);
    return colonies === 0
      ? { raw: text, value: 0, detected: null, kind: "below" }
      : { raw: text, value: colonies * factor, detected: null, kind: "count" };
  }

  const parsed = parseLabValue(text);
  if (parsed.kind === "absence") return { raw: text, value: null, detected: false, kind: "absence" };
  if (parsed.kind === "below") return { raw: text, value: 0, detected: null, kind: "below" };
  if (parsed.kind === "number") return { raw: text, value: parsed.numeric, detected: null, kind: "count" };
  return { raw: text, value: null, detected: null, kind: "unreadable" };
}

/** The reading a report prints for one unit: the count in the lab's notation, or the word. */
export function unitDisplay(reading: UnitReading): string {
  if (reading.kind === "absence") return "Absence";
  if (reading.kind === "presence") return "Présence";
  return reading.raw;
}

export function interpret(plan: Plan, readings: UnitReading[]): Verdict {
  const n = Math.max(1, plan.n);
  const usable = readings.filter((r) => r.kind !== "empty" && r.kind !== "unreadable");
  const missing = n - Math.min(n, usable.length);
  if (usable.length < n) {
    return {
      verdict: "INCOMPLET",
      countAboveM: 0,
      countBetween: 0,
      missing,
      reason: `${missing} unité${missing > 1 ? "s" : ""} sur ${n} non lue${missing > 1 ? "s" : ""}.`,
    };
  }
  const units = usable.slice(0, n);

  if (plan.mKind === "ABSENCE") {
    const detected = units.filter((u) => u.detected === true || (u.detected === null && (u.value ?? 0) > 0)).length;
    return detected > 0
      ? { verdict: "NON_SATISFAISANT", countAboveM: detected, countBetween: 0, missing: 0, reason: `Présence dans ${detected} unité${detected > 1 ? "s" : ""} — absence exigée.` }
      : { verdict: "SATISFAISANT", countAboveM: 0, countBetween: 0, missing: 0, reason: `Absence dans les ${n} unités.` };
  }

  const values = units.map((u) => (u.detected === true ? Number.POSITIVE_INFINITY : u.value ?? 0));

  // Single limit: m alone, or M alone when m is « non spécifiée ».
  const single = plan.mKind === "UNSPECIFIED" ? plan.bigM : plan.bigM === null ? plan.m : null;
  if (single !== null && single !== undefined) {
    const above = values.filter((v) => v > single).length;
    return above > 0
      ? { verdict: "NON_SATISFAISANT", countAboveM: above, countBetween: 0, missing: 0, reason: `${above} unité${above > 1 ? "s" : ""} au-dessus de la limite ${fmt(single)}.` }
      : { verdict: "SATISFAISANT", countAboveM: 0, countBetween: 0, missing: 0, reason: `Toutes les unités ≤ ${fmt(single)}.` };
  }

  if (plan.m === null || plan.bigM === null) {
    return { verdict: "INCOMPLET", countAboveM: 0, countBetween: 0, missing: 0, reason: "Critère incomplet : m ou M manquant." };
  }

  const above = values.filter((v) => v > plan.bigM!).length;
  const between = values.filter((v) => v > plan.m! && v <= plan.bigM!).length;
  if (above > 0) {
    return { verdict: "NON_SATISFAISANT", countAboveM: above, countBetween: between, missing: 0, reason: `${above} unité${above > 1 ? "s" : ""} au-dessus de M = ${fmt(plan.bigM)}.` };
  }
  const tolerance = plan.c ?? 0;
  if (between > tolerance) {
    return { verdict: "NON_SATISFAISANT", countAboveM: 0, countBetween: between, missing: 0, reason: `${between} unités entre m et M pour une tolérance c = ${tolerance}.` };
  }
  if (between > 0) {
    return { verdict: "ACCEPTABLE", countAboveM: 0, countBetween: between, missing: 0, reason: `${between} unité${between > 1 ? "s" : ""} entre m = ${fmt(plan.m)} et M = ${fmt(plan.bigM)} (c = ${tolerance}).` };
  }
  return { verdict: "SATISFAISANT", countAboveM: 0, countBetween: 0, missing: 0, reason: `Toutes les unités ≤ m = ${fmt(plan.m)}.` };
}

/** The sample's verdict is the worst of its parameters; INCOMPLET wins over everything. */
export function worstVerdict(verdicts: Interpretation[]): Interpretation | null {
  if (verdicts.length === 0) return null;
  const rank: Record<Interpretation, number> = { SATISFAISANT: 0, ACCEPTABLE: 1, NON_SATISFAISANT: 2, INCOMPLET: 3 };
  return verdicts.reduce((worst, v) => (rank[v] > rank[worst] ? v : worst));
}

/** The old boolean the alerts and reports still read. */
export function verdictToConform(verdict: Interpretation | null): boolean | null {
  if (verdict === null || verdict === "INCOMPLET") return null;
  return verdict !== "NON_SATISFAISANT";
}

export const INTERPRETATION_LABELS: Record<Interpretation, string> = {
  SATISFAISANT: "Satisfaisant",
  ACCEPTABLE: "Acceptable",
  NON_SATISFAISANT: "Non satisfaisant",
  INCOMPLET: "Incomplet",
};

/** A limit in the lab's notation (« 1.10² ») for messages and reports. */
export function fmt(value: number): string {
  if (value === 0) return "0";
  let exponent = Math.floor(Math.log10(Math.abs(value)));
  let mantissa = Math.round((value / 10 ** exponent) * 10) / 10;
  // 995 rounds to 9,95 → 10,0: carry, otherwise it would print « 10.10² ».
  if (Math.abs(mantissa) >= 10) {
    mantissa /= 10;
    exponent += 1;
  }
  if (exponent < 2) return String(value).replace(".", ",");
  const digits = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
  const sup = String(exponent).split("").map((d) => digits[Number(d)] ?? d).join("");
  return `${String(mantissa).replace(".", ",")}.10${sup}`;
}

/** The criterion as the report prints it: « m = 1.10² · M = 1.10³ · c = 2 ». */
export function planLabel(plan: Plan & { unit?: string | null }): string {
  const unit = plan.unit ? ` ${plan.unit}` : "";
  if (plan.mKind === "ABSENCE") return `Absence${unit}`;
  if (plan.mKind === "UNSPECIFIED") return plan.bigM === null ? "—" : `M = ${fmt(plan.bigM)}${unit}`;
  if (plan.m === null) return "—";
  if (plan.bigM === null) return `≤ ${fmt(plan.m)}${unit}`;
  const c = plan.c === null ? "" : ` · c = ${plan.c}`;
  return `m = ${fmt(plan.m)} · M = ${fmt(plan.bigM)}${unit}${c}`;
}

/**
 * The plan actually applied to a sample: the units the préleveur took
 * decide n (a 3-unit sample against a 5-unit plan is judged on 3), and the
 * tolerance never exceeds n − 1.
 */
export function effectivePlan(plan: Plan, unitCount: number): Plan {
  const n = Math.max(1, Math.min(plan.n, unitCount));
  return { ...plan, n, c: plan.c === null ? null : Math.min(plan.c, n - 1) };
}

/**
 * One figure for the whole line — what the old `value` column and the
 * alerts read: the worst unit. Presence beats everything, absence
 * everywhere prints « Absence », otherwise the highest count.
 */
export function summariseReadings(readings: UnitReading[]): { value: string | null; numeric: number | null } {
  const usable = readings.filter((r) => r.kind !== "empty" && r.kind !== "unreadable");
  if (usable.length === 0) return { value: null, numeric: null };
  if (usable.some((r) => r.kind === "presence")) return { value: "Présence", numeric: null };
  if (usable.every((r) => r.kind === "absence")) return { value: "Absence", numeric: 0 };
  const counts = usable.filter((r) => r.value !== null);
  const max = counts.reduce<UnitReading | null>((best, r) => (best === null || (r.value ?? 0) > (best.value ?? 0) ? r : best), null);
  if (!max) return { value: null, numeric: null };
  // Printed the way the report prints a unit: « < 10 », never « 0(-1) ».
  return { value: unitStoredDisplay({ rawValue: max.raw, value: max.value, detected: max.detected }), numeric: max.value };
}

type CriterionLike = Plan & { normVersion: { current: boolean; version: string } | null };

/** Of several criteria for one germ, the one under the norm version in force. */
export function pickCriterion<T extends CriterionLike>(criteria: T[]): T | null {
  if (criteria.length === 0) return null;
  return (
    criteria.find((c) => c.normVersion?.current) ??
    [...criteria].sort((a, b) => (b.normVersion?.version ?? "").localeCompare(a.normVersion?.version ?? ""))[0]
  );
}

/**
 * The verdict of a whole sample: the worst of its germs.
 *
 * A germ read without a criterion carries no verdict, only the old conform
 * boolean — and a non-conform one still makes the sample « non
 * satisfaisant », otherwise a report could conclude « conforme » above a
 * line printed « Non conforme » (CRITERES.md §2, rule 6).
 */
export function sampleVerdict(
  results: { interpretation: Interpretation | null; conform: boolean | null }[]
): Interpretation | null {
  const verdicts = results
    .map((r) => r.interpretation)
    .filter((v): v is Interpretation => v !== null);
  if (results.some((r) => r.interpretation === null && r.conform === false)) {
    verdicts.push("NON_SATISFAISANT");
  }
  return worstVerdict(verdicts);
}

/** The germs judged on the old limit alone, and found over it. */
export function legacyFailures<T extends { interpretation: Interpretation | null; conform: boolean | null }>(results: T[]): T[] {
  return results.filter((r) => r.interpretation === null && r.conform === false);
}

/**
 * A dilution factor turns the bench reading into the final count, exactly
 * as it does for a single value — so the unit grid and the report agree
 * with the parameter's calcFactor.
 */
export function applyUnitFactor(reading: UnitReading, factor: number): UnitReading {
  if (factor === 1 || reading.kind !== "count" || reading.value === null) return reading;
  return { ...reading, value: reading.value * factor };
}

/** What the report prints for one stored unit: the count, or the word. */
export function unitStoredDisplay(unit: { rawValue: string; value: number | null; detected: boolean | null }): string {
  if (unit.detected === true) return "Présence";
  if (unit.detected === false) return "Absence";
  const raw = unit.rawValue.trim();
  if (unit.value === null) return raw;
  if (unit.value === 0) {
    if (raw.startsWith("<")) return raw;
    const dilution = raw.match(/^0\s*\(\s*-?\s*(\d)\s*\)$/);
    if (dilution) return `< ${fmt(10 ** Number(dilution[1]))}`;
    return raw;
  }
  return fmt(unit.value);
}
