import type { LimitKind } from "@/generated/prisma/enums";
import type { Plan } from "./interpretation";

/**
 * The old software's catalogue, read from the CSV files that
 * `scripts/legacy/extract-legacy.py` writes (RETOUR-LABO-30-09.md, slice J)
 * — pure: parsing and the derivation of each criterion's plan. The route
 * matches against the database and writes.
 *
 * What the old base holds (TYPENOURITURE_PARAMS × INTERVAL_PETITM):
 *   TYPE_PM        1 absent · 2 non spécifiée · 3 spécifiée · 4 (rare)
 *   TYPE_RESULTAT  11 quantitatif · 12 qualitatif
 *   CLASS          3 = three-class plan, else two-class
 *   NBR            n (null on most rows — the units are the sample's)
 *   CONTROL        c
 *   intervals      one line per class: conclusion 2 (satisfaisant) up to m,
 *                  1 (acceptable) up to M, 0 (non satisfaisant) beyond;
 *                  value = MAXVAL × 10^EXP_MAX
 */

export type LegacyRegulation = { legacyId: number; title: string; text: string; active: boolean };

export type LegacyType = {
  legacyId: number;
  name: string;
  group: string;
  description: string;
  regulationLegacyId: number | null;
  obsolete: boolean;
  visible: boolean;
  lastUse: Date | null;
  /** Q39 default: still used since 2025, not obsolete, visible. */
  active: boolean;
};

export type LegacyCriterion = {
  legacyId: number;
  typeLegacyId: number;
  parameterName: string;
  norm: string;
  unit: string | null;
  plan: Plan | null;
  /** Why no plan could be derived (the row is listed, not imported). */
  reason: string | null;
};

export const USED_SINCE = new Date("2025-01-01T00:00:00");

type Row = Record<string, string>;

/** Rows as objects keyed by the header, headers compared case-insensitively. */
export function rowsByHeader(rows: string[][], required: string[]): { rows: Row[]; error: string | null } {
  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const missing = required.filter((r) => !header.includes(r.toLowerCase()));
  if (missing.length > 0) return { rows: [], error: `Colonnes manquantes : ${missing.join(", ")}.` };
  const out = rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const o: Row = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? "").trim()));
    return o;
  });
  return { rows: out, error: null };
}

