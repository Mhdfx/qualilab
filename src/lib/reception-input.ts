import type { NonConformityReason, QuantityUnit } from "@/generated/prisma/enums";
import { futureMessage } from "./labels";
import {
  EXPLOITABLE_MESSAGES,
  evaluateReception,
  receptionChecklist,
  type Check,
  type ChecklistRow,
  type ReceptionLine,
  type ReceptionThresholds,
} from "./reception-rules";
import { NON_CONFORMITY_REASONS } from "./serie-input";

/**
 * Validating the grouped reception of a série — pure, shared by the screen
 * and by `POST /api/series/[id]/reception`.
 *
 * The API receives every line still waiting (`PRELEVE`) with what the
 * réceptionniste measured or confirmed. The rules engine runs again here,
 * with the laboratory's thresholds: a line under a blocking rule cannot be
 * declared conform, whatever the browser sent.
 *
 * Rule (1) of the bon de réception (retour du 08/10, « les règles comme une
 * checklist »): every line says whether the sample is exploitable for the
 * analysis. A page opened before the checklist sends no answer and is told
 * so; a non-exploitable sample cannot be declared conform. The seven-row
 * checklist travels with each clean line, for the audit.
 *
 * A non-conform line is decided case by case (RETOUR-LABO-29-09.md, slice
 * E): analysed anyway, or destroyed — received and numbered like the others
 * (it prints on the bon de réception), then cancelled with the motif
 * « Détruit à réception ».
 *
 * The technician is not the réceptionniste's to choose (retour du 08/10,
 * RETOUR-LABO-06-10.md §9.3): the responsable des paramètres picks the
 * sample from the global queue and assigns the bench on the programme sheet
 * (PROGRAMME.md §6). A `technicianId` still sent — a page opened before the
 * change — is ignored, never refused: the reception goes through, without
 * a technician.
 *
 * Messages name the sample (« Échantillon 2 : … », RETOUR-LABO-06-10.md §5,
 * V2); the two samples of a two-family line share the line number and are
 * told apart by their letter (« Échantillon 2M », « Échantillon 2P »).
 */

const QUANTITY_UNITS = ["UNITE", "G", "ML", "L"] as const;

/** A line of the série as the database holds it before reception. */
export type ReceptionCandidate = ReceptionLine & {
  id: string;
  lineNumber: number;
  status: string;
  /** The sample's code (« 1/26-2M »): its letter names one of two samples
   * of the same line in the messages. Optional — « 2 » without it. */
  code?: string | null;
};

/**
 * « 2M » / « 2P » for one of the two samples of a two-family line, read from
 * its code (« 1/26-2M »); the bare line number otherwise — older codes
 * included.
 */
export function sampleRef(lineNumber: number, code?: string | null): string {
  const match = code ? /-(\d+)([MP])$/.exec(code) : null;
  return match && Number(match[1]) === lineNumber ? `${lineNumber}${match[2]}` : String(lineNumber);
}

export type CleanReceptionLine = {
  sampleId: string;
  lineNumber: number;
  /** « 2 », or « 2M » / « 2P » for the two samples of a two-family line. */
  ref: string;
  receptionTemperature: number | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  /** Rule (1): the réceptionniste's answer, written to `Sample.receptionExploitable`. */
  exploitable: boolean;
  conformity: boolean;
  conformityReason: NonConformityReason | null;
  conformityNote: string | null;
  /** « Détruire » on a non-conform line: no analysis, cancelled at once. */
  destroy: boolean;
  checks: Check[];
  /** The seven rules of the bon, as computed with the laboratory's thresholds — audited. */
  checklist: ChecklistRow[];
};

export type CleanReception = {
  arrivedAt: Date | null;
  coolerTemperature: number | null;
  lines: CleanReceptionLine[];
};

export type ReceptionValidation =
  | { ok: true; value: CleanReception }
  /** `ref` names the sample (« 2 », « 2M », « 2P ») when the error is about one. */
  | { ok: false; error: string; lineNumber?: number; ref?: string };

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

/** « Indiquez … » → « Échantillon 2 : indiquez … » — the reception's own form, screen and API. */
export function receptionLineMessage(ref: string, message: string) {
  return `Échantillon ${ref} : ${message.charAt(0).toLocaleLowerCase("fr")}${message.slice(1)}`;
}

