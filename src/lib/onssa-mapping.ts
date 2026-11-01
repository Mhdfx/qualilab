import type { OnssaDomain } from "@/generated/prisma/enums";
import {
  ONSSA_GROUP_NAME_MAX,
  isOnssaColumnKey,
  proposeOnssaColumn,
  type OnssaColumnKey,
  type ParameterToMatch,
} from "./onssa-canevas";

/**
 * Lot 3E, N2 — the correspondences of the ONSSA report (RETOUR-LABO-28-10.md
 * §5): the product groups, the group of each family and type d'analyse, the
 * canevas column of each parameter. Pure checks of the /admin/onssa routes,
 * shared with the screen and the tests.
 */

const DOMAINS: readonly OnssaDomain[] = ["ALIMENTAIRE", "EAU"];
/** One save at most touches every row of the catalogue — a bound, not a limit met in use. */
export const MAX_MAPPING_CHANGES = 5_000;

export const ONSSA_MAPPING_MESSAGES = {
  nameMissing: "Donnez un nom au groupe de produits.",
  nameTooLong: `Le nom du groupe : ${ONSSA_GROUP_NAME_MAX} caractères au maximum.`,
  domainInvalid: "Choisissez le domaine du groupe (alimentaire ou eaux).",
  orderInvalid: "L'ordre doit être un nombre entier entre 0 et 999.",
  activeInvalid: "« Actif » doit être vrai ou faux.",
  nothing: "Rien à modifier.",
  invalid: "Requête invalide.",
  tooMany: `Trop de changements en une fois (${MAX_MAPPING_CHANGES} au maximum).`,
  columnInvalid: "Colonne du canevas ONSSA inconnue.",
  groupUnknown: "Ce groupe de produits n'existe pas ou est archivé.",
  duplicate: "Un groupe de produits porte déjà ce nom.",
} as const;

export type GroupInput = { name?: string; domain?: OnssaDomain; sortOrder?: number; active?: boolean };

export type GroupCheck = { ok: true; value: GroupInput } | { ok: false; error: string };

/** A group's fields; `creating` requires the name and fills the domain. */
export function validateGroupInput(raw: unknown, creating: boolean): GroupCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: ONSSA_MAPPING_MESSAGES.invalid };
  const input = raw as Record<string, unknown>;
  const value: GroupInput = {};
  if (input.name !== undefined || creating) {
    const name = typeof input.name === "string" ? input.name.trim().replace(/\s+/g, " ") : "";
    if (!name) return { ok: false, error: ONSSA_MAPPING_MESSAGES.nameMissing };
    if (name.length > ONSSA_GROUP_NAME_MAX) return { ok: false, error: ONSSA_MAPPING_MESSAGES.nameTooLong };
    value.name = name;
  }
  if (input.domain !== undefined || creating) {
    const domain = input.domain ?? "ALIMENTAIRE";
    if (!DOMAINS.includes(domain as OnssaDomain)) return { ok: false, error: ONSSA_MAPPING_MESSAGES.domainInvalid };
    value.domain = domain as OnssaDomain;
  }
  if (input.sortOrder !== undefined) {
    const order = input.sortOrder;
    if (typeof order !== "number" || !Number.isInteger(order) || order < 0 || order > 999) {
      return { ok: false, error: ONSSA_MAPPING_MESSAGES.orderInvalid };
    }
    value.sortOrder = order;
  }
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") return { ok: false, error: ONSSA_MAPPING_MESSAGES.activeInvalid };
    value.active = input.active;
  }
  if (!creating && Object.keys(value).length === 0) return { ok: false, error: ONSSA_MAPPING_MESSAGES.nothing };
  return { ok: true, value };
}

export type GroupLink = { id: string; groupId: string | null };
export type ColumnLink = { id: string; column: OnssaColumnKey | null };

export type MappingBatch = {
  productTypes: GroupLink[];
  natures: GroupLink[];
  parameters: ColumnLink[];
};

export type MappingCheck = { ok: true; value: MappingBatch } | { ok: false; error: string };

const isId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 191;

function links<T>(raw: unknown, read: (entry: Record<string, unknown>) => T | null): T[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const out: T[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const value = read(entry as Record<string, unknown>);
    if (value === null) return null;
    out.push(value);
  }
  return out;
}

/**
 * `{ productTypes?: [{ id, groupId|null }], natures?: […], parameters?: [{ id,
 * column|null }] }` — a row named twice keeps its last value.
 */
export function validateMappingBatch(raw: unknown): MappingCheck {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: ONSSA_MAPPING_MESSAGES.invalid };
  const input = raw as Record<string, unknown>;
  const readGroup = (entry: Record<string, unknown>): GroupLink | null =>
    isId(entry.id) && (entry.groupId === null || isId(entry.groupId))
      ? { id: entry.id, groupId: entry.groupId as string | null }
      : null;
  const productTypes = links(input.productTypes, readGroup);
  const natures = links(input.natures, readGroup);
  let badColumn = false;
  const parameters = links(input.parameters, (entry): ColumnLink | null => {
    if (!isId(entry.id)) return null;
    if (entry.column === null) return { id: entry.id, column: null };
    if (!isOnssaColumnKey(entry.column)) {
      badColumn = true;
      return null;
    }
    return { id: entry.id, column: entry.column };
  });
  if (badColumn) return { ok: false, error: ONSSA_MAPPING_MESSAGES.columnInvalid };
  if (!productTypes || !natures || !parameters) return { ok: false, error: ONSSA_MAPPING_MESSAGES.invalid };
  const dedupe = <T extends { id: string }>(list: T[]) => [...new Map(list.map((item) => [item.id, item])).values()];
  const value = { productTypes: dedupe(productTypes), natures: dedupe(natures), parameters: dedupe(parameters) };
  const count = value.productTypes.length + value.natures.length + value.parameters.length;
  if (count === 0) return { ok: false, error: ONSSA_MAPPING_MESSAGES.nothing };
  if (count > MAX_MAPPING_CHANGES) return { ok: false, error: ONSSA_MAPPING_MESSAGES.tooMany };
  return { ok: true, value };
}

/** The proposals for the parameters still « non déclaré » (never over a choice made). */
export function parameterProposals(
  parameters: (ParameterToMatch & { id: string; onssaColumn: string | null })[]
): ColumnLink[] {
  return parameters.flatMap((parameter) => {
    if (parameter.onssaColumn) return [];
    const column = proposeOnssaColumn(parameter);
    return column ? [{ id: parameter.id, column }] : [];
  });
}
