import type {
  Family,
  LineKind,
  NonConformityReason,
  QuantityUnit,
  StorageClass,
  TemperatureSource,
} from "@/generated/prisma/enums";
import { formatDecimal } from "./labels";
import {
  DEFAULT_COMPLEMENTARY_THRESHOLDS,
  temperatureSourceSuffix,
  type ComplementaryKey,
  type ComplementaryThresholds,
} from "./reception-complementary";

/**
 * Acceptance rules at reception — the eight rules printed on the laboratory's
 * bon de réception (PG05/EN04 version H, the laboratory's answers of 12/10),
 * computed instead of read.
 *
 * Pure: the screen runs it live while the réceptionniste types, the API runs
 * it again before writing. The thresholds come from `LabSettings`; the
 * defaults below are the paper form's own values.
 */

/** The figures of the paper's rules. */
export type PaperThresholds = {
  minFoodMicroG: number;
  minFoodChemG: number;
  minWaterMicroL: number;
  minWaterSalmonellaL: number;
  minWaterChemL: number;
  histamineUnits: number;
  histamineUnitG: number;
  /**
   * Note (8) of the bon version H (12/10): a sample of live bivalve molluscs
   * holds at least `molluscMinIndividuals` individuals and weighs at least
   * `molluscMinG` g — `molluscSmallMinG` g for small animals.
   */
  molluscMinIndividuals: number;
  molluscMinG: number;
  molluscSmallMinG: number;
  /** Comma-separated `LineKind` codes, as stored in LabSettings. */
  temperatureRequiredKinds: string;
};

/**
 * Everything the reception judges with: the paper's figures and the limits
 * of the contrôles complémentaires (`reception-complementary.ts`) — one
 * object, `LabSettings` as read by `getLabSettings`.
 */
export type ReceptionThresholds = PaperThresholds & ComplementaryThresholds;

export const DEFAULT_THRESHOLDS: ReceptionThresholds = {
  ...DEFAULT_COMPLEMENTARY_THRESHOLDS,
  minFoodMicroG: 100,
  minFoodChemG: 300,
  minWaterMicroL: 1,
  minWaterSalmonellaL: 6,
  minWaterChemL: 2,
  histamineUnits: 9,
  histamineUnitG: 100,
  molluscMinIndividuals: 10,
  molluscMinG: 50,
  molluscSmallMinG: 25,
  // The laboratory's answer of 12/10: food, water, air and surface (stable
  // foods excepted — a reception rule, not this list).
  temperatureRequiredKinds: "ALIMENT,EAU,AIR,SURFACE",
};

/**
 * The eight rules of the paper bon de réception (PG05/EN04 version H), in its
 * order and wording — the one source for the reception checklist, the
 * printed bon and protocole, and /admin/reglages (lab's feedback of 08/10:
 * « les règles comme une checklist »; note (8), the live bivalve molluscs,
 * added by the laboratory on 12/10). The figures come from the thresholds;
 * the paper's own numbering is `n`.
 */
export type ReceptionRuleKey =
  | "EXPLOITABLE"
  | "ALIMENT_MICRO"
  | "ALIMENT_CHIMIE"
  | "EAU_MICRO"
  | "EAU_CHIMIE"
  | "TEMPERATURE"
  | "HISTAMINE"
  | "MOLLUSQUES";

