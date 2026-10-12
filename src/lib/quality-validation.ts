/**
 * Validating the Système Qualité inputs — pure, shared by API and forms.
 */

import { parseIsoDay } from "./date-only";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** Every short text column is VARCHAR(191): refuse politely rather than crash on insert. */
const TEXT_MAX = 191;
/** The free observations (TEXT columns): bounded well below their 65 535 bytes. */
const NOTES_MAX = 5000;

/** A plausible laboratory temperature (°C) — a reading, or an equipment's bound. */
const READING_MIN_C = -80;
const READING_MAX_C = 300;

/** The first field longer than its column, as the French message of the 400 — or null. */
function tooLong(fields: [label: string, value: string, feminine?: boolean][]): string | null {
  const field = fields.find(([, value]) => value.length > TEXT_MAX);
  return field ? `${field[0]} est trop ${field[2] ? "longue" : "long"} (${TEXT_MAX} caractères max).` : null;
}

/**
 * A calendar day of a form (« AAAA-MM-JJ », or the day of an ISO date-time):
 * an impossible day (« 2026-02-30 ») is refused instead of rolling over to
 * March like `new Date()` does. Stored at 00:00 UTC, as before.
 */
function formDay(value: string): Date | null {
  return parseIsoDay(value.slice(0, 10));
}

function numberOrNull(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null) return null;
  // A number or a typed figure only: « "   " » and « [] » read as 0 through
  // Number() and a blank reading was logged at 0 °C (full-db 12/10).
  if (typeof value !== "number" && typeof value !== "string") return "invalid";
  if (typeof value === "string" && !value.trim()) return null;
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : "invalid";
}

// ————— Equipment —————

export type CleanEquipment = {
  name: string;
  code: string | null;
  location: string | null;
  calibrationFrequencyMonths: number | null;
  tempMin: number | null;
  tempMax: number | null;
};

export function validateEquipment(
  input: Record<string, unknown>
): { ok: true; value: CleanEquipment } | { ok: false; error: string } {
  const name = text(input.name);
  if (!name) return { ok: false, error: "Le nom de l'équipement est obligatoire." };
  if (name.length > 191) return { ok: false, error: "Le nom de l'équipement est trop long (191 caractères max)." };
  const long = tooLong([
    ["Le code", text(input.code)],
    ["L'emplacement", text(input.location)],
  ]);
  if (long) return { ok: false, error: long };

  const frequency = numberOrNull(input.calibrationFrequencyMonths);
  if (
    frequency === "invalid" ||
    (frequency !== null && (!Number.isInteger(frequency) || frequency < 1 || frequency > 120))
  ) {
    return {
      ok: false,
      error: "La périodicité d'étalonnage doit être un nombre de mois entre 1 et 120 (ou vide).",
    };
  }

  const tempMin = numberOrNull(input.tempMin);
  const tempMax = numberOrNull(input.tempMax);
  if (tempMin === "invalid" || tempMax === "invalid") {
    return { ok: false, error: "Les bornes de température doivent être des nombres (°C)." };
  }
  // The same plausible range as a reading: a bound of 1e308 °C could never
  // be met and printed hundreds of digits across the metrology screen.
  if ([tempMin, tempMax].some((bound) => bound !== null && (bound < READING_MIN_C || bound > READING_MAX_C))) {
    return {
      ok: false,
      error: `Les bornes de température doivent être plausibles (entre ${READING_MIN_C} et ${READING_MAX_C} °C).`,
    };
  }
  if (tempMin !== null && tempMax !== null && tempMin >= tempMax) {
    return {
      ok: false,
      error: "La borne minimale doit être inférieure à la borne maximale.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      code: text(input.code) || null,
      location: text(input.location) || null,
      calibrationFrequencyMonths: frequency,
      tempMin,
      tempMax,
    },
  };
}

// ————— Calibration record —————

export type CleanCalibration = {
  performedAt: Date;
  provider: string | null;
  certificate: string | null;
  result: "CONFORME" | "NON_CONFORME";
  notes: string | null;
};

