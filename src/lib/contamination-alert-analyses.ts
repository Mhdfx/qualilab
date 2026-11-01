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
 * flagged either way: its limit (or its criterion) is the laboratory's to
 * give, never invented here — listed `needsLimit`.
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

/** A row to set, with the body of its PATCH: the flag — and, switch J3 off only, the limit 0 of a detection without one. */
export type AlertPlanWrite = AlertPlanRow & { patch: { alertOnExceed: true; limitValue?: 0 } };

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
  limitZeroOnDetection: boolean = sensitiveNeedsLimit()
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
    else plan.needsLimit.push(row);
  }
  return plan;
}