export function validateReception(
  raw: unknown,
  candidates: ReceptionCandidate[],
  thresholds: ReceptionThresholds
): ReceptionValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string, lineNumber?: number, ref?: string): ReceptionValidation =>
    ref === undefined ? { ok: false, error, lineNumber } : { ok: false, error, lineNumber, ref };

  const pending = candidates.filter((c) => c.status === "PRELEVE");
  if (pending.length === 0) return fail("Cette série est déjà réceptionnée.");

  // ---- Header ---------------------------------------------------------------
  let arrivedAt: Date | null = null;
  if (input.arrivedAt !== undefined && input.arrivedAt !== null && input.arrivedAt !== "") {
    const d = new Date(String(input.arrivedAt));
    if (Number.isNaN(d.getTime())) return fail("L'heure d'arrivée est invalide.");
    if (d.getTime() > Date.now() + 5 * 60 * 1000) return fail(futureMessage("L'heure d'arrivée"));
    arrivedAt = d;
  }
  const coolerTemperature = parseNumber(input.coolerTemperature, -80, 300);
  if (coolerTemperature === INVALID) {
    return fail("La température de la glacière doit être un nombre plausible.");
  }

  // ---- Lines ----------------------------------------------------------------
  const rawLines = Array.isArray(input.lines) ? (input.lines as RawLine[]) : null;
  if (!rawLines) return fail("Les échantillons de la série sont manquants.");

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const seen = new Set<string>();
  const lines: CleanReceptionLine[] = [];

  for (const rawLine of rawLines) {
    const sampleId = text(rawLine?.sampleId);
    const candidate = byId.get(sampleId);
    if (!candidate) return fail("Un échantillon envoyé n'appartient pas à cette série.");
    const n = candidate.lineNumber;
    const ref = sampleRef(n, candidate.code);
    if (candidate.status !== "PRELEVE") {
      return fail(`L'échantillon ${ref} est déjà réceptionné.`, n, ref);
    }
    if (seen.has(sampleId)) {
      return fail(`L'échantillon ${ref} est envoyé deux fois.`, n, ref);
    }
    seen.add(sampleId);

    const receptionTemperature = parseNumber(rawLine.receptionTemperature, -80, 300);
    if (receptionTemperature === INVALID) {
      return fail(`Échantillon ${ref} : la température à l'arrivée doit être un nombre plausible.`, n, ref);
    }

    const quantity = parseNumber(rawLine.quantity, 0, 1_000_000);
    if (quantity === INVALID) return fail(`Échantillon ${ref} : la quantité est invalide.`, n, ref);
    let quantityUnit: QuantityUnit | null = null;
    if (quantity !== null) {
      const unit = text(rawLine.quantityUnit) as QuantityUnit;
      if (!QUANTITY_UNITS.includes(unit)) return fail(`Échantillon ${ref} : précisez l'unité de la quantité.`, n, ref);
      quantityUnit = unit;
    }

    // Rule (1) first: a page opened before the checklist sends none.
    if (typeof rawLine.exploitable !== "boolean") return fail(receptionLineMessage(ref, EXPLOITABLE_MESSAGES.missing), n, ref);
    const exploitable = rawLine.exploitable;

    const measured: ReceptionLine = {
      lineKind: candidate.lineKind,
      family: candidate.family,
      parameterNames: candidate.parameterNames,
      quantity,
      quantityUnit,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round(receptionTemperature * 10) / 10,
      unitCount: candidate.unitCount,
    };
    const checks = evaluateReception(measured, thresholds);
    const checklist = receptionChecklist(measured, thresholds, { exploitable });

    if (typeof rawLine.conformity !== "boolean") {
      return fail(`Échantillon ${ref} : indiquez la conformité.`, n, ref);
    }
    const conformity = rawLine.conformity;
    if (conformity && !exploitable) return fail(receptionLineMessage(ref, EXPLOITABLE_MESSAGES.conform), n, ref);
    const blocking = checks.find((c) => c.level === "BLOQUANT");
    if (conformity && blocking) {
      return fail(`Échantillon ${ref} : ${blocking.message} L'échantillon ne peut pas être déclaré conforme.`, n, ref);
    }

    let conformityReason: NonConformityReason | null = null;
    let conformityNote: string | null = null;
    if (!conformity) {
      const reason = text(rawLine.conformityReason) as NonConformityReason;
      if (!NON_CONFORMITY_REASONS.includes(reason)) {
        return fail(`Échantillon ${ref} : choisissez le motif de non-conformité.`, n, ref);
      }
      if (reason === "NON_EXPLOITABLE" && exploitable) return fail(receptionLineMessage(ref, EXPLOITABLE_MESSAGES.reason), n, ref);
      conformityReason = reason;
      const note = text(rawLine.conformityNote);
      if (reason === "AUTRE" && !note) return fail(`Échantillon ${ref} : précisez le motif « autre ».`, n, ref);
      conformityNote = note || null;
    }

    // Only a non-conform sample can be destroyed; « analyser » is the default.
    const decision = rawLine.decision === undefined || rawLine.decision === null ? "ANALYSER" : rawLine.decision;
    if (decision !== "ANALYSER" && decision !== "DETRUIRE") {
      return fail(`Échantillon ${ref} : décision inconnue.`, n, ref);
    }
    if (decision === "DETRUIRE" && conformity) {
      return fail(`Échantillon ${ref} : seul un échantillon non conforme peut être détruit.`, n, ref);
    }
    const destroy = decision === "DETRUIRE";
    // `rawLine.technicianId` is deliberately not read (§9.3): the
    // responsable des paramètres assigns the bench at programming time.

    lines.push({
      sampleId,
      lineNumber: n,
      ref,
      receptionTemperature:
        receptionTemperature === null ? null : Math.round(receptionTemperature * 10) / 10,
      quantity,
      quantityUnit,
      exploitable,
      conformity,
      conformityReason,
      conformityNote,
      destroy,
      checks,
      checklist,
    });
  }

  const missing = pending.filter((c) => !seen.has(c.id));
  if (missing.length > 0) {
    return fail(
      `L'échantillon ${sampleRef(missing[0].lineNumber, missing[0].code)} n'est pas renseigné — la série se réceptionne en une fois.`,
      missing[0].lineNumber,
      sampleRef(missing[0].lineNumber, missing[0].code)
    );
  }

  // Line order, microbiology before physico-chemistry within a line: the
  // N° de contrôle are drawn in this order.
  lines.sort((a, b) => a.lineNumber - b.lineNumber || a.ref.localeCompare(b.ref));
  return {
    ok: true,
    value: {
      arrivedAt,
      coolerTemperature: coolerTemperature === null ? null : Math.round(coolerTemperature * 10) / 10,
      lines,
    },
  };
}
