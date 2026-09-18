import type { Family, LimitKind } from "@/generated/prisma/enums";
import { parseLabValue } from "./result-value";
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
  clientId: string | null;
  active: boolean;
};

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

export function validateProductType(raw: unknown): Ok<CleanProductType> | Fail {
  const input = (raw ?? {}) as Record<string, unknown>;
  const name = text(input.name).replace(/\s+/g, " ");
  if (!name) return { ok: false, error: "Le nom du type de produit est obligatoire." };
  const family = FAMILIES.includes(input.family as Family) ? (input.family as Family) : "MICRO";
  return {
    ok: true,
    value: {
      name,
      normalizedName: normalizeLabel(name),
      family,
      clientId: text(input.clientId) || null,
      active: input.active === undefined ? true : input.active === true,
    },
  };
}

/** A limit typed by the admin: a number, the lab's notation, or empty. */
function limit(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : "invalid";
  const parsed = parseLabValue(String(v));
  return parsed.kind === "number" && parsed.numeric !== null && parsed.numeric >= 0 ? parsed.numeric : "invalid";
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
    if (!Number.isInteger(c) || c < 0 || c >= n) return fail("c doit être un entier entre 0 et n − 1.");
  }

  const mKind = KINDS.includes(input.mKind as LimitKind) ? (input.mKind as LimitKind) : "VALUE";
  const m = limit(input.m);
  const bigM = limit(input.bigM);
  if (m === "invalid") return fail("la limite m est illisible.");
  if (bigM === "invalid") return fail("la limite M est illisible.");

  if (mKind === "ABSENCE" && (m !== null || bigM !== null)) return fail("un critère d'absence ne porte pas de limite chiffrée.");
  if (mKind === "UNSPECIFIED" && bigM === null) return fail("« m non spécifiée » exige une limite M.");
  if (mKind === "VALUE" && m === null) return fail("la limite m est obligatoire.");
  if (m !== null && bigM !== null && bigM < m) return fail("M doit être supérieur ou égal à m.");
  if (c !== null && (mKind !== "VALUE" || bigM === null)) return fail("la tolérance c n'a de sens qu'avec m et M.");

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
