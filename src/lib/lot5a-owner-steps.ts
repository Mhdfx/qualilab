import { toleranceApplies } from "./criteria-input";
import type { WithholdingBaseCode, WithholdingScopeCode } from "./withholding";

/**
 * The owner's steps of lot 5A (RETOUR-LABO-20-11.md §5 « gestes du
 * propriétaire »), planned here — pure and tested — and written by
 * `scripts/lot5a-owner-steps.mts` THROUGH THE APP'S OWN ADMIN ROUTES, each
 * journalled by its route with before / after:
 *
 * - S13 (C-3): the retenue à la source — base TVA, 75 % with a valid
 *   attestation, 100 % without, scope « fournisseurs soumis » (the suppliers
 *   are named case by case: « soumis à la retenue » is ticked on each
 *   supplier's fiche, none by this script); the attestation's validity stays
 *   as it is until D-3 answers (4 or 6 months); a warning, never a block
 *   (`PAYMENT_REQUIRES_TAX_CERTIFICATE` untouched) — `PUT /api/stock/settings`;
 * - S14 (C-8 (d)): « Escherichia coli » an alias of the water's « E. coli »,
 *   « Coliformes à 36 °C » an alias of the water's « Coliformes totaux » —
 *   `PATCH /api/parameters/[id]` (`aliases`, nothing else) — then « Importer
 *   les prix clients » again: analysis first, then the import (idempotent:
 *   only the new prices are written) — `POST /api/admin/import/prix-clients`;
 * - S15 (Q133): n = 1 on the criteria of the sensory family taken over from
 *   the old software (« PRODUIT ALIMENTAIRE », type d'analyse « Analyse
 *   sensorielle », n = 5) — `PUT /api/product-types/[id]/criteria`, the
 *   whole grid sent back with only n changed.
 */

// ─── S13 ─────────────────────────────────────────────────────────────────────

/** The settings as `GET /api/stock/settings` answers them (`AchatSettings`, achat-settings.ts). */
export type AchatSettingsRead = {
  expiryWarningDays: number;
  defaultVatRate: number;
  withholding: {
    scope: WithholdingScopeCode;
    base: WithholdingBaseCode;
    rateWithCertificate: number | null;
    rateWithoutCertificate: number | null;
    certificateValidityMonths: number;
  };
};

/** The settings as the PUT validates them (`validateAchatSettings`), from what the GET answered. */
export function achatSettingsView(read: AchatSettingsRead): AchatSettingsView {
  return {
    expiryWarningDays: read.expiryWarningDays,
    defaultVatRate: Number(read.defaultVatRate),
    withholdingScope: read.withholding.scope,
    withholdingBase: read.withholding.base,
    withholdingRateWithCertificate: read.withholding.rateWithCertificate === null ? null : Number(read.withholding.rateWithCertificate),
    withholdingRateWithoutCertificate:
      read.withholding.rateWithoutCertificate === null ? null : Number(read.withholding.rateWithoutCertificate),
    taxCertificateValidityMonths: read.withholding.certificateValidityMonths,
  };
}

/** The settings with the field names of the PUT. */
export type AchatSettingsView = {
  expiryWarningDays: number;
  defaultVatRate: number;
  withholdingScope: WithholdingScopeCode;
  withholdingBase: WithholdingBaseCode;
  withholdingRateWithCertificate: number | null;
  withholdingRateWithoutCertificate: number | null;
  taxCertificateValidityMonths: number;
};

/** C-3 of 20/11: « Avec attestation : 75 % de la TVA · Sans attestation : 100 % de la TVA », au cas par cas. */
export const S13_TARGET = {
  withholdingScope: "FOURNISSEURS_SOUMIS",
  withholdingBase: "TVA",
  withholdingRateWithCertificate: 75,
  withholdingRateWithoutCertificate: 100,
} as const satisfies Partial<AchatSettingsView>;

export type FieldChange = { field: string; before: unknown; after: unknown };

/**
 * The PUT body of S13 — every field the route validates, the others as they
 * are (the attestation's validity included: D-3) — and what changes.
 */
export function s13Plan(current: AchatSettingsView): { body: AchatSettingsView; changes: FieldChange[] } {
  const body: AchatSettingsView = {
    expiryWarningDays: current.expiryWarningDays,
    defaultVatRate: Number(current.defaultVatRate),
    withholdingScope: S13_TARGET.withholdingScope,
    withholdingBase: S13_TARGET.withholdingBase,
    withholdingRateWithCertificate: S13_TARGET.withholdingRateWithCertificate,
    withholdingRateWithoutCertificate: S13_TARGET.withholdingRateWithoutCertificate,
    taxCertificateValidityMonths: current.taxCertificateValidityMonths,
  };
  const changes = (Object.keys(S13_TARGET) as (keyof typeof S13_TARGET)[]).flatMap((field): FieldChange[] => {
    const before = current[field];
    return before === S13_TARGET[field] ? [] : [{ field, before, after: S13_TARGET[field] }];
  });
  return { body, changes };
}