export function validateCalibration(
  input: Record<string, unknown>
): { ok: true; value: CleanCalibration } | { ok: false; error: string } {
  const performedAt = formDay(text(input.performedAt));
  if (!performedAt) {
    return { ok: false, error: "La date de l'étalonnage est invalide." };
  }
  if (performedAt.getTime() > Date.now() + 86_400_000) {
    return { ok: false, error: "Un étalonnage ne peut pas être daté dans le futur." };
  }

  const long = tooLong([
    ["L'organisme", text(input.provider)],
    ["Le n° de certificat", text(input.certificate)],
  ]);
  if (long) return { ok: false, error: long };
  // A TEXT column (65 535 bytes): a longer note was a 500 (full-db 12/10).
  if (text(input.notes).length > NOTES_MAX) {
    return { ok: false, error: `Les observations sont trop longues (${NOTES_MAX} caractères max).` };
  }

  const result = input.result === "NON_CONFORME" ? "NON_CONFORME" : "CONFORME";

  return {
    ok: true,
    value: {
      performedAt,
      provider: text(input.provider) || null,
      certificate: text(input.certificate) || null,
      result,
      notes: text(input.notes) || null,
    },
  };
}

// ————— Temperature reading —————

export function validateReading(
  input: Record<string, unknown>
): { ok: true; value: { value: number; note: string | null } } | { ok: false; error: string } {
  const value = numberOrNull(input.value);
  if (value === null || value === "invalid" || value < -80 || value > 300) {
    return {
      ok: false,
      error: "La température doit être un nombre plausible (entre -80 et 300 °C).",
    };
  }
  const long = tooLong([["La remarque", text(input.note), true]]);
  if (long) return { ok: false, error: long };
  return {
    ok: true,
    value: { value: Math.round(value * 10) / 10, note: text(input.note) || null },
  };
}

// ————— EIL campaign —————

export const EIL_STATUSES = [
  "PREVUE",
  "EN_COURS",
  "RESULTATS_RECUS",
  "CLOTUREE",
] as const;
export type EilStatusValue = (typeof EIL_STATUSES)[number];

export type CleanEil = {
  name: string;
  organizer: string | null;
  scope: string | null;
  startDate: Date | null;
  resultDate: Date | null;
  status: EilStatusValue;
  outcome: string | null;
  satisfactory: boolean | null;
  notes: string | null;
};

export function validateEil(
  input: Record<string, unknown>
): { ok: true; value: CleanEil } | { ok: false; error: string } {
  const name = text(input.name);
  if (!name) return { ok: false, error: "Le nom de la campagne est obligatoire." };
  const long = tooLong([
    ["Le nom de la campagne", name],
    ["L'organisateur", text(input.organizer)],
    ["Le périmètre", text(input.scope)],
    ["Le résultat", text(input.outcome)],
  ]);
  if (long) return { ok: false, error: long };

  const status = EIL_STATUSES.includes(input.status as EilStatusValue)
    ? (input.status as EilStatusValue)
    : "PREVUE";

  let startDate: Date | null = null;
  if (text(input.startDate)) {
    startDate = formDay(text(input.startDate));
    if (!startDate) {
      return { ok: false, error: "La date de début est invalide." };
    }
  }
  let resultDate: Date | null = null;
  if (text(input.resultDate)) {
    resultDate = formDay(text(input.resultDate));
    if (!resultDate) {
      return { ok: false, error: "La date des résultats est invalide." };
    }
  }
  if (startDate && resultDate && resultDate < startDate) {
    return { ok: false, error: "La date des résultats ne peut pas précéder le début de la campagne." };
  }
  if (text(input.notes).length > NOTES_MAX) {
    return { ok: false, error: `Les observations sont trop longues (${NOTES_MAX} caractères max).` };
  }

  return {
    ok: true,
    value: {
      name,
      organizer: text(input.organizer) || null,
      scope: text(input.scope) || null,
      startDate,
      resultDate,
      status,
      outcome: text(input.outcome) || null,
      satisfactory:
        typeof input.satisfactory === "boolean" ? input.satisfactory : null,
      notes: text(input.notes) || null,
    },
  };
}
