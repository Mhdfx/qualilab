import type { AirMethod, HandsState, LineKind, QuantityUnit, SurfaceState } from "@/generated/prisma/enums";
import { AIR_METHOD_CHOICES, SURFACE_STATE_CHOICES } from "./labels";
import { validateLine, type CleanLine, type NatureRef } from "./serie-input";

/**
 * « Corriger la fiche » — editing the identification fields of a sample
 * after its creation (a lot typed wrong, a DLC, the place), with a reason.
 * Pure: the same line rules as the protocol apply, the current row fills
 * what the correction does not mention, and only actual changes survive.
 *
 * A few fields are decided here rather than by the protocol's line rules,
 * because a correction must keep old rows readable and correctable
 * (RETOUR-LABO-06-10.md §5, V2 and V4):
 * - a SURFACE line's « Désignation » (`surfaceLabel`), « Surface prélevée
 *   (cm²) » (`surfaceAreaCm2`) and « État de la surface » (`surfaceState`) —
 *   the state is required on a new line, but a line entered before it
 *   existed may be corrected without one; once set it cannot be emptied;
 * - an AIR line's « Méthode de prélèvement » (`airMethod`), same rule;
 * - the product type, which the programme may give any line (not only a
 *   food one) — the protocol's rule would silently drop it;
 * - the analyses: at least one when the correction names them.
 * A stored value the correction does not mention is never emptied by a rule
 * of the line kind: old data stays as it was.
 */

export type IntakeFields = {
  produit: string | null;
  lieu: string;
  numeroLot: string | null;
  productionDate: Date | null;
  expiryDate: Date | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  productTemperature: number | null;
  ambientTemperature: number | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  surfaceState: SurfaceState | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  airMethod: AirMethod | null;
  remarks: string | null;
  unitCount: number;
  productTypeId: string | null;
};

export type IntakeCurrent = IntakeFields & { lineKind: LineKind; parameterIds: string[] };

export type IntakeValidation =
  | {
      ok: true;
      value: {
        changes: Partial<IntakeFields>;
        /** Null when the analyses were not touched. */
        parameterIds: string[] | null;
        reason: string;
      };
    }
  | { ok: false; error: string };

/** `Sample.surfaceLabel` VARCHAR(191). */
export const MAX_DESIGNATION = 191;
/** The area of a surface line: a whole number of cm², 100 when left blank. */
export const MAX_SURFACE_AREA_CM2 = 100_000;
export const DEFAULT_SURFACE_AREA_CM2 = 100;

const FIELDS: (keyof IntakeFields)[] = [
  "produit",
  "lieu",
  "numeroLot",
  "productionDate",
  "expiryDate",
  "quantity",
  "quantityUnit",
  "productTemperature",
  "ambientTemperature",
  "surfaceLabel",
  "surfaceAreaCm2",
  "surfaceState",
  "personName",
  "personRole",
  "handsState",
  "airMethod",
  "remarks",
  "unitCount",
  "productTypeId",
];

/** The fields the protocol's line rules check; the others are decided here. */
const LINE_RULE_FIELDS: (keyof IntakeFields)[] = [
  "produit",
  "lieu",
  "numeroLot",
  "productionDate",
  "expiryDate",
  "quantity",
  "quantityUnit",
  "productTemperature",
  "ambientTemperature",
  "personName",
  "personRole",
  "handsState",
  "remarks",
  "unitCount",
];

