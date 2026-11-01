import { ONSSA_OFFICIAL_CONTROL } from "./lab-proposals";

/**
 * Lot 3E, N1 (RETOUR-LABO-28-10.md §3.2, O-6): « contrôle officiel » or
 * autocontrôle, the sampling body, the establishment and the origin of a
 * série — separate from its commercial cadre, read by the ONSSA monthly
 * report only, printed nowhere. Pure: the creation (`validateSerie`), the
 * correction (`PATCH /api/series/[id]`), the screens and the tests share it.
 *
 * Rules (hypothèses, à confirmer par R-22):
 * - unticked by default (an autocontrôle), as every série entered before;
 * - an official control names its « DR ONSSA / Organisme préleveur agréé »
 *   (required); the establishment is optional — the report then names the
 *   client and its site;
 * - the origin is optional, for both (« Non précisée » in the report);
 * - an autocontrôle keeps neither the body nor the establishment.
 */

export const ONSSA_TEXT_MAX = 191;

export type OnssaControl = {
  controleOfficiel: boolean;
  organismePreleveur: string | null;
  etablissement: string | null;
  origine: string | null;
};

export const NO_ONSSA_CONTROL: OnssaControl = {
  controleOfficiel: false,
  organismePreleveur: null,
  etablissement: null,
  origine: null,
};

export const ONSSA_CONTROL_MESSAGES = {
  bodyMissing: "Contrôle officiel : indiquez la DR ONSSA ou l'organisme préleveur agréé.",
  invalidFlag: "« Contrôle officiel » doit être coché ou décoché.",
  tooLong: (label: string) => `${label} : ${ONSSA_TEXT_MAX} caractères au maximum.`,
  notText: (label: string) => `${label} : texte attendu.`,
} as const;

/** The origins the screens suggest (free text all the same). */
export const ONSSA_ORIGIN_SUGGESTIONS = ["Local", "Importé", "Destiné à l'export"] as const;

const LABELS = {
  organismePreleveur: "L'organisme préleveur",
  etablissement: "L'établissement",
  origine: "L'origine",
} as const;

type TextKey = keyof typeof LABELS;

export type OnssaControlResult = { ok: true; value: OnssaControl } | { ok: false; error: string };

function readText(value: unknown, key: TextKey): string | null | { error: string } {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return { error: ONSSA_CONTROL_MESSAGES.notText(LABELS[key]) };
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length > ONSSA_TEXT_MAX) return { error: ONSSA_CONTROL_MESSAGES.tooLong(LABELS[key]) };
  return trimmed || null;
}

/** Applies the rules to a whole state (an autocontrôle drops the body and the establishment). */
function settle(state: OnssaControl): OnssaControlResult {
  if (!state.controleOfficiel) {
    return { ok: true, value: { ...state, organismePreleveur: null, etablissement: null } };
  }
  if (!state.organismePreleveur) return { ok: false, error: ONSSA_CONTROL_MESSAGES.bodyMissing };
  return { ok: true, value: state };
}

/**
 * The four fields of a new série from its request body. Absent fields read
 * as an autocontrôle with no origin (a page opened before the fields).
 * With the switch off (`ONSSA_OFFICIAL_CONTROL`), always the autocontrôle.
 */
export function readOnssaControl(
  input: Record<string, unknown>,
  enabled: boolean = ONSSA_OFFICIAL_CONTROL
): OnssaControlResult {
  if (!enabled) return { ok: true, value: NO_ONSSA_CONTROL };
  const flag = input.controleOfficiel;
  if (flag !== undefined && flag !== null && typeof flag !== "boolean") {
    return { ok: false, error: ONSSA_CONTROL_MESSAGES.invalidFlag };
  }
  const state: OnssaControl = { ...NO_ONSSA_CONTROL, controleOfficiel: flag === true };
  for (const key of Object.keys(LABELS) as TextKey[]) {
    const value = readText(input[key], key);
    if (value && typeof value === "object") return { ok: false, error: value.error };
    state[key] = value;
  }
  return settle(state);
}

