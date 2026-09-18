import type { LimitKind } from "@/generated/prisma/enums";
import { normalizeLabel } from "./serie-input";

/**
 * Reading the laboratory's criteria workbook (CRITERES.md §1, §5) — pure.
 *
 * One sheet, one block per product type: a title row, a header row
 * (« Microorganismes | Norme | Unité | Plan d'échantillonnage | Limite »),
 * then one row per parameter. The parser turns the sheet into criterion
 * drafts and a list of refused rows with the reason; nothing is guessed.
 */

export type SheetRow = (string | number | null)[];

export type CriterionDraft = {
  line: number;
  productType: string;
  productKey: string;
  parameterLabel: string;
  /** The label without its « /375g » mass suffix, normalised for matching. */
  parameterKey: string;
  normCode: string;
  normVersion: string;
  normLabel: string;
  unit: string;
  n: number;
  c: number | null;
  mKind: LimitKind;
  m: number | null;
  bigM: number | null;
};

export type ParsedSheet = {
  drafts: CriterionDraft[];
  /** Rows that repeat a (type, germ, norm version) already read — the first wins. */
  duplicates: { line: number; productType: string; parameterLabel: string }[];
  productTypes: string[];
  refused: { line: number; productType: string | null; reason: string }[];
};

const HEADER = /^micro-?organismes?$/i;

function text(v: string | number | null | undefined) {
  return v === null || v === undefined ? "" : String(v).trim();
}

/** « 1.102 » → 100, « 1.5.106 » → 1 500 000, « 3 » → 3; the rest is refused. */
export function parseLimit(value: string): { kind: LimitKind | "EMPTY"; value: number | null; error?: string } {
  const v = value.trim();
  if (!v) return { kind: "EMPTY", value: null };
  if (/absente/i.test(v)) return { kind: "ABSENCE", value: null };
  if (/non\s+sp[ée]cifi[ée]e?/i.test(v)) return { kind: "UNSPECIFIED", value: null };
  const sci = v.replace(",", ".").match(/^(\d+(?:\.\d)?)\.10(\d)$/);
  if (sci) return { kind: "VALUE", value: Number(sci[1]) * 10 ** Number(sci[2]) };
  if (/^\d+$/.test(v)) return { kind: "VALUE", value: Number(v) };
  return { kind: "VALUE", value: null, error: `limite illisible « ${v} »` };
}

/** « NM ISO 6579 - 1:2017 » → code « NM ISO 6579-1 », version « 2017 ». */
export function parseNorm(value: string): { code: string; version: string; label: string } {
  const label = value.trim().replace(/\s+/g, " ");
  const m = label.match(/^(.*?)\s*[:\-–]\s*(\d{4})(?:\s*\(.*\))?$/);
  if (m && /\d{4}/.test(m[2])) {
    const code = m[1].replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
    return { code, version: m[2], label };
  }
  // No norm written: the criterion stands alone (no « — » norm is invented).
  const code = label.replace(/\s*-\s*/g, "-").trim();
  return { code, version: "", label: label.trim() };
}

/**
 * The germ's key for matching. The workbook writes one germ several ways —
 * « Recherche des Salmonella », « Salmonella », « Micro-organismes-1 à 30°C »
 * (the « -1 / -2 » of two norm rows side by side), « 37 °C » — so the key
 * drops the mass suffix, the « Recherche de/des/du » prefix, the row
 * suffix, the star and the accents before comparing.
 */
