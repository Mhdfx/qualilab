import type {
  AirMethod,
  CancelReason,
  HandsState,
  LineKind,
  QuantityUnit,
  SampleStatus,
  SampleType,
  SurfaceState,
} from "@/generated/prisma/enums";
import { CANCEL_REASON_LABELS, isExposedPlate } from "@/lib/labels";
import { surfaceAreaPayload } from "@/components/preleveur/visit-types";

/**
 * The pure half of « Corriger la fiche » (SampleVerbs.tsx): which fields a
 * kind of sample shows and the body sent to `PATCH /api/samples/[id]/intake`.
 * Kept out of the client component so the dialog ↔ API contract is tested
 * against `validateIntake` (sample-verbs-logic.test.ts).
 */

export type VerbSample = {
  id: string;
  code: string;
  controlCode: string | null;
  status: SampleStatus;
  /** A report was issued (a sample reopened for amendment): no « Annuler ». */
  hasReport?: boolean;
  type: SampleType;
  lineKind: LineKind;
  produit: string | null;
  lieu: string;
  numeroLot: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  /** « Température au prélèvement » / « T° ambiante » (P9, 16/10): corrected
   * here, never emptied once recorded. */
  productTemperature: number | null;
  ambientTemperature: number | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  /** « Autre » of the area given as a text (16/10), in place of `surfaceAreaCm2`. */
  surfaceAreaNote: string | null;
  /** « État de la surface » of a SURFACE sample; absent or null on older samples. */
  surfaceState?: SurfaceState | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  /** « Méthode de prélèvement » of an AIR sample; absent or null on older samples. */
  airMethod?: AirMethod | null;
  /** The exposed plate's duration (16/10); null on an older plate (read 30 min). */
  airExposureMin: number | null;
  remarks: string | null;
  unitCount: number;
  parameterIds: string[];
  /** The catalogue's product type, changeable until approval (CRITERES.md). */
  productTypeId: string | null;
  clientId: string;
};

/**
 * The motifs « Annuler » offers for a sample, in the labels' order.
 * « Détruit à réception » is the reception's own verb (slice E), never
 * picked here; « Non reçu au laboratoire » only concerns a sample still
 * waiting for its reception (PRELEVE) — the cancel route refuses it on any
 * other status.
 */
export function cancelReasonsFor(status: SampleStatus): CancelReason[] {
  return (Object.keys(CANCEL_REASON_LABELS) as CancelReason[]).filter(
    (reason) => reason !== "DETRUIT_A_RECEPTION" && (reason !== "NON_RECU" || status === "PRELEVE")
  );
}

/** Which identification fields a kind of sample shows — and sends. */
export function correctionFields(kind: LineKind) {
  return {
    produit: kind === "ALIMENT" || kind === "EAU" || kind === "AIR" || kind === "AUTRE",
    food: kind === "ALIMENT",
    quantity: kind === "ALIMENT" || kind === "EAU" || kind === "AUTRE",
    // The air has no « Température au prélèvement » (§8.5): its ambient one only.
    productTemperature: kind !== "AIR",
    surface: kind === "SURFACE",
    hands: kind === "MAINS",
    air: kind === "AIR",
  };
}

/** « Corriger la fiche » as typed: strings for the inputs, "" for a choice not made. */
export type CorrectionValues = {
  produit: string;
  lieu: string;
  numeroLot: string;
  productionDate: string;
  expiryDate: string;
  quantity: string;
  quantityUnit: QuantityUnit;
  /** With a decimal comma, as the screens write it. */
  productTemperature: string;
  ambientTemperature: string;
  surfaceLabel: string;
  /** The chip's area, another whole number, or the « Autre » text (16/10) — one field, as on the visit. */
  surfaceAreaCm2: string;
  surfaceState: SurfaceState | "";
  personName: string;
  personRole: string;
  handsState: HandsState | "";
  airMethod: AirMethod | "";
  airExposureMin: string;
  remarks: string;
  unitCount: number;
  productTypeId: string;
};

/** « 4,5 » — a temperature in the field, with the decimal comma; "" when not recorded. */
function temperatureValue(value: number | null): string {
  return value === null ? "" : String(value).replace(".", ",");
}

export function correctionValues(sample: VerbSample): CorrectionValues {
  return {
    produit: sample.produit ?? "",
    lieu: sample.lieu,
    numeroLot: sample.numeroLot ?? "",
    productionDate: sample.productionDate ? sample.productionDate.slice(0, 10) : "",
    expiryDate: sample.expiryDate ? sample.expiryDate.slice(0, 10) : "",
    quantity: sample.quantity === null ? "" : String(sample.quantity).replace(".", ","),
    quantityUnit: sample.quantityUnit ?? "G",
    productTemperature: temperatureValue(sample.productTemperature),
    ambientTemperature: temperatureValue(sample.ambientTemperature),
    surfaceLabel: sample.surfaceLabel ?? "",
    surfaceAreaCm2: sample.surfaceAreaNote ?? (sample.surfaceAreaCm2 === null ? "" : String(sample.surfaceAreaCm2)),
    surfaceState: sample.surfaceState ?? "",
    personName: sample.personName ?? "",
    personRole: sample.personRole ?? "",
    handsState: sample.handsState ?? "",
    airMethod: sample.airMethod ?? "",
    airExposureMin: sample.airExposureMin === null ? "" : String(sample.airExposureMin),
    remarks: sample.remarks ?? "",
    unitCount: sample.unitCount,
    productTypeId: sample.productTypeId ?? "",
  };
}

/**
 * The body of `PATCH /api/samples/[id]/intake`: the fields the dialog shows
 * for this kind, nothing else — a value of another kind stays as it was. An
 * empty state, method or hands state is left out: an older sample stays
 * without one, and the API refuses to empty one that is set. The
 * temperatures are always sent (an empty one stays empty on an older
 * sample; the API refuses to empty a recorded one); the area's field goes
 * as an area or as its « Autre » text (`surfaceAreaPayload`); the plate's
 * duration goes with the exposed plate only.
 */
export function correctionBody(
  kind: LineKind,
  values: CorrectionValues,
  parameterIds: string[] | null,
  reason: string
): Record<string, unknown> {
  const shown = correctionFields(kind);
  return {
    lieu: values.lieu,
    remarks: values.remarks,
    unitCount: values.unitCount,
    ...(shown.produit ? { produit: values.produit } : {}),
    ...(shown.food
      ? {
          productTypeId: values.productTypeId,
          numeroLot: values.numeroLot,
          productionDate: values.productionDate,
          expiryDate: values.expiryDate,
        }
      : {}),
    ...(shown.quantity ? { quantity: values.quantity, quantityUnit: values.quantityUnit } : {}),
    ...(shown.productTemperature ? { productTemperature: values.productTemperature } : {}),
    ambientTemperature: values.ambientTemperature,
    ...(shown.surface
      ? {
          surfaceLabel: values.surfaceLabel,
          ...surfaceAreaPayload(values.surfaceAreaCm2),
          ...(values.surfaceState ? { surfaceState: values.surfaceState } : {}),
        }
      : {}),
    ...(shown.hands
      ? {
          personName: values.personName,
          personRole: values.personRole,
          ...(values.handsState ? { handsState: values.handsState } : {}),
        }
      : {}),
    ...(shown.air && values.airMethod ? { airMethod: values.airMethod } : {}),
    ...(shown.air && isExposedPlate(values.airMethod) ? { airExposureMin: values.airExposureMin } : {}),
    ...(parameterIds ? { parameterIds } : {}),
    reason,
  };
}
