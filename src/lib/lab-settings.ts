import "server-only";
import { prisma } from "./prisma";

/**
 * Workflow policy — the two decisions the client has not made yet
 * (NEEDEDINFO §4). Both behaviours exist in the code; these switches pick
 * one, so the client's answer is a click in /admin/reglages, not a
 * development.
 */

export type LabSettings = {
  /** Non-conform at reception: held unassigned (true) or analysed (false). */
  blockNonConformAtReception: boolean;
  /** Alerts leave at technical validation (true) or at admin approval (false). */
  alertAfterTechnicalValidation: boolean;
};

export const LAB_SETTINGS_DEFAULTS: LabSettings = {
  blockNonConformAtReception: false,
  alertAfterTechnicalValidation: false,
};

/** The single settings row, falling back to the defaults until it exists. */
export async function getLabSettings(): Promise<LabSettings> {
  const row = await prisma.labSettings.findUnique({
    where: { id: "lab" },
    select: {
      blockNonConformAtReception: true,
      alertAfterTechnicalValidation: true,
    },
  });
  return row ?? LAB_SETTINGS_DEFAULTS;
}
