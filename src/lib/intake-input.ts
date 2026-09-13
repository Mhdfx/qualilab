import type { HandsState, LineKind, QuantityUnit } from "@/generated/prisma/enums";
import { validateLine, type CleanLine, type NatureRef } from "./serie-input";

/**
 * « Corriger la fiche » — editing the identification fields of a sample
 * after its creation (a lot typed wrong, a DLC, the place), with a reason.
 * Pure: the same line rules as the protocol apply, the current row fills
 * what the correction does not mention, and only actual changes survive.
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
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  remarks: string | null;
  unitCount: number;
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
    surfaceLabel: current.surfaceLabel ?? "",
    surfaceAreaCm2: current.surfaceAreaCm2 ?? "",
    personName: current.personName ?? "",
    personRole: current.personRole ?? "",
    handsState: current.handsState ?? "",
    remarks: current.remarks ?? "",
    unitCount: current.unitCount,
    parameterIds: current.parameterIds,
  };
}

export function validateIntake(raw: unknown, current: IntakeCurrent): IntakeValidation {
  const input = (raw ?? {}) as Record<string, unknown>;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason) return { ok: false, error: "Indiquez le motif de la correction." };
  if (reason.length > 2000) return { ok: false, error: "Le motif est trop long (2000 caractères maximum)." };

  // Only the fields the correction mentions override the row; the kind and
  // the nature never change here (that would be another sample).
  const merged = currentAsRaw(current);
  for (const key of [...FIELDS, "parameterIds"] as const) {
    if (input[key] !== undefined) merged[key] = input[key];
  }

  const natures = new Map<string, NatureRef>([
    ["current", { id: "current", defaultLineKind: current.lineKind, active: true }],
  ]);
  const checked = validateLine(merged, 0, natures);
  if (!checked.ok) return { ok: false, error: checked.error };
  const clean: CleanLine = checked.value;

  const changes: Partial<IntakeFields> = {};
  for (const key of FIELDS) {
    const next = clean[key] as IntakeFields[typeof key];
    if (!same(current[key], next)) (changes as Record<string, unknown>)[key] = next;
  }

  const wanted = input.parameterIds === undefined ? null : clean.parameterIds;
  const sameParameters =
    wanted === null ||
    (wanted.length === current.parameterIds.length && wanted.every((id) => current.parameterIds.includes(id)));
  const parameterIds = sameParameters ? null : wanted;

  if (Object.keys(changes).length === 0 && parameterIds === null) {
    return { ok: false, error: "Aucune modification à enregistrer." };
  }

  return { ok: true, value: { changes, parameterIds, reason } };
}
