import type { Family, SampleType } from "@/generated/prisma/enums";
import { sensitiveNeedsLimit } from "./parameter-validation";

/**
 * The analyses that raise the contamination alert (re-ask 2.21, the
 * laboratory's answer of 28/10 — « Salmonella et Listeria et E. coli dans
 * les aliments, Eaux et surfaces »; RETOUR-LABO-28-10.md S3, #35). Neither
 * the enterococci nor Pseudomonas. The flag is `AnalysisParameter.alertOnExceed`,
 * set in /admin/parametres; this module only decides WHICH parameters of the
 * catalogue the answer names, so the script that sets them through the
 * admin route (`scripts/s3-contamination-alerts.mts`) and its test agree.
 *
 * Pure. The catalogue is read as it is: every category the answer covers —
 * food (`ALIMENTAIRE`), water (`EAU`), surfaces (`AMBIANCE`, shared with the
 * air) — and every twin created by the reprise F3, matched on the name and
 * the aliases, microbiology only.
 *
 * « Listeria » waits for R-14 (Listeria monocytogenes seule, ou aussi
 * Listeria spp. ?): the script's default scope is `NONE` — every Listeria
 * is listed `deferred`, never set nor cleared (RETOUR-LABO-28-10.md §7 S3,
 * « Listeria après R-14 »). `ALL` reads the genus as the laboratory wrote it,
 * `MONOCYTOGENES` narrows it; a Listeria outside the scope is `deferred`
 * too. The functions' own default stays `ALL` (the answer as written).
 *
 * A DETECTION (presence / absence: a unit « /25 g », « /5 L », « /cm² » —
 * no « UFC ») without a limit gets the flag ONLY: with J3 on
 * (`NO_CRITERION_NO_INTERPRETATION`) such a line is never judged and O-12
 * alerts on the germ's detection alone, so no criterion is invented — a
 * limit 0 would turn every such detection into a judged « Non conforme »
 * line the laboratory never asked for (« si on n'a pas de critère, nous ne
 * faisons pas d'interprétation »). Switch J3 off, the admin route refuses a
 * sensitive parameter without a limit again (`sensitiveNeedsLimit`), and the
 * plan gives the detection the limit 0 (« Absence ») with its flag, as
 * before. An ENUMERATION (UFC/g, UFC/cm², UFC/mains…) without a limit is not
 * flagged by default: its limit (or its criterion) is the laboratory's to
 * give, never invented here — listed `needsLimit`.
 *
 * Lot 4A (S10, the answer of 04/11 to Q10, RETOUR-LABO-04-11.md §1): « pour
 * les comptages, alerte dès qu'on en trouve (plus de 0) » — the enumerations
 * the question cited (`citedEnumeration`: E. coli on surfaces and hands,
 * E. coli « présumés », L. monocytogenes in water) alert from the first
 * colony. With `enumerations` (the script's `--enumerations`) and J3 on,
 * those are flagged WITHOUT a limit: J3 leaves them unjudged and O-12
 * alerts as soon as the reading is > 0 (`contamination-alert.ts`). Never a
 * limit written; J3 off, they stay `needsLimit` (the route would refuse a
 * sensitive parameter without one). Any other enumeration without a limit
 * stays `needsLimit` — « si on a besoin on en ajoute au futur »: the
 * laboratory ticks « alerte » itself in /admin/parametres.
 */

export type AlertGerm = "SALMONELLA" | "LISTERIA" | "E_COLI";

export const ALERT_GERM_LABELS: Record<AlertGerm, string> = {
  SALMONELLA: "Salmonella",
  LISTERIA: "Listeria",
  E_COLI: "E. coli",
};

/** The categories of the answer: « aliments, eaux et surfaces ». */
export const ALERT_CATEGORIES: readonly SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

export type ListeriaScope = "NONE" | "ALL" | "MONOCYTOGENES";

export type AlertParameter = {
  id: string;
  name: string;
  aliases?: string | null;
  family: Family;
  category: SampleType;
  alertOnExceed: boolean;
  unit?: string | null;
  limitValue?: number | string | null;
};

/**
 * A detection — presence / absence in a quantity: the unit reads « /25 g »,
 * « /5 L », « /100 ml », « /cm² », never « UFC » (an enumeration). Unknown
 * without a unit.
 */
export function isDetection(unit: string | null | undefined): boolean {
  const u = (unit ?? "").trim();
  return u.startsWith("/") && !/ufc|npp|nppl/i.test(u);
}

/** Lower-cased, unaccented, punctuation as spaces: « E.coli » → « e coli ». */
function words(text: string): string {
  return ` ${text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()} `;
}

/** The germ a spelling names, or null. */
function germOfSpelling(spelling: string, listeria: ListeriaScope): AlertGerm | null {
  const w = words(spelling);
  if (/ salmonell/.test(w)) return "SALMONELLA";
  // « Listeria spp. », « Listeria monocytogenes », « L. monocytogenes ».
  if (/ listeria/.test(w) || / l monocytogenes /.test(w)) {
    if (listeria === "ALL") return "LISTERIA";
    return listeria === "MONOCYTOGENES" && / monocytogenes /.test(w) ? "LISTERIA" : null;
  }
  if (/ (e|escherichia) coli /.test(w)) return "E_COLI";
  return null;
}

/**
 * The germ of the answer this parameter is, or null: microbiology, a
 * category of the answer, and its name or one of its aliases (one per line)
 * naming Salmonella, Listeria or E. coli.
 */
