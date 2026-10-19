import type { Family, LimitKind } from "@/generated/prisma/enums";
import { singleLimit, type Plan } from "./interpretation";
import { isDilutionShorthand, parseLabValue } from "./result-value";
import { normalizeLabel } from "./serie-input";
import { MAX_UNITS } from "./series";

/**
 * Validating what the admin types in the catalogue screens — a product
 * type and a criterion row (n, c, m, M). Pure, shared by the API and the
 * grid; the limits accept the lab's notation (« 1.10² », « 1,5.10⁶ »).
 */

export type CleanProductType = {
  name: string;
  normalizedName: string;
  family: Family;
  /** The type d'analyse (RETOUR-LABO-16-10.md F1); null = « à préciser ». */
  natureId: string | null;
  clientId: string | null;
  active: boolean;
};

/**
 * A nature the family may be given: the caller reads it from the database
 * (`AnalysisNature`). `active` false = archived, refused — except the one a
 * family already carries, which the caller passes as active so an edit of
 * the name or of the activity never trips over it.
 */
export type ProductTypeNature = { id: string; family: Family; active: boolean };

export type CleanCriterion = {
  id: string | null;
  parameterId: string;
  normVersionId: string | null;
  unit: string | null;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
  active: boolean;
};

type Ok<T> = { ok: true; value: T };
type Fail = { ok: false; error: string; row?: number };

const FAMILIES: Family[] = ["MICRO", "CHIMIE", "AUTRE"];
const KINDS: LimitKind[] = ["VALUE", "ABSENCE", "UNSPECIFIED"];

function text(v: unknown, max = 191) {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length > max ? s.slice(0, max) : s;
}

/**
 * A product family as typed in the catalogue screens. With a type d'analyse
 * (`natureId`, one of `natures`, active), the domain is the nature's — the
 * `family` sent is then ignored: a hands family is never « Physico-chimie »
 * while its nature says « Microbiologie ». Without one, the domain is the
 * one chosen (MICRO by default).
 */
export function validateProductType(raw: unknown, natures: readonly ProductTypeNature[] = []): Ok<CleanProductType> | Fail {
  const input = (raw ?? {}) as Record<string, unknown>;
  const name = text(input.name).replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Le nom de la famille est obligatoire." };

  let natureId: string | null = null;
  let family: Family = FAMILIES.includes(input.family as Family) ? (input.family as Family) : "MICRO";
  if (input.natureId !== undefined && input.natureId !== null && input.natureId !== "") {
    const nature = typeof input.natureId === "string" ? natures.find((n) => n.id === input.natureId && n.active) : undefined;
    if (!nature) return { ok: false, error: "Type d'analyse inconnu ou archivé." };
    natureId = nature.id;
    family = nature.family;
  }
  return {
    ok: true,
    value: {
      name,
      normalizedName: normalizeLabel(name),
      family,
      natureId,
      clientId: text(input.clientId) || null,
      active: input.active === undefined ? true : input.active === true,
    },
  };
}

/**
 * A limit typed by the admin: a number, the lab's notation, or empty. The
 * bench shorthand « 1(-2) » is a colony count with its dilution, not a
 * limit: refused rather than silently saved as 100.
 */
function limit(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : "invalid";
  if (isDilutionShorthand(String(v))) return "invalid";
  const parsed = parseLabValue(String(v));
  return parsed.kind === "number" && parsed.numeric !== null && parsed.numeric >= 0 ? parsed.numeric : "invalid";
}

/**
 * Whether the tolerance c means anything: only against a figure — the
 * units between m and M of a three-class plan, or the units above the one
 * limit of a single-limit plan (m alone, M alone, m = M: answer of the
 * laboratory to Q31, `judgeCounts`). An absence test and a « m non
 * spécifiée » criterion without M have no figure, so no c.
 */
export function toleranceApplies(mKind: LimitKind, hasM: boolean, hasBigM: boolean): boolean {
  if (mKind === "UNSPECIFIED") return hasBigM;
  return mKind === "VALUE" && hasM;
}

