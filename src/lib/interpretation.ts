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

/**
 * The one limit of a two-class plan: m alone, M alone (m « non spécifiée »),
 * or m = M — a plan whose m and M coincide has no « between » zone. Null
 * for a three-class plan (m < M) or an absence test.
 */
export function singleLimit(plan: Plan): number | null {
  if (plan.mKind === "ABSENCE") return null;
  if (plan.mKind === "UNSPECIFIED") return plan.bigM;
  if (plan.m !== null && plan.bigM === null) return plan.m;
  if (plan.m !== null && plan.bigM !== null && plan.m === plan.bigM) return plan.m;
  return null;
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

  // Single limit: m alone, M alone when m is « non spécifiée », or m = M.
  // c counts the units tolerated above it, shown « Acceptable » (answer of
  // the laboratory to Q31, RETOUR-LABO-30-09.md §2 H1).
  const single = singleLimit(plan);
  if (single !== null) {
    const above = values.filter((v) => v > single).length;
    const tolerance = plan.c ?? 0;
    const s = above > 1 ? "s" : "";
    if (above === 0) {
      return { verdict: "SATISFAISANT", countAboveM: 0, countBetween: 0, missing: 0, reason: `Toutes les unités ≤ ${fmt(single)}.` };
    }
    if (above <= tolerance) {
      return { verdict: "ACCEPTABLE", countAboveM: above, countBetween: 0, missing: 0, reason: `${above} unité${s} au-dessus de la limite ${fmt(single)}, toléré${s} (c = ${tolerance}).` };
    }
    return {
      verdict: "NON_SATISFAISANT",
      countAboveM: above,
      countBetween: 0,
      missing: 0,
      reason: `${above} unité${s} au-dessus de la limite ${fmt(single)}${tolerance > 0 ? ` pour une tolérance c = ${tolerance}` : ""}.`,
    };
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
 * Whether a plan can judge anything: an absence test, or at least one limit.
 * The workbook's « Non spécifié » rows without M (101 of them) cannot — the
 * germ is analysed and printed, with no verdict.
 */
export function hasLimit(plan: Plan): boolean {
  if (plan.mKind === "ABSENCE") return true;
  if (plan.mKind === "UNSPECIFIED") return plan.bigM !== null;
  return plan.m !== null || plan.bigM !== null;
}

export type Judgement = {
  /** The verdict the report prints; null when too few units were taken. */
  official: Verdict | null;
  /** The indicative verdict of the e-mail when there is no official one. */
  informal: Verdict | null;
};

/**
 * One germ judged over the units the sampler took (RETOUR-LABO-29-09.md §3,
 * rule 2). `readings` has one entry per unit taken, read or not.
 *
 *   units taken ≥ the plan's n → the plan, applied to every unit taken
 *                                (a unit read above M always counts);
 *   units taken < the plan's n → no official verdict: the report prints the
 *                                readings without one, and the e-mail carries
 *                                the indicative verdict of `informalVerdict`.
 *
 * Until every unit taken is read the official verdict is INCOMPLET, which
 * is what keeps the sheet from being submitted.
 */
export function judgeUnits(plan: Plan, readings: UnitReading[]): Judgement {
  const taken = Math.max(1, readings.length);
  const read = readings.filter((r) => r.kind !== "empty" && r.kind !== "unreadable").length;
  // « Non spécifié » without any limit: the germ is analysed and reported,
  // never judged — neither officially nor indicatively.
  if (!hasLimit(plan)) {
    return { official: read < taken ? interpret({ ...plan, n: taken }, readings) : null, informal: null };
  }
  if (taken >= plan.n || read < taken) {
    return { official: interpret({ ...plan, n: taken }, readings), informal: null };
  }
  return { official: null, informal: informalVerdict(plan, readings) };
}

/**
 * The laboratory's indicative reading when a sample was taken on fewer units
 * than its plan (point 4 of 29/09): each unit on its own — satisfaisant
 * ≤ m, acceptable between m and M, non satisfaisant above M — and the worst
 * unit decides. No tolerance c: there is no plan to tolerate against.
 */
export function informalVerdict(plan: Plan, readings: UnitReading[]): Verdict {
  const units = readings.filter((r) => r.kind !== "empty" && r.kind !== "unreadable");
  const k = units.length;
  const on = `Indicatif, sur ${k} unité${k > 1 ? "s" : ""} au lieu de ${plan.n}`;
  const none = { countAboveM: 0, countBetween: 0, missing: 0 };
  if (k === 0) return { ...none, verdict: "INCOMPLET", missing: plan.n, reason: "Aucune unité lue." };

  if (plan.mKind === "ABSENCE") {
    const detected = units.filter((u) => u.detected === true || (u.detected === null && (u.value ?? 0) > 0)).length;
    return detected > 0
      ? { ...none, verdict: "NON_SATISFAISANT", countAboveM: detected, reason: `${on} : présence — absence exigée.` }
      : { ...none, verdict: "SATISFAISANT", reason: `${on} : absence.` };
  }

  const values = units.map((u) => (u.detected === true ? Number.POSITIVE_INFINITY : u.value ?? 0));
  const single = singleLimit(plan);
  if (single !== null) {
    const above = values.filter((v) => v > single).length;
    return above > 0
      ? { ...none, verdict: "NON_SATISFAISANT", countAboveM: above, reason: `${on} : au-dessus de la limite ${fmt(single)}.` }
      : { ...none, verdict: "SATISFAISANT", reason: `${on} : ≤ ${fmt(single)}.` };
  }
  if (plan.m === null || plan.bigM === null) {
    return { ...none, verdict: "INCOMPLET", reason: "Critère incomplet : m ou M manquant." };
  }
  const above = values.filter((v) => v > plan.bigM!).length;
  const between = values.filter((v) => v > plan.m! && v <= plan.bigM!).length;
  if (above > 0) return { ...none, verdict: "NON_SATISFAISANT", countAboveM: above, countBetween: between, reason: `${on} : au-dessus de M = ${fmt(plan.bigM)}.` };
  if (between > 0) return { ...none, verdict: "ACCEPTABLE", countBetween: between, reason: `${on} : entre m = ${fmt(plan.m)} et M = ${fmt(plan.bigM)}.` };
  return { ...none, verdict: "SATISFAISANT", reason: `${on} : ≤ m = ${fmt(plan.m)}.` };
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
 *
 * A germ judged only indicatively (too few units, RETOUR-LABO-29-09.md §3
 * rule 2) takes the official conclusion away from the whole sample: a
 * report concluding « satisfaisant » over a germ nobody could judge would
 * say more than the laboratory knows.
 */
export function sampleVerdict(
  results: { interpretation: Interpretation | null; conform: boolean | null; informalInterpretation?: Interpretation | null }[]
): Interpretation | null {
  if (results.some((r) => r.interpretation === null && r.informalInterpretation)) return null;
  const verdicts = results
    .map((r) => r.interpretation)
    .filter((v): v is Interpretation => v !== null);
  if (results.some((r) => r.interpretation === null && r.conform === false)) {
    verdicts.push("NON_SATISFAISANT");
  }
  return worstVerdict(verdicts);
}

/**
 * The conclusion the e-mail gives when the report has none (point 4 of
 * 29/09): every germ's official verdict, or its indicative one.
 */
export function indicativeVerdict(
  results: { interpretation: Interpretation | null; conform: boolean | null; informalInterpretation?: Interpretation | null }[]
): Interpretation | null {
  return sampleVerdict(
    results.map((r) => ({ interpretation: r.interpretation ?? r.informalInterpretation ?? null, conform: r.conform }))
  );
}

/**
 * A plan read back from its frozen copy on a result (Result.criterion,
 * JSON): anything malformed reads as « no criterion » rather than a wrong one.
 */
export function storedPlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const kinds: LimitKind[] = ["VALUE", "ABSENCE", "UNSPECIFIED"];
  if (!kinds.includes(p.mKind as LimitKind) || num(p.n) === null) return null;
  return { n: num(p.n)!, c: num(p.c), mKind: p.mKind as LimitKind, m: num(p.m), bigM: num(p.bigM) };
}

/** No germ carries any judgement: no verdict, no limit, nothing indicative. */
export function nothingJudged(
  results: { interpretation: Interpretation | null; conform: boolean | null; informalInterpretation?: Interpretation | null }[]
): boolean {
  return results.length > 0 && results.every((r) => r.interpretation === null && r.conform === null && !r.informalInterpretation);
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