export type ReceptionRule = {
  /** The paper's number, (1) … (8). */
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
  {
    // The laboratory's wording of 12/10, lower case like the other notes.
    n: 8,
    key: "MOLLUSQUES",
    text: (t) =>
      `pour le cas des mollusques bivalves vivants, un échantillon représentatif doit contenir au moins ${t.molluscMinIndividuals} individus et peser au moins ${grams(t.molluscMinG)} (${grams(t.molluscSmallMinG)} pour les animaux de petite taille)`,
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
  /**
   * « Conservation » as chosen at reception (C2); null = the kind's default.
   * A food kept at room temperature (AMBIANT — conserve, sec, UHT…) is a
   * stable food: rule (6) does not concern it (`isStableFood`, 12/10).
   */
  storageClass: StorageClass | null;
  /**
   * What names the product — its désignation, its product type, its nature
   * (the programme's fine nature once chosen): rule (8) reads them to
   * recognise live bivalve molluscs (`mentionsBivalveMolluscs`).
   */
  productNames: readonly (string | null | undefined)[];
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

/**
 * A stable food (12/10, « température obligatoire … sauf les aliments
 * stables »): a food the reception says travels at room temperature —
 * « Ambiant » in « Conservation » (conserve, sec, UHT…). The kind's default
 * class is never stable: a food is chilled unless the reception says so.
 */
export function isStableFood(line: Pick<ReceptionLine, "lineKind" | "storageClass">): boolean {
  return line.lineKind === "ALIMENT" && line.storageClass === "AMBIANT";
}

/**
 * The words that name live bivalve molluscs on a sample (rule 8) — the one
 * list the screens, both APIs and the programme sheet read. Matched as whole
 * words of the désignation, the product type or the nature, accents and
 * case ignored, singular or plural (« Huîtres creuses », « MOULES »).
 */
export const BIVALVE_MOLLUSC_WORDS = [
  "mollusque",
  "bivalve",
  "huitre",
  "moule",
  "palourde",
  "coque",
  "praire",
  "clam",
  "petoncle",
  "coquille",
] as const;

/** « Œuf à la coque », « œufs coque »: an egg, never a cockle. */
const EGG_COQUE = /\boeufs? (?:a la )?coques?\b|\ba la coque\b/g;

/** « Mollusques céphalopodes / gastéropodes » are no bivalves: « mollusque » alone does not count then. */
const NOT_BIVALVE_MOLLUSCS = new Set(["cephalopode", "cephalopodes", "gasteropode", "gasteropodes"]);

/**
 * « Camembert moulé à la louche », « chocolat moulé »: a word ending in « é »
 * (« -ée », « -és », « -ées ») is a participle or another noun — none of the
 * bivalves' words ends so. Read while the accents are still there: folded,
 * « moulé » would be « moule ».
 */
const ENDS_IN_E_ACUTE = /\p{L}*é(?:es?|s)?(?!\p{L})/gu;

/** Lower case, no accents, « œ » spelt « oe », words split on anything else. */
function foldWords(text: string): string[] {
  return text
    .replace(/[œŒ]/g, "oe")
    .normalize("NFC")
    .toLowerCase()
    .replace(ENDS_IN_E_ACUTE, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(EGG_COQUE, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Rule (8) concerns the sample: one of its names mentions bivalve molluscs
 * (`BIVALVE_MOLLUSC_WORDS`). A heuristic on what was typed and picked — the
 * checklist row says how it was recognised, the réceptionniste keeps the
 * last word with the conformity.
 */
export function mentionsBivalveMolluscs(names: readonly (string | null | undefined)[]): boolean {
  return names.some((name) => {
    if (!name) return false;
    const words = foldWords(name);
    const otherClass = words.some((word) => NOT_BIVALVE_MOLLUSCS.has(word));
    return words.some((word) =>
      BIVALVE_MOLLUSC_WORDS.some(
        (stem) => (word === stem || word === `${stem}s`) && !(stem === "mollusque" && otherClass)
      )
    );
  });
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
 * (2)–(5) quantity, (6) temperature, (7) histamine, (8) live bivalve
 * molluscs. Rule (1) is the
 * réceptionniste's answer, not a measure: it is added by
 * `receptionChecklist`. The cold chain is not the paper's: it is C2, a
 * contrôle complémentaire (`reception-complementary.ts`), judged by
 * conservation class. The rule ids are stable (audit, programme sheet).
 */
export function evaluateReception(
  line: ReceptionLine,
  thresholds: ReceptionThresholds = DEFAULT_THRESHOLDS
): Check[] {
  const checks: Check[] = [];
  const weightG = toGrams(line.quantity, line.quantityUnit);
  const volumeL = toLitres(line.quantity, line.quantityUnit);
  const inUnits = line.quantity !== null && line.quantityUnit === "UNITE";

  const bivalves = line.lineKind === "ALIMENT" && mentionsBivalveMolluscs(line.productNames);
  if (line.lineKind === "ALIMENT" && line.family === "MICRO") {
    // (2) — food, microbiology. Live bivalve molluscs follow their own
    // minimum, note (8) (« pour le cas des mollusques… 50 g ») — the 100 g
    // would refuse every sample the note allows (12/10, lab question Q99).
    if (!bivalves) {
      checks.push(quantityCheck("ALIMENT_MICRO_POIDS", "Quantité", weightG, thresholds.minFoodMicroG, "g", inUnits));
    }
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

  // (6) — the temperature at arrival is mandatory for the configured kinds
  // (food, water, air and surface since 12/10), stable foods excepted: a
  // food kept at room temperature has no temperature to keep.
  if (requiredKinds(thresholds).includes(line.lineKind) && !isStableFood(line)) {
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

  // (7) — histamine: n units of a minimum weight each. Histamine is a
  // physico-chemical assay: the rule follows the analysis, whatever the
  // sample's family, beside rule (2) or (3). Fewer units than the plan is
  // the client's choice, never a non-conformity (the laboratory's answer
  // of 13/10 to Q62): the sample is analysed as asked and the report gives
  // the results without interpretation — said here, nothing to justify.
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
            level: "OK",
            message: `Histamine : ${line.unitCount} unité${line.unitCount > 1 ? "s" : ""} sur ${thresholds.histamineUnits} — analysée${line.unitCount > 1 ? "s" : ""} telle${line.unitCount > 1 ? "s" : ""} que demandé, résultats sans interprétation sur le rapport.`,
          }
    );
    const perUnit = weightG === null ? null : weightG / Math.max(1, line.unitCount);
    checks.push(
      quantityCheck("HISTAMINE_POIDS", "Poids par unité", perUnit, thresholds.histamineUnitG, "g", inUnits)
    );
  }

  // (8) — live bivalve molluscs, recognised on the product's names.
  if (bivalves) {
    checks.push(molluscCheck(weightG, thresholds, inUnits));
  }

  return checks;
}

/**
 * Rule (8), the weight: under the small animals' minimum the sample cannot
 * be conform; between it and the minimum it depends on the animals' size —
 * « à vérifier », the réceptionniste justifies an acceptance (A7); from the
 * minimum on it is met. The number of individuals is not counted by the
 * application (`unitCount` is the analysis's n): the checklist row says it
 * is to check (`receptionChecklist`).
 */
function molluscCheck(weightG: number | null, t: ReceptionThresholds, declaredInUnits: boolean): Check {
  const rule = "MOLLUSQUES_POIDS";
  const both = `au moins ${grams(t.molluscMinG)}, ${grams(t.molluscSmallMinG)} pour les animaux de petite taille`;
  if (weightG === null) {
    return {
      rule,
      level: "AVERTISSEMENT",
      message: `Poids ${declaredInUnits ? "déclaré en unités, non pesé" : "non renseigné"} — ${both}.`,
      reason: "QUANTITE_INSUFFISANTE",
    };
  }
  if (weightG < t.molluscSmallMinG) {
    return {
      rule,
      level: "BLOQUANT",
      message: `Poids ${grams(weightG)} < ${grams(t.molluscSmallMinG)} requis, même pour des animaux de petite taille.`,
      reason: "QUANTITE_INSUFFISANTE",
    };
  }
  if (weightG < t.molluscMinG) {
    return {
      rule,
      level: "AVERTISSEMENT",
      message: `Poids ${grams(weightG)} : ${both}.`,
      reason: "QUANTITE_INSUFFISANTE",
    };
  }
  return { rule, level: "OK", message: `Poids ${grams(weightG)} ≥ ${grams(t.molluscMinG)}.` };
}

export function worstLevel(checks: Check[]): CheckLevel {
  return checks.reduce<CheckLevel>(
    (worst, check) => (LEVEL_RANK[check.level] > LEVEL_RANK[worst] ? check.level : worst),
    "OK"
  );
}

// ---- The checklist: the eight rules of the paper, always -----------------------

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
  /** The paper's number, (1) … (8) — or the number of a complementary code (C3 → 3). */
  n: number;
  key: ReceptionRuleKey | ComplementaryKey;
  /**
   * « C3 » on a contrôle complémentaire (hors bon, `reception-complementary.ts`);
   * absent on the paper's eight rules. The screens list the coded rows in a
   * group of their own, after the paper's.
   */
  code?: string;
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
  /** Where the temperature was read (the cooler, the sample, a witness
   * bottle); unknown when left out — the detail then shows the value only. */
  temperatureSource?: TemperatureSource | null;
};

/** The rule a check belongs to, in the paper's numbering. */
const RULE_ROW: Record<string, ReceptionRuleKey> = {
  ALIMENT_MICRO_POIDS: "ALIMENT_MICRO",
  ALIMENT_CHIMIE_POIDS: "ALIMENT_CHIMIE",
  EAU_MICRO_VOLUME: "EAU_MICRO",
  EAU_SALMONELLA_VOLUME: "EAU_MICRO",
  EAU_CHIMIE_VOLUME: "EAU_CHIMIE",
  TEMPERATURE_ARRIVEE: "TEMPERATURE",
  HISTAMINE_UNITES: "HISTAMINE",
  HISTAMINE_POIDS: "HISTAMINE",
  MOLLUSQUES_POIDS: "MOLLUSQUES",
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
  if (key === "ALIMENT_MICRO" && line.lineKind === "ALIMENT" && line.family === "MICRO" && mentionsBivalveMolluscs(line.productNames)) {
    return sentence(["sans objet : mollusques bivalves vivants, poids minimal de la note (8)"]);
  }
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
  if (key === "TEMPERATURE" && isStableFood(line)) {
    return sentence([
      "sans objet : aliment stable (conservé à température ambiante)",
      line.receptionTemperature === null ? "" : `${formatDecimal(line.receptionTemperature)} °C relevée`,
    ]);
  }
  if (key === "MOLLUSQUES" && line.lineKind === "ALIMENT") {
    return sentence(["sans objet : pas de mollusques bivalves dans la désignation, le type ou la nature"]);
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
      parts.push(`${formatDecimal(line.receptionTemperature)} °C${temperatureSourceSuffix(context.temperatureSource)}`);
    } else {
      parts.push(check.message);
    }
  }
  // The Salmonella volume is only known once the analyses are fixed.
  if (key === "EAU_MICRO" && !analysesFixed) {
    parts.push(`${formatDecimal(thresholds.minWaterSalmonellaL)} L si Salmonella — vérifié au programme`);
  }
  // The individuals are counted by the réceptionniste, never by the application.
  if (key === "MOLLUSQUES") parts.push(`au moins ${thresholds.molluscMinIndividuals} individus : à vérifier`);
  return sentence(parts);
}

function exploitableRow(exploitable: boolean | null): Pick<ChecklistRow, "status" | "detail" | "reason"> {
  if (exploitable === null) return { status: "A_CONFIRMER", detail: "Exploitable ou non : à confirmer à la réception" };
  return exploitable
    ? { status: "CONFORME", detail: "Déclaré exploitable" }
    : { status: "NON_CONFORME", detail: "Déclaré non exploitable", reason: "NON_EXPLOITABLE" };
}

/**
 * The checklist of one sample: ALWAYS the eight rules of the paper, in its
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

/**
 * « (2) Poids minimal est de 100 g … » — a row as the screens print it; a
 * contrôle complémentaire by its code: « C3 Emballage / contenant … ».
 */
export function checklistRowLabel(row: Pick<ChecklistRow, "n" | "text" | "code">): string {
  return row.code ? `${row.code} ${upperFirst(row.text)}` : `(${row.n}) ${upperFirst(row.text)}`;
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
  /** The paper number of the row that forces it; null when none does, or when a complementary control does. */
  rule: number | null;
  /** The code of the contrôle complémentaire that forces it (« C3 »); null otherwise. */
  code: string | null;
  /** A row still waits for the réceptionniste (rule 1, a ticked control): nothing can be sent. */
  pending: boolean;
};

/**
 * What the screen proposes: the first NON_CONFORME row in the list's order
 * forces « non conforme » with its motif; an A_VERIFIER row leaves the
 * sample conform with its motif at hand; an A_CONFIRMER row blocks the
 * submission until it is answered. The list is the paper's eight rules
 * followed by the contrôles complémentaires: a paper rule keeps the priority.
 */
export function proposedConformity(rows: readonly ChecklistRow[]): ChecklistProposal {
  const pending = rows.some((row) => row.status === "A_CONFIRMER");
  const failing = rows.find((row) => row.status === "NON_CONFORME");
  if (failing) {
    return {
      conformity: false,
      reason: failing.reason ?? "AUTRE",
      forced: true,
      rule: failing.code ? null : failing.n,
      code: failing.code ?? null,
      pending,
    };
  }
  const doubtful = rows.find((row) => row.status === "A_VERIFIER");
  return { conformity: true, reason: doubtful?.reason ?? null, forced: false, rule: null, code: null, pending };
}

/** « Observation de réception »: its maximum length (A7). */
export const RECEPTION_NOTE_MAX = 1000;

/** The observation's refusals, worded once for the screens and both APIs. */
export const RECEPTION_NOTE_MESSAGES = {
  tooLong: "L'observation de réception dépasse 1 000 caractères.",
} as const;

/**
 * The row whose doubt an acceptance must justify (A7): a sample declared
 * conforme while a row is « à vérifier » — the paper's rules first, then the
 * contrôles complémentaires — needs an « Observation de réception ». Returns
 * the first such row when the observation is empty, null otherwise (a
 * non-conform sample, no doubt, or an observation written).
 */
export function rowToJustify<Row extends Pick<ChecklistRow, "status">>(
  rows: readonly Row[],
  conformity: boolean,
  receptionNote: string | null | undefined
): Row | null {
  if (!conformity || (receptionNote ?? "").trim()) return null;
  return rows.find((row) => row.status === "A_VERIFIER") ?? null;
}

/**
 * « Justifiez l'acceptation (C2 Température de transport à vérifier). » — a
 * paper rule by its number, « (règle 2 à vérifier) », its long wording being
 * on the card beside the field. The reception prefixes it « Échantillon 2 : »,
 * the deposit « Échantillon 2 — ».
 */
export function justifyAcceptanceMessage(row: Pick<ChecklistRow, "n" | "text" | "code">): string {
  return `Justifiez l'acceptation (${row.code ? checklistRowLabel(row) : `règle ${row.n}`} à vérifier).`;
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
