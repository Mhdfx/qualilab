import type { SampleType } from "@/generated/prisma/client";

/**
 * Validating an analysis parameter.
 *
 * These values decide two things the laboratory is judged on: whether a result
 * is declared conform, and whether a contamination alert reaches a client. So
 * they are checked rather than trusted — in particular a parameter flagged as
 * sensitive must carry a limit, otherwise the alert it promises can never fire.
 */

export const SAMPLE_TYPES: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

export type ParameterInput = {
  name?: unknown;
  category?: unknown;
  unit?: unknown;
  threshold?: unknown;
  limitValue?: unknown;
  alertOnExceed?: unknown;
  calcFactor?: unknown;
};

export type CleanParameter = {
  name: string;
  category: SampleType;
  unit: string | null;
  threshold: string | null;
  limitValue: number | null;
  alertOnExceed: boolean;
  calcFactor: number;
};

export type ParameterResult =
  | { ok: true; value: CleanParameter }
  | { ok: false; error: string };

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Reads a limit typed by hand: empty means "no limit defined". */
export function parseLimit(value: unknown): number | null | "invalid" {
  if (value === null || value === undefined || value === "") return null;

  const amount =
    typeof value === "number" ? value : Number(String(value).replace(",", "."));

  if (!Number.isFinite(amount) || amount < 0) return "invalid";
  return amount;
}

export function validateParameter(input: ParameterInput): ParameterResult {
  const name = text(input.name);
  if (!name) {
    return { ok: false, error: "Le nom du paramètre est obligatoire." };
  }
  if (name.length > 120) {
    return { ok: false, error: "Le nom du paramètre est trop long." };
  }

  const category = text(input.category) as SampleType;
  if (!SAMPLE_TYPES.includes(category)) {
    return { ok: false, error: "Domaine d'analyse invalide." };
  }

  const limit = parseLimit(input.limitValue);
  if (limit === "invalid") {
    return {
      ok: false,
      error: "La limite doit être un nombre positif (ou vide si non définie).",
    };
  }

  const alertOnExceed = input.alertOnExceed === true;

  // A parameter that promises an alert but has no limit could never raise one.
  if (alertOnExceed && limit === null) {
    return {
      ok: false,
      error:
        "Un paramètre sensible doit avoir une limite : sans elle, aucune alerte ne peut se déclencher.",
    };
  }

  // Calculation factor (dilution…): empty means 1 — the entry is final. A
  // factor of 0 would silently zero every result, so it is refused.
  const factor = parseLimit(input.calcFactor);
  if (factor === "invalid" || factor === 0) {
    return {
      ok: false,
      error:
        "Le facteur de calcul doit être un nombre strictement positif (ou vide pour 1).",
    };
  }

  return {
    ok: true,
    value: {
      name,
      category,
      unit: text(input.unit) || null,
      threshold: text(input.threshold) || null,
      limitValue: limit,
      alertOnExceed,
      calcFactor: factor ?? 1,
    },
  };
}
