import type { Role } from "./roles";

/**
 * What each audience is allowed to see of a sample.
 *
 * The blind-analysis rule means the préleveur must never be able to link a
 * sample to the number the laboratory works with. Enforcing that by hiding
 * fields in the UI would be worthless — the values would still travel in the
 * API response. So the restriction lives here, in the query itself: the
 * préleveur's payload simply has no `controlCode`.
 *
 * Use `sampleSelectFor(session.role)` wherever samples are read.
 */

/** Fields every audience may see — the line as it was written on site. */
const COMMON = {
  id: true,
  code: true,
  lineNumber: true,
  lineKind: true,
  lieu: true,
  produit: true,
  numeroLot: true,
  productionDate: true,
  expiryDate: true,
  quantity: true,
  quantityUnit: true,
  productTemperature: true,
  ambientTemperature: true,
  surfaceLabel: true,
  surfaceAreaCm2: true,
  personName: true,
  personRole: true,
  handsState: true,
  remarks: true,
  unitCount: true,
  type: true,
  status: true,
  notes: true,
  sampledAt: true,
  createdAt: true,
  cancelledAt: true,
  cancelReason: true,
  client: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
  nature: { select: { id: true, code: true, label: true, family: true } },
  productType: { select: { id: true, name: true } },
  serie: {
    select: {
      id: true,
      kind: true,
      serialNumber: true,
      site: { select: { id: true, name: true } },
      startedAt: true,
    },
  },
  parameters: {
    select: { parameter: { select: { id: true, name: true, unit: true } } },
  },
} as const;

/** Préleveur view — field data only, no laboratory numbering. */
export const SAMPLE_FIELD_SELECT = COMMON;

/** Laboratory view — the full workflow, numbering included. */
export const SAMPLE_LAB_SELECT = {
  ...COMMON,
  controlCode: true,
  /** Legacy blind serial of rows created before Phase 9; null since. */
  serialNumber: true,
  receivedAt: true,
  receivedBy: { select: { id: true, name: true } },
  receptionTemperature: true,
  conformity: true,
  conformityReason: true,
  conformityNote: true,
  assignedAt: true,
  technician: { select: { id: true, name: true } },
  validatedAt: true,
  rejectionReason: true,
} as const;

export function sampleSelectFor(role: Role) {
  return role === "PRELEVEUR" ? SAMPLE_FIELD_SELECT : SAMPLE_LAB_SELECT;
}

/**
 * The laboratory's identifier of a sample, for lists and documents: the
 * N° de contrôle once received, the série line before that. Old rows keep
 * whatever they carry.
 */
export function labReference(sample: {
  controlCode?: string | null;
  code: string;
}) {
  return sample.controlCode ?? sample.code;
}