/**
 * « m non spécifiée » without M: the germ is analysed and printed, never
 * judged (`hasLimit` in the interpretation engine). The workbook and the
 * old software's import both write such rows (RETOUR-LABO-16-10.md F2).
 */
export const LIMITLESS_HINT = "sans limite — résultat sans verdict";

/**
 * The note the grid shows on a single-limit row with n = 1 and c ≥ 1. n = 1
 * bounds c by what a sample holds (the imported grids need it), so c units
 * above the limit are tolerated whatever the sample: a sample of one unit
 * above the limit is « Acceptable », never « Non satisfaisant » — a rule the
 * laboratory is asked to confirm (RETOUR-LABO-16-10.md F2).
 */
export function wideToleranceNote(plan: Plan): string | null {
  if (plan.n !== 1 || plan.c === null || plan.c < 1 || singleLimit(plan) === null) return null;
  return `c = ${plan.c} avec n = 1 : un échantillon d'une seule unité au-dessus de la limite sera « Acceptable », jamais « Non satisfaisant ».`;
}

/** The limit cells of a grid row, as typed. */
export type LimitCells = { mKind: LimitKind; c: string; m: string; bigM: string };

/**
 * What choosing another kind of limit clears on a grid row. c counts the
 * units tolerated between m and M, or above the one limit: another kind
 * changes what it tolerates, so it is typed again, never carried over — a
 * c = 2 between m = 10 and M = 100 must not become two units tolerated
 * above M = 100.
 */
export function kindChange(cells: LimitCells, next: LimitKind): Partial<LimitCells> {
  return {
    mKind: next,
    ...(next !== cells.mKind ? { c: "" } : {}),
    ...(next === "ABSENCE" ? { m: "", bigM: "" } : {}),
    ...(next === "UNSPECIFIED" ? { m: "" } : {}),
  };
}

/**
 * Typing M on a grid row. Emptying the M of a « m et M chiffrés » row turns
 * c from « between m and M » into « above m »: cleared. Typing an M only
 * narrows what c tolerates (above M is never tolerated), so c is kept.
 */
export function bigMChange(cells: LimitCells, value: string): Partial<LimitCells> {
  const emptied = cells.mKind === "VALUE" && cells.bigM.trim() !== "" && value.trim() === "";
  return { bigM: value, ...(emptied ? { c: "" } : {}) };
}

export function validateCriterion(raw: unknown, row = 0): Ok<CleanCriterion> | Fail {
  const input = (raw ?? {}) as Record<string, unknown>;
  const fail = (error: string): Fail => ({ ok: false, error: row ? `Ligne ${row} : ${error}` : error, row });

  const parameterId = text(input.parameterId);
  if (!parameterId) return fail("choisissez le paramètre.");

  const n = input.n === undefined || input.n === "" ? 5 : Number(input.n);
  if (!Number.isInteger(n) || n < 1 || n > MAX_UNITS) return fail(`n doit être un entier entre 1 et ${MAX_UNITS}.`);

  let c: number | null = null;
  if (input.c !== undefined && input.c !== null && input.c !== "") {
    c = Number(input.c);
    // n = 1 is also the old software's « the units are the sample's » (NBR
    // left empty, `derivePlan`): the plan applies to every unit taken
    // (`judgeUnits`), so c is bounded by what a sample holds, not by n.
    const cMax = n === 1 ? MAX_UNITS - 1 : n - 1;
    if (!Number.isInteger(c) || c < 0 || c > cMax) return fail(n === 1 ? `c doit être un entier entre 0 et ${cMax}.` : "c doit être un entier entre 0 et n − 1.");
  }

  const mKind = KINDS.includes(input.mKind as LimitKind) ? (input.mKind as LimitKind) : "VALUE";
  const m = limit(input.m);
  const bigM = limit(input.bigM);
  if (m === "invalid") return fail("la limite m est illisible.");
  if (bigM === "invalid") return fail("la limite M est illisible.");

  // « m non spécifiée » with M empty is accepted: no limit, no verdict. An m
  // sent with it (a stale page, a script, a mistyped kind) is refused, never
  // dropped: the row would silently become a limitless criterion.
  if (mKind === "ABSENCE" && (m !== null || bigM !== null)) return fail("un critère d'absence ne porte pas de limite chiffrée.");
  if (mKind === "UNSPECIFIED" && m !== null) return fail("« m non spécifiée » ne porte pas de m : indiquez M, ou laissez M vide pour « sans limite ».");
  if (mKind === "VALUE" && m === null) return fail("la limite m est obligatoire.");
  if (mKind === "VALUE" && m !== null && bigM !== null && bigM < m) return fail("M doit être supérieur ou égal à m.");
  if (c !== null && !toleranceApplies(mKind, m !== null, bigM !== null)) {
    return fail(mKind === "ABSENCE" ? "un critère d'absence ne porte pas de tolérance c." : "la tolérance c n'a de sens qu'avec une limite chiffrée (m ou M).");
  }

  return {
    ok: true,
    value: {
      id: text(input.id) || null,
      parameterId,
      normVersionId: text(input.normVersionId) || null,
      unit: text(input.unit, 40) || null,
      n,
      c,
      mKind,
      m: mKind === "VALUE" ? m : null,
      bigM,
      active: input.active === undefined ? true : input.active === true,
    },
  };
}

