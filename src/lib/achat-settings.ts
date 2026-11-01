import "server-only";
import { prisma } from "./prisma";
import { toMoney } from "./money";
import { DEFAULT_EXPIRY_WARNING_DAYS } from "./stock";
import type { WithholdingBaseCode, WithholdingScopeCode, WithholdingSettings } from "./withholding";

/**
 * The Achat & Stock settings (lot 3D, `AchatStockSettings`, one row « magasin »):
 * the expiry window (M4), the default VAT rate (M1) and the retenue à la
 * source (M7). Edited by the administrator on /magasin/reglages (journalled);
 * read by the magasin's pages and routes. A missing row reads as the
 * defaults — and the defaults withhold nothing (no rate in the code, R-24).
 */

export type AchatSettings = {
  expiryWarningDays: number;
  defaultVatRate: number;
  withholding: WithholdingSettings;
};

export const ACHAT_SETTINGS_ID = "magasin";

export const ACHAT_SETTINGS_DEFAULTS: AchatSettings = {
  expiryWarningDays: DEFAULT_EXPIRY_WARNING_DAYS,
  defaultVatRate: 20,
  withholding: {
    scope: "AUCUN",
    base: "TVA",
    rateWithCertificate: null,
    rateWithoutCertificate: null,
    certificateValidityMonths: 3,
  },
};

type Row = {
  expiryWarningDays: number;
  defaultVatRate: unknown;
  withholdingScope: WithholdingScopeCode;
  withholdingBase: WithholdingBaseCode;
  withholdingRateWithCertificate: unknown;
  withholdingRateWithoutCertificate: unknown;
  taxCertificateValidityMonths: number;
};

const rate = (value: unknown): number | null =>
  value === null || value === undefined ? null : toMoney(value as string);

/** A stored row as the plain settings the screens and rules read. */
export function achatSettingsOf(row: Row | null): AchatSettings {
  if (!row) return ACHAT_SETTINGS_DEFAULTS;
  return {
    expiryWarningDays: row.expiryWarningDays,
    defaultVatRate: toMoney(row.defaultVatRate as string),
    withholding: {
      scope: row.withholdingScope,
      base: row.withholdingBase,
      rateWithCertificate: rate(row.withholdingRateWithCertificate),
      rateWithoutCertificate: rate(row.withholdingRateWithoutCertificate),
      certificateValidityMonths: row.taxCertificateValidityMonths,
    },
  };
}

export async function loadAchatSettings(): Promise<AchatSettings> {
  const row = await prisma.achatStockSettings.findUnique({ where: { id: ACHAT_SETTINGS_ID } });
  return achatSettingsOf(row);
}
