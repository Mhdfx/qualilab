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

/**
 * The seven rules of the paper bon de réception (PG05/EN04 version G), in its
 * order and wording — the one source for the reception checklist and the
 * printed bon (lab's feedback of 08/10: « les règles comme une checklist »).
 * The figures come from the thresholds; the paper's own numbering is `n`.
 */
export type ReceptionRuleKey =
  | "EXPLOITABLE"
  | "ALIMENT_MICRO"
  | "ALIMENT_CHIMIE"
  | "EAU_MICRO"
  | "EAU_CHIMIE"
  | "TEMPERATURE"
  | "HISTAMINE";

export type ReceptionRule = {
  /** The paper's number, (1) … (7). */
  n: number;
  key: ReceptionRuleKey;
  text: (t: ReceptionThresholds) => string;
};

const grams = (value: number) => `${formatDecimal(value)} g`;
const litres = (value: number) => `${formatDecimal(value)} L`;

export const RECEPTION_RULES: readonly ReceptionRule[] = [
  {
    n: 1,
    key: "EXPLOITABLE",
    text: () =>
      "critères : ne pas accepter des échantillons non exploitables lors de l'analyse (exemple : tête de poisson, os, etc.)",
  },
  {
    n: 2,
    key: "ALIMENT_MICRO",
    text: (t) => `poids minimal est de ${grams(t.minFoodMicroG)} pour les aliments (analyses microbiologiques)`,
  },
  {
    n: 3,
    key: "ALIMENT_CHIMIE",
    text: (t) => `poids minimal est de ${grams(t.minFoodChemG)} pour les aliments (analyses physicochimiques)`,
  },
  {
    n: 4,
    key: "EAU_MICRO",
    text: (t) =>
      `volume d'eau pour analyses microbiologiques est de ${litres(t.minWaterMicroL)} et si Salmonella ${litres(t.minWaterSalmonellaL)}`,
  },
  {
    n: 5,
    key: "EAU_CHIMIE",
    text: (t) => `volume d'eau pour analyses physicochimiques est de ${litres(t.minWaterChemL)}`,
  },
  { n: 6, key: "TEMPERATURE", text: () => "la température doit être précisée" },
  {
    n: 7,
    key: "HISTAMINE",
    text: (t) => `échantillons destinés au dosage de l'histamine : ${t.histamineUnits} échantillons de ${grams(t.histamineUnitG)}`,
  },
];

/** « (2) poids minimal est de 100 g pour les aliments (analyses microbiologiques) ». */
export function receptionRuleLine(rule: ReceptionRule, t: ReceptionThresholds): string {
  return `(${rule.n}) ${rule.text(t)}`;
}

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
  /**
   * The requested analyses, each by its name AND its aliases
   * (`parameterSpellings`): histamine and Salmonella are recognised on
   * either. Empty = no analysis fixed yet — the programme sheet fixes them
   * (V6), so rule (4)'s Salmonella volume and rule (7) wait for it.
   */
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

/**
 * The spellings of an analysis the rules read: its name, then its aliases
 * (`AnalysisParameter.aliases`, one per line). A parameter renamed in
 * /admin/parametres keeps triggering its rule through an alias.
 */
export function parameterSpellings(parameter: { name: string; aliases?: string | null }): string[] {
  const aliases = (parameter.aliases ?? "")
    .split("\n")
    .map((alias) => alias.trim())
    .filter(Boolean);
  return [parameter.name, ...aliases];
}

function mentions(parameterNames: string[], needle: string) {
  return parameterNames.some((name) => name.toLowerCase().includes(needle));
}

/** Histamine requested — by name or alias. */
export function requestsHistamine(parameterNames: string[]): boolean {
  return mentions(parameterNames, "histamin");
}