/**
 * The most rows one family's grid takes in a save. The old software's import
 * writes whole families without this bound — its largest, « AUTRES », holds
 * 346 rows on the local copy (19/10) — and a grid shown on screen must save
 * back as it is (RETOUR-LABO-16-10.md F2): the bound stays far above it.
 */
export const CRITERIA_GRID_MAX_ROWS = 1000;

/**
 * The whole grid `PUT /api/product-types/[id]/criteria` receives: at most
 * `CRITERIA_GRID_MAX_ROWS` rows, each one valid (`validateCriterion`, the
 * row number in the message), one criterion per germ and per norm version —
 * a duplicate pair would make the bench's choice of criterion arbitrary.
 */
export function validateCriteriaGrid(raw: unknown): Ok<CleanCriterion[]> | Fail {
  if (!Array.isArray(raw)) return { ok: false, error: "Aucun critère reçu." };
  if (raw.length > CRITERIA_GRID_MAX_ROWS) return { ok: false, error: `Trop de lignes (${CRITERIA_GRID_MAX_ROWS} maximum).` };
  const rows: CleanCriterion[] = [];
  for (const [i, entry] of raw.entries()) {
    const checked = validateCriterion(entry, i + 1);
    if (!checked.ok) return checked;
    rows.push(checked.value);
  }
  const pairs = new Set<string>();
  for (const [i, row] of rows.entries()) {
    const key = `${row.parameterId}|${row.normVersionId ?? ""}`;
    if (pairs.has(key)) return { ok: false, error: `Ligne ${i + 1} : ce germe a déjà un critère pour cette version de norme.`, row: i + 1 };
    pairs.add(key);
  }
  return { ok: true, value: rows };
}

/** A criterion row as the database holds it. */
export type StoredCriterion = Omit<CleanCriterion, "id"> & { id: string };

/**
 * What saving a grid row does to the row stored under its id:
 *   - "none": nothing to write;
 *   - "tidy": only the tolerance c the old software's import left on an
 *     absence test or a limitless row is cleared — a c that means nothing
 *     (`toleranceApplies`), that the grid never shows and saves empty: no
 *     verdict changes, so the journal does not list it as a change and the
 *     grid does not count as changed by hand (`criteriaEditedByHand`);
 *   - "change": anything else.
 */
export function criterionChange(previous: StoredCriterion, row: CleanCriterion): "none" | "tidy" | "change" {
  const same =
    previous.parameterId === row.parameterId &&
    previous.normVersionId === row.normVersionId &&
    previous.n === row.n &&
    previous.mKind === row.mKind &&
    previous.m === row.m &&
    previous.bigM === row.bigM &&
    previous.unit === row.unit &&
    previous.active === row.active;
  if (!same) return "change";
  if (previous.c === row.c) return "none";
  const meaningless = !toleranceApplies(previous.mKind, previous.m !== null, previous.bigM !== null);
  return row.c === null && meaningless ? "tidy" : "change";
}
