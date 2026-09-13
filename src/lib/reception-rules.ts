import type { Family, LineKind, NonConformityReason, QuantityUnit } from "@/generated/prisma/enums";
import { formatDecimal } from "./labels";

/**
 * Acceptance rules at reception — the seven rules printed on the laboratory's
 * bon de réception (PG05/EN04), computed instead of read.
 *
 * Pure: the screen runs it live while the réceptionniste types, the API runs
 * it again before writing. The thresholds come from `LabSettings`; the
 * defaults below are the paper form's own values.
 */

export type ReceptionThresholds = {
  minFoodMicroG: number;
  minFoodChemG: number;
  minWaterMicroL: number;
  minWaterSalmonellaL: number;
  minWaterChemL: number;
  histamineUnits: number;
  histamineUnitG: number;
  /** Comma-separated `LineKind` codes, as stored in LabSettings. */
  temperatureRequiredKinds: string;
  coldChainMaxC: number;
};

export const DEFAULT_THRESHOLDS: ReceptionThresholds = {
  minFoodMicroG: 100,
  minFoodChemG: 300,
  minWaterMicroL: 1,
  minWaterSalmonellaL: 6,
  minWaterChemL: 2,
  histamineUnits: 9,
  histamineUnitG: 100,
  temperatureRequiredKinds: "ALIMENT,EAU",
  coldChainMaxC: 8,
};

export type CheckLevel = "OK" | "AVERTISSEMENT" | "BLOQUANT";

export type Check = {
  /** Stable rule id — audited, never shown as such. */
  rule: string;
  level: CheckLevel;
  message: string;
  /** The coded motif a failing rule proposes for the non-conformity. */
  reason?: NonConformityReason;
};

export type ReceptionLine = {
  lineKind: LineKind;
  family: Family;
  parameterNames: string[];
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  receptionTemperature: number | null;
  unitCount: number;
};

const LEVEL_RANK: Record<CheckLevel, number> = { OK: 0, AVERTISSEMENT: 1, BLOQUANT: 2 };

const KIND_LABEL: Record<LineKind, string> = {
  ALIMENT: "un produit alimentaire",
  SURFACE: "une surface",
  MAINS: "des mains",
  EAU: "une eau",
  AIR: "un air",
  AUTRE: "un échantillon",
};

/** Grams equivalent of the declared quantity (water-like density for volumes). */
function toGrams(quantity: number | null, unit: QuantityUnit | null) {
  if (quantity === null || unit === null || unit === "UNITE") return null;
  if (unit === "L") return quantity * 1000;
  return quantity;
}

function toLitres(quantity: number | null, unit: QuantityUnit | null) {
  if (quantity === null || unit === null || unit === "UNITE") return null;
  if (unit === "L") return quantity;
  return quantity / 1000;
}

function mentions(parameterNames: string[], needle: string) {
  return parameterNames.some((name) => name.toLowerCase().includes(needle));
}

export function requiredKinds(thresholds: ReceptionThresholds): LineKind[] {
  return thresholds.temperatureRequiredKinds
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is LineKind => s.length > 0) as LineKind[];
}

function quantityCheck(
  rule: string,
  what: string,
  actual: number | null,
  minimum: number,
  unit: "g" | "L",
  declaredInUnits: boolean
): Check {
  if (actual === null) {
    return {
      rule,
      level: "AVERTISSEMENT",
      message: declaredInUnits
        ? `${what} déclarée en unités, non pesée — minimum ${formatDecimal(minimum)} ${unit}.`
        : `${what} non renseignée — minimum ${formatDecimal(minimum)} ${unit}.`,
      reason: "QUANTITE_INSUFFISANTE",
    };
  }
  if (actual < minimum) {
    return {
      rule,
      level: "BLOQUANT",
      message: `${what} ${formatDecimal(actual)} ${unit} < ${formatDecimal(minimum)} ${unit} requis.`,
      reason: "QUANTITE_INSUFFISANTE",
    };
  }
  return {
    rule,
    level: "OK",
    message: `${what} ${formatDecimal(actual)} ${unit} ≥ ${formatDecimal(minimum)} ${unit}.`,
  };
}