/** « AAAA-MM-JJ » in local time — a DLC is a day, never an instant. */
function iso(date: Date | null) {
  if (!date) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function same(a: IntakeFields[keyof IntakeFields], b: IntakeFields[keyof IntakeFields]) {
  if (a instanceof Date || b instanceof Date) return iso(a as Date | null) === iso(b as Date | null);
  return (a ?? null) === (b ?? null);
}

/** The current row as the line validator expects it (strings, dates as « AAAA-MM-JJ »). */
function currentAsRaw(current: IntakeCurrent): Record<string, unknown> {
  return {
    natureId: "current",
    lineKind: current.lineKind,
    produit: current.produit ?? "",
    lieu: current.lieu,
    numeroLot: current.numeroLot ?? "",
    productionDate: iso(current.productionDate),
    expiryDate: iso(current.expiryDate),
    quantity: current.quantity ?? "",
    quantityUnit: current.quantityUnit ?? "",
    productTemperature: current.productTemperature ?? "",
    ambientTemperature: current.ambientTemperature ?? "",
    personName: current.personName ?? "",
    personRole: current.personRole ?? "",
    handsState: current.handsState ?? "",
    remarks: current.remarks ?? "",
    unitCount: current.unitCount,
  };
}

type Decided<T> = { ok: true; value: T } | { ok: false; error: string };

/** « Désignation » of a surface line: required there, free text (old data) elsewhere. */
function decideDesignation(input: Record<string, unknown>, current: IntakeCurrent): Decided<string | null> {
  let value = current.surfaceLabel;
  if (input.surfaceLabel !== undefined) {
    if (input.surfaceLabel !== null && typeof input.surfaceLabel !== "string") {
      return { ok: false, error: "La désignation est invalide." };
    }
    const typed = (input.surfaceLabel ?? "").trim();
    if (typed.length > MAX_DESIGNATION) {
      return { ok: false, error: `La désignation de la surface est trop longue (${MAX_DESIGNATION} caractères maximum).` };
    }
    value = typed || null;
  }
  if (current.lineKind === "SURFACE" && !value) {
    return { ok: false, error: "Indiquez la désignation de la surface." };
  }
  return { ok: true, value };
}

/** « Surface prélevée (cm²) »: a whole number of cm²; 100 when a surface line's area is emptied. */
function decideArea(input: Record<string, unknown>, current: IntakeCurrent): Decided<number | null> {
  if (input.surfaceAreaCm2 === undefined) return { ok: true, value: current.surfaceAreaCm2 };
  const raw = input.surfaceAreaCm2;
  if (raw === null || raw === "") {
    return { ok: true, value: current.lineKind === "SURFACE" ? DEFAULT_SURFACE_AREA_CM2 : null };
  }
  const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw.trim().replace(",", ".")) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > MAX_SURFACE_AREA_CM2) {
    return { ok: false, error: "La surface prélevée (cm²) doit être un nombre entier positif, 100 000 au plus." };
  }
  return { ok: true, value: parsed };
}

/**
 * A choice that belongs to one line kind (the surface state, the air
 * method): refused on another kind, required once set on its own kind — a
 * line entered before the choice existed may stay without one.
 */
function decideKindChoice<T extends string>(
  raw: unknown,
  stored: T | null,
  options: { applies: boolean; choices: readonly T[]; unknown: string; wrongKind: string; required: string }
): Decided<T | null> {
  if (raw === undefined) return { ok: true, value: stored };
  if (raw === null || raw === "") {
    if (options.applies && stored) return { ok: false, error: options.required };
    return { ok: true, value: options.applies ? stored : null };
  }
  if (typeof raw !== "string" || !(options.choices as readonly string[]).includes(raw)) {
    return { ok: false, error: options.unknown };
  }
  if (!options.applies) return { ok: false, error: options.wrongKind };
  return { ok: true, value: raw as T };
}