export function alertGermOf(parameter: Omit<AlertParameter, "id" | "alertOnExceed">, listeria: ListeriaScope = "ALL"): AlertGerm | null {
  if (parameter.family !== "MICRO" || !ALERT_CATEGORIES.includes(parameter.category)) return null;
  const spellings = [parameter.name, ...(parameter.aliases ?? "").split(/\r?\n/)].filter((s) => s.trim() !== "");
  for (const spelling of spellings) {
    const germ = germOfSpelling(spelling, listeria);
    if (germ) return germ;
  }
  return null;
}

export type AlertPlanRow = Pick<AlertParameter, "id" | "name" | "category"> & {
  germ: AlertGerm | null;
  unit?: string | null;
};

/**
 * A row to set, with the body of its PATCH: the flag — and, switch J3 off
 * only, the limit 0 of a detection without one. `enumeration`: a cited
 * enumeration flagged without a limit (`--enumerations`, S10 — O-12: > 0).
 */
export type AlertPlanWrite = AlertPlanRow & { patch: { alertOnExceed: true; limitValue?: 0 }; enumeration?: true };

/**
 * The enumerations the question of 02/11 cited and the laboratory confirmed
 * on 04/11 (Q10: « alerte dès qu'on en trouve (plus de 0) »): E. coli on
 * surfaces and hands (the category `AMBIANCE` — a surface or hands unit or
 * name, never the air: `surfaceOrHands`), E. coli « présumés » (any
 * category), L. monocytogenes in water (named so in the name or an alias,
 * whatever the script's `--listeria` scope: never « Listeria spp. »). Read
 * on the germ the scope gave (a Listeria outside the scope never reaches
 * here).
 */
export function citedEnumeration(
  parameter: Pick<AlertParameter, "name" | "aliases" | "category" | "unit">,
  germ: AlertGerm
): boolean {
  const spellings = [parameter.name, ...(parameter.aliases ?? "").split(/\r?\n/)].filter((s) => s.trim() !== "");
  if (germ === "E_COLI") {
    if (parameter.category === "AMBIANCE" && surfaceOrHands(parameter.unit, spellings)) return true;
    return spellings.some((spelling) => / presum/.test(words(spelling)));
  }
  return germ === "LISTERIA" && parameter.category === "EAU" && spellings.some((spelling) => / monocytogenes /.test(words(spelling)));
}

/**
 * A surface or hands reading of the category `AMBIANCE` (shared with the
 * air): a unit « UFC/cm² », « UFC/25cm² », « UFC/mains », or a name saying
 * « mains », « cm² », « surface ». An air unit (« UFC/m³ », « UFC/boîte »)
 * or none at all is not.
 */
function surfaceOrHands(unit: string | null | undefined, spellings: readonly string[]): boolean {
  if (/cm\s*(?:²|2)?(?![a-z])|mains?\b/i.test(unit ?? "")) return true;
  return spellings.some((spelling) => / mains? | cm2? | surfaces? /.test(words(spelling.replace(/²/g, "2"))));
}

export type AlertPlan = {
  /** Named by the answer, the flag not set yet: to set. */
  toSet: AlertPlanWrite[];
  /** Named by the answer, an enumeration without a limit: the laboratory's limit (or criterion) first. */
  needsLimit: AlertPlanRow[];
  /** Named by the answer, the flag already set: nothing to do. */
  alreadySet: AlertPlanRow[];
  /**
   * Flagged but not named by the answer (an enterococcus, Pseudomonas, a
   * chemistry line…): listed for the laboratory; cleared only on request
   * (`unsetOthers`) — clearing a flag silences alerts.
   */
  othersFlagged: AlertPlanRow[];
  /**
   * A Listeria the scope leaves out (R-14 not answered): listed only —
   * never set, and never cleared, even with `unsetOthers`.
   */
  deferred: AlertPlanRow[];
};

/** What setting the answer's list would change on this catalogue. */
export function contaminationAlertPlan(
  parameters: readonly AlertParameter[],
  listeria: ListeriaScope = "ALL",
  limitZeroOnDetection: boolean = sensitiveNeedsLimit(),
  enumerations: boolean = false
): AlertPlan {
  const plan: AlertPlan = { toSet: [], needsLimit: [], alreadySet: [], othersFlagged: [], deferred: [] };
  const byName = [...parameters].sort((a, b) => a.name.localeCompare(b.name, "fr") || a.category.localeCompare(b.category));
  for (const parameter of byName) {
    const germ = alertGermOf(parameter, listeria);
    const row: AlertPlanRow = { id: parameter.id, name: parameter.name, category: parameter.category, germ, unit: parameter.unit ?? null };
    if (!germ) {
      if (alertGermOf(parameter, "ALL") === "LISTERIA") plan.deferred.push({ ...row, germ: "LISTERIA" });
      else if (parameter.alertOnExceed) plan.othersFlagged.push(row);
      continue;
    }
    if (parameter.alertOnExceed) {
      plan.alreadySet.push(row);
      continue;
    }
    const limited = parameter.limitValue !== null && parameter.limitValue !== undefined && parameter.limitValue !== "";
    if (limited) plan.toSet.push({ ...row, patch: { alertOnExceed: true } });
    else if (isDetection(parameter.unit)) {
      plan.toSet.push({ ...row, patch: limitZeroOnDetection ? { alertOnExceed: true, limitValue: 0 } : { alertOnExceed: true } });
    }
    // S10 (Q10 of 04/11): a cited enumeration alerts from > 0 — flagged without a limit, J3 on only.
    else if (enumerations && !limitZeroOnDetection && citedEnumeration(parameter, germ)) {
      plan.toSet.push({ ...row, patch: { alertOnExceed: true }, enumeration: true });
    }
    else plan.needsLimit.push(row);
  }
  return plan;
}