export function parameterKey(label: string): { key: string; mass: string | null } {
  const { name, mass } = splitLabel(label);
  // The incubation temperature (« à 37 °C ») is method detail, not the germ:
  // the workbook writes the same germ with and without it under two norms.
  const bare = name.replace(/^recherche\s+(de\s+|des\s+|du\s+|d')?/i, "").replace(/\s+à\s+\d+\s*°C\s*$/i, "");
  return { key: normalizeLabel(bare), mass };
}

/** The label without its mass, row suffix and star — as a new parameter is named. */
export function parameterLabel(label: string): string {
  return splitLabel(label).name;
}

function splitLabel(label: string): { name: string; mass: string | null } {
  let l = label.trim();
  let mass: string | null = null;
  const suffix = l.match(/\s*\/\s*(\d+\s*g)\s*$/i);
  if (suffix) {
    mass = "/" + suffix[1].replace(/\s+/g, "");
    l = l.slice(0, suffix.index).trim();
  }
  l = l.replace(/\s*\*+\s*$/, "");
  l = l.replace(/(?<=\S)-\d(?=\s|$)/g, "");
  l = l.replace(/\s*°\s*c\b/gi, "°C").replace(/\s+/g, " ").trim();
  return { name: l, mass };
}

/** « n=5 » / « c=2 » as the workbook writes them, or a bare integer. */
export function parsePlan(nText: string, cText: string): { n: number; c: number | null; error?: string } {
  const n = nText.match(/^\s*(?:n\s*=\s*)?(\d+)\s*$/i);
  const c = cText.match(/^\s*(?:c\s*=\s*)?(\d+)\s*$/i);
  if (nText.trim() && !n) return { n: 5, c: null, error: `plan illisible « ${nText} »` };
  if (cText.trim() && !c) return { n: n ? Number(n[1]) : 5, c: null, error: `tolérance illisible « ${cText} »` };
  return { n: n ? Number(n[1]) : 5, c: c ? Number(c[1]) : null };
}

export function parseCriteriaSheet(rows: SheetRow[]): ParsedSheet {
  const drafts: CriterionDraft[] = [];
  const refused: ParsedSheet["refused"] = [];
  const productTypes: string[] = [];
  let product: string | null = null;

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    const line = i + 1;
    const a = text(row[0]);
    if (!a) continue;
    const next = rows[i + 1] ?? [];
    if (HEADER.test(text(next[0]))) {
      product = a.replace(/\s+/g, " ");
      if (!productTypes.includes(product)) productTypes.push(product);
      i += 1; // skip the header row
      continue;
    }
    if (HEADER.test(a)) continue;
    if (!product) {
      refused.push({ line, productType: null, reason: "ligne hors bloc de type de produit" });
      continue;
    }
    const norme = text(row[1]);
    const unit = text(row[2]);
    const plan = parsePlan(text(row[3]), text(row[4]));
    const m = parseLimit(text(row[5]));
    const bigM = parseLimit(text(row[6]));
    const problems = [plan.error, m.error, bigM.error].filter(Boolean) as string[];
    if (!norme && !unit && m.kind === "EMPTY" && bigM.kind === "EMPTY") {
      refused.push({ line, productType: product, reason: `« ${a} » sans norme ni limite` });
      continue;
    }
    if (problems.length) {
      refused.push({ line, productType: product, reason: `${a} : ${problems.join(" ; ")}` });
      continue;
    }
    if (m.kind === "EMPTY" && bigM.kind === "EMPTY") {
      refused.push({ line, productType: product, reason: `${a} : aucune limite` });
      continue;
    }
    const { key, mass } = parameterKey(a);
    const norm = parseNorm(norme);
    drafts.push({
      line,
      productType: product,
      productKey: normalizeLabel(product),
      parameterLabel: a.replace(/\s+/g, " "),
      parameterKey: key,
      normCode: norm.code,
      normVersion: norm.version,
      normLabel: norm.label,
      unit: unit || mass || "",
      n: plan.n,
      c: plan.c,
      mKind: m.kind === "EMPTY" ? "UNSPECIFIED" : m.kind,
      m: m.kind === "VALUE" ? m.value : null,
      bigM: bigM.kind === "VALUE" ? bigM.value : null,
    });
  }
  const seen = new Set<string>();
  const duplicates: ParsedSheet["duplicates"] = [];
  const unique = drafts.filter((d) => {
    const key = `${d.productKey}|${d.parameterKey}|${d.normCode}|${d.normVersion}`;
    if (seen.has(key)) {
      duplicates.push({ line: d.line, productType: d.productType, parameterLabel: d.parameterLabel });
      return false;
    }
    seen.add(key);
    return true;
  });
  return { drafts: unique, productTypes, refused, duplicates };
}