export function validateIntake(raw: unknown, current: IntakeCurrent): IntakeValidation {
  const input = (typeof raw === "object" && raw !== null && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) return { ok: false, error: "Indiquez le motif de la correction." };
  if (reason.length > 2000) return { ok: false, error: "Le motif est trop long (2000 caractères maximum)." };

  // ---- What the correction decides itself --------------------------------
  const surfaceLabel = decideDesignation(input, current);
  if (!surfaceLabel.ok) return surfaceLabel;
  const surfaceAreaCm2 = decideArea(input, current);
  if (!surfaceAreaCm2.ok) return surfaceAreaCm2;
  const surfaceState = decideKindChoice(input.surfaceState, current.surfaceState, {
    applies: current.lineKind === "SURFACE",
    choices: SURFACE_STATE_CHOICES,
    unknown: "État de la surface inconnu.",
    wrongKind: "L'état de la surface ne concerne qu'un échantillon de surface.",
    required: "Choisissez l'état de la surface.",
  });
  if (!surfaceState.ok) return surfaceState;
  const airMethod = decideKindChoice(input.airMethod, current.airMethod, {
    applies: current.lineKind === "AIR",
    choices: AIR_METHOD_CHOICES,
    unknown: "Méthode de prélèvement inconnue.",
    wrongKind: "La méthode de prélèvement ne concerne qu'un échantillon d'air.",
    required: "Choisissez la méthode de prélèvement.",
  });
  if (!airMethod.ok) return airMethod;

  let productTypeId = current.productTypeId;
  if (input.productTypeId !== undefined) {
    if (input.productTypeId !== null && typeof input.productTypeId !== "string") {
      return { ok: false, error: "Type de produit invalide." };
    }
    productTypeId = (input.productTypeId ?? "").trim() || null;
  }

  let parameterIds: string[] | null = null;
  if (input.parameterIds !== undefined) {
    if (!Array.isArray(input.parameterIds)) return { ok: false, error: "La liste des analyses est invalide." };
    const wanted = [
      ...new Set(input.parameterIds.filter((id): id is string => typeof id === "string" && id.length > 0)),
    ];
    if (wanted.length === 0) return { ok: false, error: "Choisissez au moins une analyse." };
    const unchanged =
      wanted.length === current.parameterIds.length && wanted.every((id) => current.parameterIds.includes(id));
    parameterIds = unchanged ? null : wanted;
  }

  // ---- The protocol's line rules, on everything else ---------------------
  // Only the fields the correction mentions override the row; the kind and
  // the nature never change here (that would be another sample). What was
  // decided above goes in already clean — with a stand-in where an old row
  // has no value the rules may require — and its outcome is not read back.
  const merged = currentAsRaw(current);
  for (const key of LINE_RULE_FIELDS) {
    if (input[key] !== undefined) merged[key] = input[key];
  }
  merged.surfaceLabel = surfaceLabel.value ?? "";
  merged.surfaceAreaCm2 = surfaceAreaCm2.value ?? "";
  merged.surfaceState = surfaceState.value ?? (current.lineKind === "SURFACE" ? SURFACE_STATE_CHOICES[0] : "");
  merged.airMethod = airMethod.value ?? (current.lineKind === "AIR" ? AIR_METHOD_CHOICES[0] : "");
  merged.productTypeId = productTypeId ?? "";
  const listed = parameterIds ?? current.parameterIds;
  merged.parameterIds = listed.length > 0 ? listed : ["current"];

  const natures = new Map<string, NatureRef>([
    ["current", { id: "current", defaultLineKind: current.lineKind, active: true }],
  ]);
  const checked = validateLine(merged, 0, natures);
  if (!checked.ok) return { ok: false, error: checked.error };
  const clean: CleanLine = checked.value;

  const next: IntakeFields = {
    produit: clean.produit,
    lieu: clean.lieu,
    numeroLot: clean.numeroLot,
    productionDate: clean.productionDate,
    expiryDate: clean.expiryDate,
    quantity: clean.quantity,
    quantityUnit: clean.quantityUnit,
    productTemperature: clean.productTemperature,
    ambientTemperature: clean.ambientTemperature,
    surfaceLabel: surfaceLabel.value,
    surfaceAreaCm2: surfaceAreaCm2.value,
    surfaceState: surfaceState.value,
    personName: clean.personName,
    personRole: clean.personRole,
    handsState: clean.handsState,
    airMethod: airMethod.value,
    remarks: clean.remarks,
    unitCount: clean.unitCount,
    productTypeId,
  };

  // The unit follows the quantity it qualifies.
  const mentioned = (key: keyof IntakeFields) =>
    input[key] !== undefined || (key === "quantityUnit" && input.quantity !== undefined);

  const changes: Partial<IntakeFields> = {};
  for (const key of FIELDS) {
    if (same(current[key], next[key])) continue;
    // A rule of the line kind never empties a stored value nobody touched.
    if (next[key] === null && !mentioned(key)) continue;
    (changes as Record<string, unknown>)[key] = next[key];
  }

  if (Object.keys(changes).length === 0 && parameterIds === null) {
    return { ok: false, error: "Aucune modification à enregistrer." };
  }

  return { ok: true, value: { changes, parameterIds, reason } };
}