const int = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) ? n : null;
};
const num = (v: string | undefined): number | null => {
  if (v === undefined || v === "") return null;
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/** A short name for the picker, cut from the regulation's text. */
export function regulationTitle(text: string, fallback: string): string {
  // The old base often starts a text with « - » or « • ».
  const flat = text.replace(/\s+/g, " ").replace(/^[\s\-–—•·]+/, "").trim();
  if (!flat) return fallback.trim();
  const cut = flat.split(/\s[:(–—-]\s|:\s|\s\(/)[0].replace(/[\s.;,]+$/, "");
  const title = cut.length >= 8 ? cut : flat;
  return title.length > 100 ? `${title.slice(0, 97).trimEnd()}…` : title;
}

export function parseLegacyRegulations(rows: string[][]): { items: LegacyRegulation[]; skipped: number; error: string | null } {
  const { rows: data, error } = rowsByHeader(rows, ["id", "titre", "texte", "obsolete"]);
  if (error) return { items: [], skipped: 0, error };
  const items: LegacyRegulation[] = [];
  let skipped = 0;
  for (const r of data) {
    const legacyId = int(r.id);
    const text = r.texte.replace(/\s+/g, " ").replace(/^[\s\-–—•·]+/, "").trim();
    if (legacyId === null || !text) {
      skipped += 1;
      continue;
    }
    items.push({ legacyId, title: regulationTitle(text, r.titre), text, active: int(r.obsolete) !== 1 });
  }
  return { items, skipped, error: null };
}

export function parseLegacyTypes(rows: string[][], now = new Date()): { items: LegacyType[]; error: string | null } {
  const { rows: data, error } = rowsByHeader(rows, ["id", "nom", "id_critere", "obsolete", "visible", "derniere_utilisation"]);
  if (error) return { items: [], error };
  void now;
  const items: LegacyType[] = [];
  for (const r of data) {
    const legacyId = int(r.id);
    const name = r.nom.replace(/\s+/g, " ").trim();
    if (legacyId === null || !name) continue;
    const lastUse = r.derniere_utilisation ? new Date(r.derniere_utilisation.slice(0, 10)) : null;
    const obsolete = int(r.obsolete) !== 0;
    const visible = int(r.visible) !== 0;
    items.push({
      legacyId,
      name,
      group: r.groupe ?? "",
      description: r.famille ?? "",
      regulationLegacyId: int(r.id_critere),
      obsolete,
      visible,
      lastUse: lastUse && !Number.isNaN(lastUse.getTime()) ? lastUse : null,
      active: !obsolete && visible && lastUse !== null && lastUse >= USED_SINCE,
    });
  }
  return { items, error: null };
}

/** MAXVAL × 10^EXP_MAX of an interval line, or null. */
function bound(r: Row, line: number): number | null {
  const max = num(r[`l${line}_max`]);
  if (max === null) return null;
  const exp = int(r[`l${line}_exp_max`]) ?? 0;
  return Math.round(max * 10 ** exp * 1e6) / 1e6;
}

/** The plan of one legacy criterion, or the reason there is none. */
export function derivePlan(r: Row): { plan: Plan | null; reason: string | null } {
  if (int(r.obsolete) === 1) return { plan: null, reason: "obsolète" };
  const typePm = int(r.type_pm);
  const qualitative = int(r.type_resultat) === 12;
  const nbr = int(r.nbr);
  const n = nbr !== null && nbr > 0 ? nbr : 1;
  const c = int(r.control);
  const base = { n, c };

  if (typePm === 1) return { plan: { ...base, mKind: "ABSENCE" as LimitKind, m: null, bigM: null }, reason: null };

  // The limit of each class, read from the interval lines.
  let m: number | null = null;
  let bigM: number | null = null;
  for (const line of [1, 2, 3]) {
    const concl = int(r[`l${line}_concl`]);
    const value = bound(r, line);
    if (value === null) continue;
    if (concl === 2 && m === null) m = value;
    else if (concl === 1 && bigM === null) bigM = value;
  }
  if (m === null && bigM === null) {
    const value = num(r.valeur_pm);
    if (value !== null) m = Math.round(value * 10 ** (int(r.exp_pm) ?? 0) * 1e6) / 1e6;
  }

  if (qualitative || typePm === 2) {
    // « Non spécifiée »: at most one limit, above which the result fails.
    const limit = m ?? bigM;
    return { plan: { ...base, mKind: "UNSPECIFIED", m: null, bigM: limit }, reason: null };
  }
  if (m === null && bigM === null) return { plan: null, reason: "aucune limite" };
  if (m === null) return { plan: { ...base, mKind: "UNSPECIFIED", m: null, bigM }, reason: null };
  return { plan: { ...base, mKind: "VALUE", m, bigM: bigM !== null && bigM > m ? bigM : bigM === m ? m : null }, reason: null };
}

export function parseLegacyCriteria(rows: string[][]): { items: LegacyCriterion[]; error: string | null } {
  const { rows: data, error } = rowsByHeader(rows, ["id", "id_type", "parametre", "norme", "unite", "type_pm", "type_resultat", "nbr", "control", "obsolete"]);
  if (error) return { items: [], error };
  const items: LegacyCriterion[] = [];
  for (const r of data) {
    const legacyId = int(r.id);
    const typeLegacyId = int(r.id_type);
    if (legacyId === null || typeLegacyId === null) continue;
    const parameterName = r.parametre.replace(/\s+/g, " ").trim();
    const { plan, reason } = parameterName ? derivePlan(r) : { plan: null, reason: "paramètre sans nom" };
    items.push({
      legacyId,
      typeLegacyId,
      parameterName,
      norm: r.norme,
      unit: r.unite || null,
      plan,
      reason,
    });
  }
  return { items, error: null };
}

/** The norm string of the old software, when it names a versioned norm. */
export function usableNorm(norm: string): boolean {
  const flat = norm.trim();
  return flat.length > 3 && /\d{4}/.test(flat) && !/^\(?MI\)?$/i.test(flat);
}
