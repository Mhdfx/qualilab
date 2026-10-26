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
import { BILLABLE_STATUSES } from "@/lib/billing-status";
import { billedAnalysesNotice, type InvoiceFact } from "@/lib/billing";
import { CANCEL_REASON_LABELS, isExposedPlate } from "@/lib/labels";
import { resultsToReset } from "@/lib/intake-input";
import { cancellersLabel, type CorrectionRights } from "@/lib/sample-verbs";
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
  /** Its name, so « Corriger la fiche » names a family its list no longer offers. */
  productTypeName?: string | null;
  clientId: string;
  /**
   * The invoice holding it (`heldInvoices`, told through `heldInvoiceFor`):
   * issued or a draft, its number for the billing roles only (25/10);
   * null = on no invoice; absent = not read by this page (the dialogs then
   * say what holds whatever the case).
   */
  invoiced?: InvoiceFact | null;
  /** When a contamination alert left for it (ISO); null = none; absent = not read. */
  alertsSentAt?: string | null;
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

/**
 * Which fields a kind of sample shows — and sends. The famille de produits
 * on every kind (RETOUR-LABO-16-10.md F3 / F5): the water, surface, hands
 * and air families carry their own criteria since the reprise, and the
 * programme sheet gives one to any line — once the bench has started, this
 * dialog is the only place to correct it.
 */