// ─── S14 ─────────────────────────────────────────────────────────────────────

/** A parameter as `GET /api/parameters` lists it (the fields S14 reads). */
export type ParameterView = { id: string; name: string; category: string; aliases: string | null };

/** C-8 (d) of 20/11, for the water (category EAU). */
export const S14_ALIASES = [
  { category: "EAU", name: "E. coli", alias: "Escherichia coli" },
  { category: "EAU", name: "Coliformes totaux", alias: "Coliformes à 36 °C" },
] as const;

export type AliasStep =
  | { kind: "add"; id: string; name: string; category: string; alias: string; aliases: string }
  | { kind: "present"; id: string; name: string; category: string; alias: string }
  | { kind: "missing"; name: string; category: string; alias: string; found: number };

/** Lower case, no accent, spaces collapsed — how two spellings of one alias are compared. */
function key(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").replace(/\s+/g, " ").trim().toLocaleLowerCase("fr");
}

/**
 * Each alias of S14: added to the one parameter of that name and category
 * (the aliases it has kept, the new one last), already there, or not found —
 * none or several parameters of that name: nothing is written, the owner
 * looks (`found` says how many).
 */
export function s14AliasPlan(parameters: readonly ParameterView[]): AliasStep[] {
  return S14_ALIASES.map((target): AliasStep => {
    const matches = parameters.filter((p) => p.category === target.category && key(p.name) === key(target.name));
    if (matches.length !== 1) return { kind: "missing", ...target, found: matches.length };
    const parameter = matches[0];
    const lines = (parameter.aliases ?? "").split("\n").map((line) => line.trim()).filter(Boolean);
    const base = { id: parameter.id, name: parameter.name, category: parameter.category, alias: target.alias };
    if (lines.some((line) => key(line) === key(target.alias))) return { kind: "present", ...base };
    return { kind: "add", ...base, aliases: [...lines, target.alias].join("\n") };
  });
}

// ─── S15 ─────────────────────────────────────────────────────────────────────

/** A criterion row as `GET /api/product-types/[id]` answers it. */
export type CriterionView = {
  id: string;
  parameterId: string;
  normVersionId: string | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: "VALUE" | "ABSENCE" | "UNSPECIFIED";
  m: number | null;
  bigM: number | null;
  active: boolean;
  parameter?: { name: string } | null;
};

/** Q133 of 20/11: « Oui, d'accord : 1 unité » — the sensory analysis reads one unit. */
export const S15_N = 1;

/**
 * The grid of S15: every row of the family sent back (the PUT deletes a row
 * left out), the active ones at n = 1; a c the import left where it means
 * nothing is cleared, as the grid's own save tidies it (`criterionChange`).
 * `changed` lists the rows whose n moves.
 */
export function s15GridPlan(criteria: readonly CriterionView[]): {
  rows: Omit<CriterionView, "parameter">[];
  changed: { id: string; name: string; before: number }[];
} {
  const changed: { id: string; name: string; before: number }[] = [];
  const rows = criteria.map((criterion) => {
    const n = criterion.active ? S15_N : criterion.n;
    if (n !== criterion.n) changed.push({ id: criterion.id, name: criterion.parameter?.name ?? criterion.parameterId, before: criterion.n });
    const c = criterion.c !== null && toleranceApplies(criterion.mKind, criterion.m !== null, criterion.bigM !== null) ? criterion.c : null;
    return {
      id: criterion.id,
      parameterId: criterion.parameterId,
      normVersionId: criterion.normVersionId,
      unit: criterion.unit,
      n,
      c,
      mKind: criterion.mKind,
      m: criterion.m,
      bigM: criterion.bigM,
      active: criterion.active,
    };
  });
  return { rows, changed };
}

/** The sensory family of the old software S15 is about — by its name and its type d'analyse. */
export const S15_FAMILY = { name: "PRODUIT ALIMENTAIRE", nature: "Analyse sensorielle" } as const;

/** The one family of that name under that type d'analyse; null when none or several. */
export function s15Family<T extends { id: string; name: string; natureId: string | null }>(
  families: readonly T[],
  sensoryNatureIds: ReadonlySet<string>
): T | null {
  const matches = families.filter(
    (family) => key(family.name) === key(S15_FAMILY.name) && family.natureId !== null && sensoryNatureIds.has(family.natureId)
  );
  return matches.length === 1 ? matches[0] : null;
}

/** Whether a type d'analyse is the sensory one, however its label is spelled. */
export function isSensoryNature(label: string): boolean {
  return key(label) === key(S15_FAMILY.nature);
}
