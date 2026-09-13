import type { NonConformityReason, QuantityUnit } from "@/generated/prisma/enums";
import {
  evaluateReception,
  type Check,
  type ReceptionLine,
  type ReceptionThresholds,
} from "./reception-rules";

/**
 * Validating the grouped reception of a série — pure, shared by the screen
 * and by `POST /api/series/[id]/reception`.
 *
 * The API receives every line still waiting (`PRELEVE`) with what the
 * réceptionniste measured or confirmed. The rules engine runs again here:
 * a line under a blocking rule cannot be declared conform, whatever the
 * browser sent.
 */

const QUANTITY_UNITS = ["UNITE", "G", "ML", "L"] as const;
const REASONS = [
  "CHAINE_FROID",
  "TEMPERATURE_MANQUANTE",
  "QUANTITE_INSUFFISANTE",
  "EMBALLAGE",
  "DELAI",
  "IDENTIFICATION",
  "AUTRE",
] as const;

/** A line of the série as the database holds it before reception. */
export type ReceptionCandidate = ReceptionLine & {
  id: string;
  lineNumber: number;
  status: string;
};

export type CleanReceptionLine = {
  sampleId: string;
  lineNumber: number;
  receptionTemperature: number | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  conformity: boolean;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  /** Null when the lab's policy holds the non-conform line unassigned. */
  technicianId: string | null;
  analysisBlocked: boolean;
  checks: Check[];
};

export type CleanReception = {
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  lines: CleanReceptionLine[];
};

export type ReceptionValidation =
  | { ok: true; value: CleanReception }
  | { ok: false; error: string; lineNumber?: number };

type RawLine = Record<string, unknown>;

const INVALID = Symbol("invalid");

/** "" / null → null; "4,5" → 4.5; anything else → INVALID. */
function parseNumber(value: unknown, min: number, max: number): number | null | typeof INVALID {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(n) || n < min || n > max) return INVALID;
  return n;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function validateReception(
  raw: unknown,
  candidates: ReceptionCandidate[],
  thresholds: ReceptionThresholds,
  options: { blockNonConform: boolean }
): ReceptionValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string, lineNumber?: number): ReceptionValidation => ({ ok: false, error, lineNumber });

  const pending = candidates.filter((c) => c.status === "PRELEVE");
  if (pending.length === 0) return fail("Cette série est déjà réceptionnée.");

  // ---- Header ---------------------------------------------------------------
  let arrivedAt: Date | null = null;
  if (input.arrivedAt !== undefined && input.arrivedAt !== null && input.arrivedAt !== "") {
    const d = new Date(String(input.arrivedAt));
    if (Number.isNaN(d.getTime())) return fail("L'heure d'arrivée est invalide.");
    if (d.getTime() > Date.now() + 5 * 60 * 1000) return fail("L'heure d'arrivée est dans le futur.");
    arrivedAt = d;
  }
  const coolerTemperature = parseNumber(input.coolerTemperature, -80, 300);
  if (coolerTemperature === INVALID) {
    return fail("La température de la glacière doit être un nombre plausible.");
  }

  // ---- Lines ----------------------------------------------------------------
  const rawLines = Array.isArray(input.lines) ? (input.lines as RawLine[]) : null;
  if (!rawLines) return fail("Les lignes de la série sont manquantes.");

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const lines: CleanReceptionLine[] = [];

  for (const rawLine of rawLines) {
    const sampleId = text(rawLine?.sampleId);
    const candidate = byId.get(sampleId);
    if (!candidate) return fail("Une ligne envoyée n'appartient pas à cette série.");
    if (candidate.status !== "PRELEVE") {
      return fail(`La ligne ${candidate.lineNumber} est déjà réceptionnée.`, candidate.lineNumber);
    }
    if (seen.has(sampleId)) {
      return fail(`La ligne ${candidate.lineNumber} est envoyée deux fois.`, candidate.lineNumber);
    }
    seen.add(sampleId);
    const n = candidate.lineNumber;

    const receptionTemperature = parseNumber(rawLine.receptionTemperature, -80, 300);
    if (receptionTemperature === INVALID) {
      return fail(`Ligne ${n} : la température à l'arrivée doit être un nombre plausible.`, n);
    }

    const quantity = parseNumber(rawLine.quantity, 0, 1_000_000);
    if (quantity === INVALID) return fail(`Ligne ${n} : la quantité est invalide.`, n);
    let quantityUnit: QuantityUnit | null = null;
    if (quantity !== null) {
      const unit = text(rawLine.quantityUnit) as QuantityUnit;
      if (!QUANTITY_UNITS.includes(unit)) return fail(`Ligne ${n} : précisez l'unité de la quantité.`, n);
      quantityUnit = unit;
    }

    const checks = evaluateReception(
      {
        lineKind: candidate.lineKind,
        family: candidate.family,
        parameterNames: candidate.parameterNames,
        quantity,
        quantityUnit,
        receptionTemperature:
          receptionTemperature === null ? null : Math.round(receptionTemperature * 10) / 10,
        unitCount: candidate.unitCount,
      },
      thresholds
    );

    if (typeof rawLine.conformity !== "boolean") {
      return fail(`Ligne ${n} : indiquez la conformité.`, n);
    }
    const conformity = rawLine.conformity;
    const blocking = checks.find((c) => c.level === "BLOQUANT");
    if (conformity && blocking) {
      return fail(`Ligne ${n} : ${blocking.message} La ligne ne peut pas être déclarée conforme.`, n);
    }

    let conformityReason: NonConformityReason | null = null;
    let conformityNote: string | null = null;
    if (!conformity) {
      const reason = text(rawLine.conformityReason) as NonConformityReason;
      if (!REASONS.includes(reason)) return fail(`Ligne ${n} : choisissez le motif de non-conformité.`, n);
      conformityReason = reason;
      const note = text(rawLine.conformityNote);
      if (reason === "AUTRE" && !note) return fail(`Ligne ${n} : précisez le motif « autre ».`, n);
      conformityNote = note || null;
    }

    const analysisBlocked = options.blockNonConform && !conformity;
    let technicianId: string | null = null;
    if (!analysisBlocked) {
      technicianId = text(rawLine.technicianId);
      if (!technicianId) return fail(`Ligne ${n} : attribuez un technicien.`, n);
    }

    lines.push({
      sampleId,
      lineNumber: n,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round(receptionTemperature * 10) / 10,
      quantity,
      quantityUnit,
      conformity,
      conformityReason,
      conformityNote,
      technicianId,
      analysisBlocked,
      checks,
    });
  }

  const missing = pending.filter((c) => !seen.has(c.id));
  if (missing.length > 0) {
    return fail(
      `La ligne ${missing[0].lineNumber} n'est pas renseignée — la série se réceptionne en une fois.`,
      missing[0].lineNumber
    );
  }

  lines.sort((a, b) => a.lineNumber - b.lineNumber);
  return {
    ok: true,
    value: {
      arrivedAt,
      coolerTemperature: coolerTemperature === null ? null : Math.round(coolerTemperature * 10) / 10,
      lines,
    },
  };
}