export function correctionFields(kind: LineKind) {
  return {
    produit: kind === "ALIMENT" || kind === "EAU" || kind === "AIR" || kind === "AUTRE",
    food: kind === "ALIMENT",
    family: true,
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

/** Both halves of the fiche — the administrator's, or the reception's before the programme. */
export const FULL_CORRECTION: CorrectionRights = { identification: true, analyses: true };

/**
 * The body of `PATCH /api/samples/[id]/intake`: the fields the dialog shows
 * for this kind, nothing else — a value of another kind stays as it was.
 * Only the halves this person may change are sent (16/10, Q128 —
 * `correctionRights`): the identification fields, and/or the analyses' —
 * the list, the product type (any kind of line), the number of units. An
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
  reason: string,
  scope: CorrectionRights = FULL_CORRECTION
): Record<string, unknown> {
  const shown = correctionFields(kind);
  const analyses = scope.analyses
    ? {
        unitCount: values.unitCount,
        ...(shown.family ? { productTypeId: values.productTypeId } : {}),
        ...(parameterIds ? { parameterIds } : {}),
      }
    : {};
  if (!scope.identification) return { ...analyses, reason };
  return {
    lieu: values.lieu,
    remarks: values.remarks,
    ...analyses,
    ...(shown.produit ? { produit: values.produit } : {}),
    ...(shown.food
      ? {
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
    reason,
  };
}

/**
 * What « Annuler » says the cancellation does (16/10, Q13 — the validation
 * desks cancel billable work since D1): the sample leaves the queues and the
 * report; the billing only when no invoice holds it yet — a billed line
 * stays on its invoice, for the accountant to credit (« Échantillon annulé
 * après facturation »); and a contamination alert already sent stays with
 * the client, who will get no report for it. Before the programme nothing is
 * billable. A page that did not read the invoice says what happens if one
 * holds it. The invoice's number only for the billing roles (25/10): an
 * issued invoice told without it keeps the warning.
 */
export function cancelConsequences(
  sample: Pick<VerbSample, "status" | "invoiced" | "alertsSentAt">
): { text: string; warnings: string[] } {
  const billable = BILLABLE_STATUSES.includes(sample.status);
  const warnings: string[] = [];
  let text = "L'échantillon sort de toutes les files, du rapport et de la facturation.";
  if (billable && sample.invoiced === undefined) {
    text = "L'échantillon sort de toutes les files et du rapport ; s'il est déjà facturé, sa ligne reste sur la facture et la comptabilité établit un avoir.";
  } else if (billable && sample.invoiced) {
    text = "L'échantillon sort de toutes les files et du rapport.";
    const { issued, number } = sample.invoiced;
    warnings.push(
      !issued
        ? "Il est sur un brouillon de facture : la comptabilité retirera sa ligne avant l'émission."
        : number === null
          ? "Déjà facturé : la comptabilité établira un avoir."
          : `Déjà facturé (${number}) : sa ligne reste sur la facture, la comptabilité établira un avoir.`
    );
  }
  if (sample.alertsSentAt) {
    warnings.push("Une alerte de contamination est déjà partie chez le client : il ne recevra pas de rapport pour cet échantillon.");
  }
  return { text, warnings };
}

/**
 * The warning « Corriger les analyses » shows while an invoice holds the
 * sample and the list on screen differs from it: the invoice keeps billing
 * the former list (`billedAnalysesNotice`, the route says it again).
 */
export function billedCorrectionWarning(
  sample: Pick<VerbSample, "invoiced" | "parameterIds">,
  parameterIds: readonly string[]
): string | null {
  if (!sample.invoiced) return null;
  const same = parameterIds.length === sample.parameterIds.length && parameterIds.every((id) => sample.parameterIds.includes(id));
  return same ? null : billedAnalysesNotice(sample.invoiced);
}

/** What the dialog says under the analyses: an information, or a warning. */
export type AnalysesNotice = { tone: "info" | "warning"; text: string };

/**
 * What the analyses on screen will do to the results already typed (16/10,
 * Q91 — `resultsToReset`, the rule the intake route applies): nothing before
 * the bench (no result yet); at the bench, a withdrawal deletes the
 * withdrawn analyses' readings only, while an added analysis or another
 * product type or number of units empties every result. Every analysis
 * unticked is refused: an analysis nobody can do is withdrawn, a sample
 * nobody can analyse is cancelled. (A line still without any — the
 * programme decides them — stays correctable without one.)
 */
export function analysesNotice(
  sample: Pick<VerbSample, "status" | "parameterIds" | "productTypeId" | "unitCount">,
  parameterIds: readonly string[],
  values: Pick<CorrectionValues, "productTypeId" | "unitCount">
): AnalysesNotice | null {
  if (parameterIds.length === 0 && sample.parameterIds.length > 0) {
    // Who cancels depends on the step (16/10, Q13): the réception before the
    // programme, the validation desks from it — the state machine's answer.
    const cancellers = cancellersLabel(sample.status);
    return {
      tone: "warning",
      text: `Gardez au moins une analyse. Si aucune ne peut être faite, l'échantillon s'annule${cancellers ? ` (par ${cancellers})` : ""}.`,
    };
  }
  const validating = sample.status === "RESULTATS_SAISIS";
  if (sample.status !== "EN_ANALYSE" && !validating) return null;
  const unchanged =
    parameterIds.length === sample.parameterIds.length && parameterIds.every((id) => sample.parameterIds.includes(id));
  const criteriaChanged = (values.productTypeId || null) !== sample.productTypeId || values.unitCount !== sample.unitCount;
  const reset = resultsToReset(sample.parameterIds, unchanged ? null : [...parameterIds], criteriaChanged);
  if (reset.kind === "all") {
    return {
      tone: "warning",
      text: `Ajouter une analyse, changer la famille de produits ou le nombre d'unités efface tous les résultats déjà saisis${
        validating ? " et renvoie l'échantillon à la paillasse" : ""
      }.`,
    };
  }
  if (reset.kind === "removed") {
    return {
      tone: "info",
      text: `Seuls les résultats ${reset.parameterIds.length > 1 ? "des analyses retirées" : "de l'analyse retirée"} sont effacés ; les autres sont gardés et l'échantillon reste à son étape${
        validating ? " (une validation technique déjà donnée est à refaire)" : ""
      }.`,
    };
  }
  return {
    tone: "info",
    text: "Retirer une analyse n'efface que ses résultats. Ajouter une analyse, changer la famille de produits ou le nombre d'unités efface tous les résultats déjà saisis.",
  };
}
