import type { Family, SampleType } from "@/generated/prisma/client";

/**
 * Validating an analysis parameter.
 *
 * These values decide two things the laboratory is judged on: whether a result
 * is declared conform, and whether a contamination alert reaches a client. So
 * they are checked rather than trusted — in particular a parameter flagged as
 * sensitive must carry a limit, otherwise the alert it promises can never fire.
 */

export const SAMPLE_TYPES: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

/**
 * The family of a parameter (RETOUR-LABO-06-10.md §5, V3): the analyses
 * proposed on a line are grouped by it and each one goes to the sample of
 * its family. MICRO when the form says nothing — every parameter of the
 * production catalogue is microbiology today.
 */
export const PARAMETER_FAMILIES: Family[] = ["MICRO", "CHIMIE", "AUTRE"];
export const DEFAULT_PARAMETER_FAMILY: Family = "MICRO";

export type ParameterInput = {
  name?: unknown;
  category?: unknown;
  family?: unknown;
  unit?: unknown;
  threshold?: unknown;
  limitValue?: unknown;
  alertOnExceed?: unknown;
  calcFactor?: unknown;
  aliases?: unknown;
};

export type CleanParameter = {
  name: string;
  category: SampleType;
  family: Family;
  unit: string | null;
  threshold: string | null;
  limitValue: number | null;
  alertOnExceed: boolean;
  calcFactor: number;
  /** Other spellings of the germ (one per line) — the criteria import matches them. */
  aliases: string | null;
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
    return { ok: false, error: "Catégorie d'analyse invalide." };
  }

  // Absent or empty = microbiology; anything else must be one of the three.
  const family =
    input.family === undefined || input.family === null || input.family === ""
      ? DEFAULT_PARAMETER_FAMILY
      : (text(input.family) as Family);
  if (!PARAMETER_FAMILIES.includes(family)) {
    return { ok: false, error: "Domaine invalide : microbiologie, physico-chimie ou autre." };
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

  // VARCHAR(191) columns: refuse politely rather than crash on insert.
  if (text(input.unit).length > 191) {
    return { ok: false, error: "L'unité est trop longue (191 caractères maximum)." };
  }
  if (text(input.threshold).length > 191) {
    return { ok: false, error: "Le seuil affiché est trop long (191 caractères maximum)." };
  }

  const aliases = text(input.aliases)
    .split(/\r?\n/)
    .map((a) => a.trim())
    .filter(Boolean);
  if (aliases.some((a) => a.length > 191) || aliases.length > 30) {
    return { ok: false, error: "Alias trop long ou trop nombreux (30 lignes de 191 caractères max)." };
  }

  return {
    ok: true,
    value: {
      name,
      category,
      family,
      unit: text(input.unit) || null,
      threshold: text(input.threshold) || null,
      limitValue: limit,
      alertOnExceed,
      calcFactor: factor ?? 1,
      aliases: aliases.length > 0 ? aliases.join("\n") : null,
    },
  };
}

/**
 * An edit made on a stale copy (open point of D-19): a form opened before
 * « Reclasser plusieurs paramètres » sends back the domain it showed and
 * silently undoes the reclassification. So the form sends the version of
 * the parameter it loaded and `PATCH /api/parameters/[id]` answers 409 with
 * this message when the stored parameter is no longer that one.
 */
export const PARAMETER_CHANGED_ERROR =
  "Ce paramètre a été modifié entre-temps (reclassé ou édité) : rechargez-le avant d'enregistrer.";

/**
 * The version of a parameter: a fingerprint of every field an edit writes
 * (the columns of `CleanParameter`, nothing else — not its id, not the norm
 * the screen shows). The table has no `updatedAt`, so the values themselves
 * are compared. Pure and the same in the browser and on the server: the
 * screen computes it from the row it was given, the route from the row it
 * reads.
 */
export function parameterVersion(parameter: CleanParameter): string {
  const fields = JSON.stringify([
    parameter.name,
    parameter.category,
    parameter.family,
    parameter.unit,
    parameter.threshold,
    parameter.limitValue,
    parameter.alertOnExceed,
    parameter.calcFactor,
    parameter.aliases,
  ]);
  // cyrb53: 53 bits, enough to tell two states of one parameter apart.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < fields.length; i++) {
    const code = fields.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 2654435761);
    h2 = Math.imul(h2 ^ code, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * The `version` an edit sent against the stored parameter: "ok" when it is
 * the stored one — or when none was sent (a script changing one field: no
 * token, no check; the screen always sends one) — "stale" when the
 * parameter changed since it was loaded, "invalid" when it is not a version.
 */
export function checkParameterVersion(sent: unknown, stored: CleanParameter): "ok" | "stale" | "invalid" {
  if (sent === undefined || sent === null) return "ok";
  if (typeof sent !== "string") return "invalid";
  return sent === parameterVersion(stored) ? "ok" : "stale";
}

/** The nine fields the edit form has always sent, all of them on every save. */
export const PARAMETER_FORM_KEYS = [
  "name",
  "category",
  "family",
  "unit",
  "threshold",
  "limitValue",
  "alertOnExceed",
  "calcFactor",
  "aliases",
] as const;

/**
 * The answer to a save from a page loaded before the version existed: the
 * old form shows it in the page banner and keeps what was typed.
 */
export const PARAMETER_PAGE_OUTDATED_ERROR =
  "Cette page date d'avant la dernière mise à jour du logiciel : rechargez-la avant d'enregistrer. Rien n'a été enregistré.";

/**
 * A save sent by the edit form of a page loaded before the deploy (D-19): the
 * nine fields of the form and no `version`. Such a tab still runs the old
 * code and would send back the domain it showed — after « Reclasser
 * plusieurs paramètres », the old one. A script changing a field or two
 * never sends the whole form, so it is not concerned.
 */
export function isOutdatedFormSave(body: Record<string, unknown>): boolean {
  if (body.version !== undefined && body.version !== null) return false;
  return PARAMETER_FORM_KEYS.every((key) => key in body);
}