/** Every rule that applies to the line, in the order the paper prints them. */
export function evaluateReception(
  line: ReceptionLine,
  thresholds: ReceptionThresholds = DEFAULT_THRESHOLDS
): Check[] {
  const checks: Check[] = [];
  const grams = toGrams(line.quantity, line.quantityUnit);
  const litres = toLitres(line.quantity, line.quantityUnit);
  const inUnits = line.quantity !== null && line.quantityUnit === "UNITE";

  if (line.lineKind === "ALIMENT" && line.family === "MICRO") {
    if (mentions(line.parameterNames, "histamin")) {
      // Rule 5 — histamine: n units of a minimum weight each.
      checks.push(
        line.unitCount >= thresholds.histamineUnits
          ? {
              rule: "HISTAMINE_UNITES",
              level: "OK",
              message: `Histamine : ${line.unitCount} unités (${thresholds.histamineUnits} attendues).`,
            }
          : {
              rule: "HISTAMINE_UNITES",
              level: "AVERTISSEMENT",
              message: `Histamine : ${thresholds.histamineUnits} unités attendues, ${line.unitCount} déclarée${line.unitCount > 1 ? "s" : ""}.`,
              reason: "QUANTITE_INSUFFISANTE",
            }
      );
      const perUnit = grams === null ? null : grams / Math.max(1, line.unitCount);
      checks.push(
        quantityCheck("HISTAMINE_POIDS", "Poids par unité", perUnit, thresholds.histamineUnitG, "g", inUnits)
      );
    } else {
      // Rule 1 — food, microbiology.
      checks.push(quantityCheck("ALIMENT_MICRO_POIDS", "Quantité", grams, thresholds.minFoodMicroG, "g", inUnits));
    }
  } else if (line.lineKind === "ALIMENT" && line.family === "CHIMIE") {
    // Rule 2 — food, physico-chemistry.
    checks.push(quantityCheck("ALIMENT_CHIMIE_POIDS", "Quantité", grams, thresholds.minFoodChemG, "g", inUnits));
  } else if (line.lineKind === "EAU" && line.family === "MICRO") {
    // Rules 3 and 4 — water, microbiology (more with Salmonella).
    const salmonella = mentions(line.parameterNames, "salmonell");
    checks.push(
      quantityCheck(
        salmonella ? "EAU_SALMONELLA_VOLUME" : "EAU_MICRO_VOLUME",
        salmonella ? "Volume (recherche de Salmonella)" : "Volume",
        litres,
        salmonella ? thresholds.minWaterSalmonellaL : thresholds.minWaterMicroL,
        "L",
        inUnits
      )
    );
  } else if (line.lineKind === "EAU" && line.family === "CHIMIE") {
    checks.push(quantityCheck("EAU_CHIMIE_VOLUME", "Volume", litres, thresholds.minWaterChemL, "L", inUnits));
  }

  // Rule 6 — the temperature at arrival is mandatory for perishable kinds.
  if (requiredKinds(thresholds).includes(line.lineKind)) {
    checks.push(
      line.receptionTemperature === null
        ? {
            rule: "TEMPERATURE_ARRIVEE",
            level: "BLOQUANT",
            message: `Température à l'arrivée obligatoire pour ${KIND_LABEL[line.lineKind]}.`,
            reason: "TEMPERATURE_MANQUANTE",
          }
        : {
            rule: "TEMPERATURE_ARRIVEE",
            level: "OK",
            message: `Température à l'arrivée relevée : ${formatDecimal(line.receptionTemperature)} °C.`,
          }
    );
  }

  // Rule 7 — cold chain: a warm food line is flagged, the réceptionniste decides.
  if (
    line.lineKind === "ALIMENT" &&
    line.receptionTemperature !== null &&
    line.receptionTemperature > thresholds.coldChainMaxC
  ) {
    checks.push({
      rule: "CHAINE_FROID",
      level: "AVERTISSEMENT",
      message: `${formatDecimal(line.receptionTemperature)} °C à l'arrivée > ${formatDecimal(thresholds.coldChainMaxC)} °C — vérifier la chaîne du froid (produit servi chaud ?).`,
      reason: "CHAINE_FROID",
    });
  }

  return checks;
}

export function worstLevel(checks: Check[]): CheckLevel {
  return checks.reduce<CheckLevel>(
    (worst, check) => (LEVEL_RANK[check.level] > LEVEL_RANK[worst] ? check.level : worst),
    "OK"
  );
}

/**
 * What the screen proposes: a blocking rule forces « non conforme » with its
 * motif; warnings leave the line conform but keep their motif at hand.
 */
export function proposedConformity(checks: Check[]): {
  conformity: boolean;
  reason: NonConformityReason | null;
  forced: boolean;
} {
  const blocking = checks.find((c) => c.level === "BLOQUANT");
  if (blocking) return { conformity: false, reason: blocking.reason ?? "AUTRE", forced: true };
  const warning = checks.find((c) => c.level === "AVERTISSEMENT");
  return { conformity: true, reason: warning?.reason ?? null, forced: false };
}