export type OnssaControlPatch =
  | { ok: true; changed: false }
  | { ok: true; changed: true; value: OnssaControl; fields: (keyof OnssaControl)[] }
  | { ok: false; error: string };

/**
 * A correction of a stored série: only the fields the request sends change
 * (`undefined` = kept); the result is settled as a whole, so ticking the
 * box without a body is refused and unticking it clears the body and the
 * establishment. With the switch off, nothing is ever changed.
 */
export function patchOnssaControl(
  current: OnssaControl,
  input: Record<string, unknown>,
  enabled: boolean = ONSSA_OFFICIAL_CONTROL
): OnssaControlPatch {
  if (!enabled) return { ok: true, changed: false };
  const sent = (["controleOfficiel", ...Object.keys(LABELS)] as (keyof OnssaControl)[]).some(
    (key) => input[key] !== undefined
  );
  if (!sent) return { ok: true, changed: false };
  const next: OnssaControl = { ...current };
  if (input.controleOfficiel !== undefined) {
    if (typeof input.controleOfficiel !== "boolean") return { ok: false, error: ONSSA_CONTROL_MESSAGES.invalidFlag };
    next.controleOfficiel = input.controleOfficiel;
  }
  for (const key of Object.keys(LABELS) as TextKey[]) {
    if (input[key] === undefined) continue;
    const value = readText(input[key], key);
    if (value && typeof value === "object") return { ok: false, error: value.error };
    next[key] = value;
  }
  const settled = settle(next);
  if (!settled.ok) return settled;
  const fields = (Object.keys(current) as (keyof OnssaControl)[]).filter(
    (key) => settled.value[key] !== current[key]
  );
  return fields.length === 0 ? { ok: true, changed: false } : { ok: true, changed: true, value: settled.value, fields };
}

/** « Contrôle officiel — DR ONSSA Rabat » / « Autocontrôle », for the journal and the screens. */
export function formatOnssaControl(state: OnssaControl): string {
  if (!state.controleOfficiel) return state.origine ? `Autocontrôle — origine : ${state.origine}` : "Autocontrôle";
  const parts = [state.organismePreleveur, state.etablissement, state.origine ? `origine : ${state.origine}` : null];
  return `Contrôle officiel — ${parts.filter(Boolean).join(" · ")}`;
}

// ---- The screens' draft (visit, deposit, reception, préleveur's visit) ------

/** What the form holds: the texts as typed. */
export type OnssaDraft = {
  controleOfficiel: boolean;
  organismePreleveur: string;
  etablissement: string;
  origine: string;
};

export const EMPTY_ONSSA_DRAFT: OnssaDraft = {
  controleOfficiel: false,
  organismePreleveur: "",
  etablissement: "",
  origine: "",
};

/** A stored série's fields → the form's draft. */
export function onssaDraftOf(state: Partial<OnssaControl> | null | undefined): OnssaDraft {
  return {
    controleOfficiel: state?.controleOfficiel === true,
    organismePreleveur: state?.organismePreleveur ?? "",
    etablissement: state?.etablissement ?? "",
    origine: state?.origine ?? "",
  };
}

/** The four fields of the request body; an autocontrôle sends no body nor establishment. */
export function onssaPayload(draft: OnssaDraft): OnssaControl {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ") || null;
  return {
    controleOfficiel: draft.controleOfficiel,
    organismePreleveur: draft.controleOfficiel ? clean(draft.organismePreleveur) : null,
    etablissement: draft.controleOfficiel ? clean(draft.etablissement) : null,
    origine: clean(draft.origine),
  };
}

/** The screens' check before sending — the server's rules (`readOnssaControl`). */
export function onssaDraftError(draft: OnssaDraft): string | null {
  const checked = readOnssaControl({ ...onssaPayload(draft) }, true);
  return checked.ok ? null : checked.error;
}
