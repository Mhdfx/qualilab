/**
 * Validating the Système Qualité inputs — pure, shared by API and forms.
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberOrNull(value: unknown): number | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
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
  if (name.length > 200) return { ok: false, error: "Le nom de l'équipement est trop long." };

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
  const performedAt = new Date(text(input.performedAt));
  if (Number.isNaN(performedAt.getTime())) {
    return { ok: false, error: "La date de l'étalonnage est invalide." };
  }
  if (performedAt.getTime() > Date.now() + 86_400_000) {
    return { ok: false, error: "Un étalonnage ne peut pas être daté dans le futur." };
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

  const status = EIL_STATUSES.includes(input.status as EilStatusValue)
    ? (input.status as EilStatusValue)
    : "PREVUE";

  let startDate: Date | null = null;
  if (text(input.startDate)) {
    startDate = new Date(text(input.startDate));
    if (Number.isNaN(startDate.getTime())) {
      return { ok: false, error: "La date de début est invalide." };
    }
  }
  let resultDate: Date | null = null;
  if (text(input.resultDate)) {
    resultDate = new Date(text(input.resultDate));
    if (Number.isNaN(resultDate.getTime())) {
      return { ok: false, error: "La date des résultats est invalide." };
    }
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