/** Salmonella requested — by name or alias (« Salmonelles », « Salmonella spp »). */
export function requestsSalmonella(parameterNames: string[]): boolean {
  return mentions(parameterNames, "salmonell");
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
    // « Quantité … non renseignée », « Volume … non renseigné », « Poids … non renseigné ».
    const e = what.startsWith("Quantité") ? "e" : "";
    return {
      rule,
      level: "AVERTISSEMENT",
      message: declaredInUnits
        ? `${what} déclaré${e} en unités, non pesé${e} — minimum ${formatDecimal(minimum)} ${unit}.`
        : `${what} non renseigné${e} — minimum ${formatDecimal(minimum)} ${unit}.`,
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

/**
 * Every measurable rule that applies to the line, in the paper's order —
 * (2)–(5) quantity, (6) temperature with the cold chain beside it, (7)
 * histamine. Rule (1) is the réceptionniste's answer, not a measure: it is
 * added by `receptionChecklist`. The rule ids are stable (audit, programme
 * sheet).
 */
export function evaluateReception(
  line: ReceptionLine,
  thresholds: ReceptionThresholds = DEFAULT_THRESHOLDS
): Check[] {
  const checks: Check[] = [];
  const weightG = toGrams(line.quantity, line.quantityUnit);
  const volumeL = toLitres(line.quantity, line.quantityUnit);
  const inUnits = line.quantity !== null && line.quantityUnit === "UNITE";

  if (line.lineKind === "ALIMENT" && line.family === "MICRO") {
    // (2) — food, microbiology.
    checks.push(quantityCheck("ALIMENT_MICRO_POIDS", "Quantité", weightG, thresholds.minFoodMicroG, "g", inUnits));
  } else if (line.lineKind === "ALIMENT" && line.family === "CHIMIE") {
    // (3) — food, physico-chemistry.
    checks.push(quantityCheck("ALIMENT_CHIMIE_POIDS", "Quantité", weightG, thresholds.minFoodChemG, "g", inUnits));
  } else if (line.lineKind === "EAU" && line.family === "MICRO") {
    // (4) — water, microbiology: more with Salmonella.
    const salmonella = requestsSalmonella(line.parameterNames);
    checks.push(
      quantityCheck(
        salmonella ? "EAU_SALMONELLA_VOLUME" : "EAU_MICRO_VOLUME",
        salmonella ? "Volume (recherche de Salmonella)" : "Volume",
        volumeL,
        salmonella ? thresholds.minWaterSalmonellaL : thresholds.minWaterMicroL,
        "L",
        inUnits
      )
    );
  } else if (line.lineKind === "EAU" && line.family === "CHIMIE") {
    // (5) — water, physico-chemistry.
    checks.push(quantityCheck("EAU_CHIMIE_VOLUME", "Volume", volumeL, thresholds.minWaterChemL, "L", inUnits));
  }

  // (6) — the temperature at arrival is mandatory for the configured kinds.
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

  // Complementary check, not on the paper (Q3): a warm food line is
  // flagged, the réceptionniste decides. Shown under rule (6).
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

  // (7) — histamine: n units of a minimum weight each. Histamine is a
  // physico-chemical assay: the rule follows the analysis, whatever the
  // sample's family, beside rule (2) or (3).
  if (line.lineKind === "ALIMENT" && requestsHistamine(line.parameterNames)) {
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
    const perUnit = weightG === null ? null : weightG / Math.max(1, line.unitCount);
    checks.push(
      quantityCheck("HISTAMINE_POIDS", "Poids par unité", perUnit, thresholds.histamineUnitG, "g", inUnits)
    );
  }

  return checks;
}

export function worstLevel(checks: Check[]): CheckLevel {
  return checks.reduce<CheckLevel>(
    (worst, check) => (LEVEL_RANK[check.level] > LEVEL_RANK[worst] ? check.level : worst),
    "OK"
  );
}

// ---- The checklist: the seven rules of the paper, always -----------------------

/**
 * One row of the checklist:
 * - CONFORME / NON_CONFORME — the rule is met / not met (a NON_CONFORME row
 *   forces « non conforme »);
 * - A_VERIFIER — a warning: the sample may be received conform, the motif is
 *   ready (quantity not weighed, units short, cold chain);
 * - A_CONFIRMER — rule (1) not answered yet: the reception cannot be sent;
 * - SANS_OBJET — the rule does not concern this sample (still listed).
 */
export type ChecklistStatus = "CONFORME" | "NON_CONFORME" | "A_VERIFIER" | "A_CONFIRMER" | "SANS_OBJET";

/** The pill of a row — always text beside the colour. */
export const CHECKLIST_STATUS_LABELS: Record<ChecklistStatus, string> = {
  CONFORME: "Conforme",
  NON_CONFORME: "Non conforme",
  A_VERIFIER: "À vérifier",
  A_CONFIRMER: "À confirmer",
  SANS_OBJET: "Sans objet",
};

export type ChecklistRow = {
  /** The paper's number, (1) … (7). */
  n: number;
  key: ReceptionRuleKey;
  /** The paper's wording, figures from the thresholds — lower case, as printed. */
  text: string;
  status: ChecklistStatus;
  /** What was measured or answered, or why the rule does not apply. */
  detail?: string;
  /** The coded motif a failing (or doubtful) row proposes. */
  reason?: NonConformityReason;
  /** The ids of the engine's checks behind the row (`evaluateReception`) — audited. */
  rules: string[];
};

export type ChecklistContext = {
  /** Rule (1), the réceptionniste's answer; null = not answered yet. */
  exploitable: boolean | null;
  /** The temperature is the cooler's (true) or measured on the sample
   * (false); unknown when left out — the detail then shows the value only. */
  fromCooler?: boolean;
};

/** The rule a check belongs to, in the paper's numbering. */
const RULE_ROW: Record<string, ReceptionRuleKey> = {
  ALIMENT_MICRO_POIDS: "ALIMENT_MICRO",
  ALIMENT_CHIMIE_POIDS: "ALIMENT_CHIMIE",
  EAU_MICRO_VOLUME: "EAU_MICRO",
  EAU_SALMONELLA_VOLUME: "EAU_MICRO",
  EAU_CHIMIE_VOLUME: "EAU_CHIMIE",
  TEMPERATURE_ARRIVEE: "TEMPERATURE",
  CHAINE_FROID: "TEMPERATURE",
  HISTAMINE_UNITES: "HISTAMINE",
  HISTAMINE_POIDS: "HISTAMINE",
};

const STATUS_OF: Record<CheckLevel, ChecklistStatus> = {
  OK: "CONFORME",
  AVERTISSEMENT: "A_VERIFIER",
  BLOQUANT: "NON_CONFORME",
};

/** How a « sans objet » row names the sample: « sans objet : surface ». */
const KIND_NOUN: Record<LineKind, string> = {
  ALIMENT: "aliment",
  SURFACE: "surface",
  MAINS: "mains",
  EAU: "eau",
  AIR: "air",
  AUTRE: "autre prélèvement",
};

const FAMILY_NOUN: Record<Family, string> = {
  MICRO: "microbiologie",
  CHIMIE: "physico-chimie",
  AUTRE: "autre famille d'analyses",
};

/** Which (kind, family) each quantity rule concerns. */
const QUANTITY_SCOPE: Partial<Record<ReceptionRuleKey, { kind: LineKind; family: Family }>> = {
  ALIMENT_MICRO: { kind: "ALIMENT", family: "MICRO" },
  ALIMENT_CHIMIE: { kind: "ALIMENT", family: "CHIMIE" },
  EAU_MICRO: { kind: "EAU", family: "MICRO" },
  EAU_CHIMIE: { kind: "EAU", family: "CHIMIE" },
};

function upperFirst(text: string) {
  return text ? text.charAt(0).toLocaleUpperCase("fr") + text.slice(1) : text;
}

/** « Température à l'arrivée … » → « température à l'arrivée … » inside a sentence. */
function lowerFirst(text: string) {
  const [first, second] = [...text];
  if (!first || second === undefined || second !== second.toLocaleLowerCase("fr")) return text;
  return first.toLocaleLowerCase("fr") + text.slice(first.length);
}

/** Clauses joined into one detail line: « 4 °C (glacière) · contrôle complémentaire … ». */
function sentence(parts: string[]): string {
  return upperFirst(
    parts
      .map((part) => part.trim().replace(/\.$/, ""))
      .filter(Boolean)
      .map((part, index) => (index === 0 ? part : lowerFirst(part)))
      .join(" · ")
  );
}

function notApplicable(
  key: ReceptionRuleKey,
  line: ReceptionLine,
  thresholds: ReceptionThresholds,
  analysesFixed: boolean
): string {
  const scope = QUANTITY_SCOPE[key];
  if (scope) {
    return sentence([
      `sans objet : ${line.lineKind !== scope.kind ? KIND_NOUN[line.lineKind] : FAMILY_NOUN[line.family]}`,
    ]);
  }
  if (key === "HISTAMINE" && line.lineKind === "ALIMENT") {
    return analysesFixed
      ? sentence(["histamine non demandée"])
      : sentence([
          `si l'histamine est demandée : ${thresholds.histamineUnits} × ${formatDecimal(thresholds.histamineUnitG)} g — vérifié au programme`,
        ]);
  }
  return sentence([`sans objet : ${KIND_NOUN[line.lineKind]}`]);
}

function measuredDetail(
  key: ReceptionRuleKey,
  own: Check[],
  line: ReceptionLine,
  thresholds: ReceptionThresholds,
  context: ChecklistContext,
  analysesFixed: boolean
): string {
  const parts: string[] = [];
  for (const check of own) {
    if (check.rule === "TEMPERATURE_ARRIVEE" && check.level === "OK" && line.receptionTemperature !== null) {
      const source =
        context.fromCooler === undefined ? "" : context.fromCooler ? " (glacière)" : " (mesurée sur l'échantillon)";
      parts.push(`${formatDecimal(line.receptionTemperature)} °C${source}`);
    } else if (check.rule === "CHAINE_FROID") {
      // The value is already on the row when rule (6) applies.
      const shown = own.some((c) => c.rule === "TEMPERATURE_ARRIVEE");
      parts.push(
        `contrôle complémentaire (hors bon) : ${
          shown
            ? `> ${formatDecimal(thresholds.coldChainMaxC)} °C — vérifier la chaîne du froid (produit servi chaud ?)`
            : check.message
        }`
      );
    } else {
      parts.push(check.message);
    }
  }
  // The Salmonella volume is only known once the analyses are fixed.
  if (key === "EAU_MICRO" && !analysesFixed) {
    parts.push(`${formatDecimal(thresholds.minWaterSalmonellaL)} L si Salmonella — vérifié au programme`);
  }
  return sentence(parts);
}

function exploitableRow(exploitable: boolean | null): Pick<ChecklistRow, "status" | "detail" | "reason"> {
  if (exploitable === null) return { status: "A_CONFIRMER", detail: "Exploitable ou non : à confirmer à la réception" };
  return exploitable
    ? { status: "CONFORME", detail: "Déclaré exploitable" }
    : { status: "NON_CONFORME", detail: "Déclaré non exploitable", reason: "NON_EXPLOITABLE" };
}

/**
 * The checklist of one sample: ALWAYS the seven rules of the paper, in its
 * order and wording, each with its status — the rules that do not concern
 * the sample are listed « sans objet » with a short reason. Built on
 * `evaluateReception` (its rule ids travel in `rules`); rule (1) is the
 * réceptionniste's answer.
 */
export function receptionChecklist(
  line: ReceptionLine,
  thresholds: ReceptionThresholds,
  context: ChecklistContext
): ChecklistRow[] {
  const checks = evaluateReception(line, thresholds);
  const analysesFixed = line.parameterNames.length > 0;
  return RECEPTION_RULES.map((rule): ChecklistRow => {
    const base = { n: rule.n, key: rule.key, text: rule.text(thresholds) };
    if (rule.key === "EXPLOITABLE") return { ...base, ...exploitableRow(context.exploitable), rules: [] };

    const own = checks.filter((check) => RULE_ROW[check.rule] === rule.key);
    if (own.length === 0) {
      return { ...base, status: "SANS_OBJET", detail: notApplicable(rule.key, line, thresholds, analysesFixed), rules: [] };
    }
    const worst = own.reduce((a, b) => (LEVEL_RANK[b.level] > LEVEL_RANK[a.level] ? b : a));
    return {
      ...base,
      status: STATUS_OF[worst.level],
      detail: measuredDetail(rule.key, own, line, thresholds, context, analysesFixed),
      ...(worst.level !== "OK" && worst.reason ? { reason: worst.reason } : {}),
      rules: own.map((check) => check.rule),
    };
  });
}

/** « (2) Poids minimal est de 100 g … » — a row as the screens print it. */
export function checklistRowLabel(row: Pick<ChecklistRow, "n" | "text">): string {
  return `(${row.n}) ${upperFirst(row.text)}`;
}

const SUMMARY_ORDER: readonly ChecklistStatus[] = ["CONFORME", "NON_CONFORME", "A_VERIFIER", "A_CONFIRMER", "SANS_OBJET"];

const SUMMARY_WORDS: Record<ChecklistStatus, [string, string]> = {
  CONFORME: ["conforme", "conformes"],
  NON_CONFORME: ["non conforme", "non conformes"],
  A_VERIFIER: ["à vérifier", "à vérifier"],
  A_CONFIRMER: ["à confirmer", "à confirmer"],
  SANS_OBJET: ["sans objet", "sans objet"],
};

/** « 4 conformes · 1 à confirmer · 2 sans objet » — the head of a checklist. */
export function checklistSummary(rows: readonly Pick<ChecklistRow, "status">[]): string {
  return SUMMARY_ORDER.flatMap((status) => {
    const count = rows.filter((row) => row.status === status).length;
    if (count === 0) return [];
    const [one, many] = SUMMARY_WORDS[status];
    return [`${count} ${count > 1 ? many : one}`];
  }).join(" · ");
}

export type ChecklistProposal = {
  conformity: boolean;
  reason: NonConformityReason | null;
  /** A NON_CONFORME row forces « non conforme ». */
  forced: boolean;
  /** The paper number of the row that forces it. */
  rule: number | null;
  /** A row still waits for the réceptionniste (rule 1): nothing can be sent. */
  pending: boolean;
};

/**
 * What the screen proposes: the first NON_CONFORME row in the paper's order
 * forces « non conforme » with its motif; an A_VERIFIER row leaves the
 * sample conform with its motif at hand; an A_CONFIRMER row blocks the
 * submission until it is answered.
 */
export function proposedConformity(rows: readonly ChecklistRow[]): ChecklistProposal {
  const pending = rows.some((row) => row.status === "A_CONFIRMER");
  const failing = rows.find((row) => row.status === "NON_CONFORME");
  if (failing) return { conformity: false, reason: failing.reason ?? "AUTRE", forced: true, rule: failing.n, pending };
  const doubtful = rows.find((row) => row.status === "A_VERIFIER");
  return { conformity: true, reason: doubtful?.reason ?? null, forced: false, rule: null, pending };
}

/**
 * The refusals of rule (1), worded once for the screens and both APIs. The
 * reception prefixes them « Échantillon 2 : », the deposit « Échantillon 2 — ».
 */
export const EXPLOITABLE_MESSAGES = {
  // Only a page opened before the checklist (08/10) sends a line without the answer.
  missing:
    "Indiquez s'il est exploitable (règle 1). Si les boutons « Exploitable » / « Non exploitable » n'apparaissent pas, rechargez la page.",
  conform: "Un échantillon non exploitable ne peut pas être déclaré conforme (règle 1).",
  reason: "Le motif « non exploitable » ne va pas avec la réponse « Exploitable » (règle 1).",
} as const;
