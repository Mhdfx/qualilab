import type { Role } from "./roles";

/**
 * What each audience is allowed to see of a sample.
 *
 * The blind-analysis rule means the préleveur must never be able to link a
 * sample to the number the laboratory works with. Enforcing that by hiding
 * fields in the UI would be worthless — the values would still travel in the
 * API response. So the restriction lives here, in the query itself: the
 * préleveur's payload simply has no `controlCode` and no `serialNumber`.
 *
 * Use `sampleSelectFor(session.role)` wherever samples are read.
 */

/** Fields every audience may see. */
const COMMON = {
  id: true,
  code: true,
  lieu: true,
  type: true,
  status: true,
  notes: true,
  sampledAt: true,
  createdAt: true,
  client: { select: { id: true, name: true } },
  user: { select: { id: true, name: true } },
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
  serialNumber: true,
  receivedAt: true,
  receivedBy: { select: { id: true, name: true } },
  conformity: true,
  conformityNote: true,
  assignedAt: true,
  technician: { select: { id: true, name: true } },
  validatedAt: true,
  rejectionReason: true,
} as const;

export function sampleSelectFor(role: Role) {
  return role === "PRELEVEUR" ? SAMPLE_FIELD_SELECT : SAMPLE_LAB_SELECT;
}
