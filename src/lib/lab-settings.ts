import "server-only";
import { prisma } from "./prisma";
import { DEFAULT_THRESHOLDS, type ReceptionThresholds } from "./reception-rules";

/**
 * Workflow policy — the decisions the client has not made yet (NEEDEDINFO
 * §4) and, since Phase 9, the acceptance thresholds of the bon de réception.
 * Both behaviours of each switch exist in the code; these settings pick one,
 * so the client's answer is a click in /admin/reglages, not a development.
 */

export type LabSettings = ReceptionThresholds & {
  /** Non-conform at reception: held unassigned (true) or analysed (false). */
  blockNonConformAtReception: boolean;
  /** Alerts leave at technical validation (true) or at admin approval (false). */
  alertAfterTechnicalValidation: boolean;
};

export const LAB_SETTINGS_DEFAULTS: LabSettings = {
  ...DEFAULT_THRESHOLDS,
  blockNonConformAtReception: false,
  alertAfterTechnicalValidation: false,
};

export const LAB_SETTINGS_SELECT = {
  blockNonConformAtReception: true,
  alertAfterTechnicalValidation: true,
  minFoodMicroG: true,
  minFoodChemG: true,
  minWaterMicroL: true,
  minWaterSalmonellaL: true,
  minWaterChemL: true,
  histamineUnits: true,
  histamineUnitG: true,
  temperatureRequiredKinds: true,
  coldChainMaxC: true,
} as const;

/** The single settings row, falling back to the defaults until it exists. */
export async function getLabSettings(): Promise<LabSettings> {
  const row = await prisma.labSettings.findUnique({
    where: { id: "lab" },
    select: LAB_SETTINGS_SELECT,
  });
  return row ?? LAB_SETTINGS_DEFAULTS;
}
