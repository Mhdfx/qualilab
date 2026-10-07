import type {
  AirMethod,
  HandsState,
  LineKind,
  QuantityUnit,
  SampleStatus,
  SampleType,
  SurfaceState,
} from "@/generated/prisma/enums";

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
  type: SampleType;
  lineKind: LineKind;
  produit: string | null;
  lieu: string;
  numeroLot: string | null;
  productionDate: string | null;
  expiryDate: string | null;
  quantity: number | null;
  quantityUnit: QuantityUnit | null;
  surfaceLabel: string | null;
  surfaceAreaCm2: number | null;
  /** « État de la surface » of a SURFACE sample; absent or null on older samples. */
  surfaceState?: SurfaceState | null;
  personName: string | null;
  personRole: string | null;
  handsState: HandsState | null;
  /** « Méthode de prélèvement » of an AIR sample; absent or null on older samples. */
  airMethod?: AirMethod | null;
  remarks: string | null;
  unitCount: number;
  parameterIds: string[];
  /** The catalogue's product type, changeable until approval (CRITERES.md). */
  productTypeId: string | null;
  clientId: string;
};

/** Which identification fields a kind of sample shows — and sends. */
export function correctionFields(kind: LineKind) {
  return {
    produit: kind === "ALIMENT" || kind === "EAU" || kind === "AIR" || kind === "AUTRE",
    food: kind === "ALIMENT",
    quantity: kind === "ALIMENT" || kind === "EAU" || kind === "AUTRE",
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
  surfaceLabel: string;
  surfaceAreaCm2: string;
  surfaceState: SurfaceState | "";
  personName: string;
  personRole: string;
  handsState: HandsState | "";
  airMethod: AirMethod | "";
  remarks: string;
  unitCount: number;
  productTypeId: string;
};

export function correctionValues(sample: VerbSample): CorrectionValues {
  return {
    produit: sample.produit ?? "",
    lieu: sample.lieu,
    numeroLot: sample.numeroLot ?? "",
    productionDate: sample.productionDate ? sample.productionDate.slice(0, 10) : "",
    expiryDate: sample.expiryDate ? sample.expiryDate.slice(0, 10) : "",
    quantity: sample.quantity === null ? "" : String(sample.quantity).replace(".", ","),
    quantityUnit: sample.quantityUnit ?? "G",
    surfaceLabel: sample.surfaceLabel ?? "",
    surfaceAreaCm2: sample.surfaceAreaCm2 === null ? "" : String(sample.surfaceAreaCm2),
    surfaceState: sample.surfaceState ?? "",
    personName: sample.personName ?? "",
    personRole: sample.personRole ?? "",
    handsState: sample.handsState ?? "",
    airMethod: sample.airMethod ?? "",
    remarks: sample.remarks ?? "",
    unitCount: sample.unitCount,
    productTypeId: sample.productTypeId ?? "",
  };
}

/**
 * The body of `PATCH /api/samples/[id]/intake`: the fields the dialog shows
 * for this kind, nothing else — a value of another kind stays as it was. An
 * empty state, method or hands state is left out: an older sample stays
 * without one, and the API refuses to empty one that is set.
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
    ...(shown.surface
      ? {
          surfaceLabel: values.surfaceLabel,
          surfaceAreaCm2: values.surfaceAreaCm2,
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
    ...(parameterIds ? { parameterIds } : {}),
    reason,
  };
}
