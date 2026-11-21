import type { Interpretation, Prisma } from "@/generated/prisma/client";

/**
 * Lot 5B (RETOUR-LABO-20-11.md §6, Q20 « Ajouter tout l'historique des
 * clients, ancien plus nouveau ») — the rules that read the old software's
 * history: its verdict codes, how its readings print, and the queries of the
 * screens (portal and fiche client). Pure: the import
 * (`legacy-history-import.ts`) and the loaders (`legacy-history-server.ts`)
 * call them.
 *
 * Read-only and never mixed with the LIMS: its numbers (« 2772/26 »,
 * « 20459/26 ») cross ours in 2026 (Q19), so the history is its own screen,
 * its own list, its own counts. It is no official report: the signed report
 * of the time prevails (`LEGACY_HISTORY_NOTICE`), no PDF is generated from it
 * (ISO 17025 §7.8).
 */

/** The notice at the head of every screen of the history (HA4). */
export const LEGACY_HISTORY_NOTICE =
  "Données reprises de l'ancien logiciel, à titre d'information — le rapport signé fait foi.";

/** The first line of `clients.csv` (`extract-legacy-history.py`), shown on the import screen. */
export const LEGACY_CLIENTS_FILE_HEADER = "legacyClientId;client;ice;obsolete;echantillons;premiereAnnee;derniereAnnee";

/** The screens' title (portal menu, fiche client). */
export const LEGACY_HISTORY_TITLE = "Historique (ancien logiciel)";

// ---- the verdicts -----------------------------------------------------------------------

/**
 * The old software's verdict codes (LES_CONCLUSION_ECHANTION, read on the
 * base on 21/11 — `backups/historique-ancien/schema.md`), the same for a
 * sample (SAISIE_RESULTAT.CONCLU_RESULT) and a unit's reading
 * (RESULTA_LIGNES.CONCLUSION). Each keeps the old wording; `interpretation`
 * is our scale, null where the code is no verdict (100: no conclusion; the
 * grades of an oil, a classification rather than a conformity).
 *
 * The three « (inv.) » codes (16, 17, 25 — about 1 300 readings and 210
 * samples) are read by their wording, the text the report printed —
 * hypothèse, to compare with the signed reports in the HA7 rehearsal (risk 2
 * of §6): their internal priority is reversed and no document says why.
 */
export const LEGACY_VERDICTS: Readonly<Record<number, { label: string; interpretation: Interpretation | null }>> = {
  0: { label: "Non satisfaisant", interpretation: "NON_SATISFAISANT" },
  1: { label: "Acceptable", interpretation: "ACCEPTABLE" },
  2: { label: "Satisfaisant", interpretation: "SATISFAISANT" },
  3: { label: "Satisfaisant", interpretation: "SATISFAISANT" },
  4: { label: "Non conforme", interpretation: "NON_SATISFAISANT" },
  5: { label: "Conforme", interpretation: "SATISFAISANT" },
  10: { label: "Ne répond pas", interpretation: "NON_SATISFAISANT" },
  11: { label: "Répond", interpretation: "SATISFAISANT" },
  16: { label: "Satisfaisant", interpretation: "SATISFAISANT" },
  17: { label: "Non satisfaisant", interpretation: "NON_SATISFAISANT" },
  25: { label: "Acceptable", interpretation: "ACCEPTABLE" },
  113: { label: "Excellente", interpretation: "SATISFAISANT" },
  114: { label: "Bonne", interpretation: "SATISFAISANT" },
  115: { label: "Nettoyage à surveiller", interpretation: "ACCEPTABLE" },
  116: { label: "Nettoyage urgent", interpretation: "NON_SATISFAISANT" },
  117: { label: "Moyenne", interpretation: "ACCEPTABLE" },
  118: { label: "Mauvaise", interpretation: "NON_SATISFAISANT" },
  119: { label: "Vierge extra", interpretation: null },
  120: { label: "Vierge fine", interpretation: null },
  121: { label: "Vierge courante", interpretation: null },
  122: { label: "Vierge lampante", interpretation: null },
  123: { label: "Non acceptable", interpretation: "NON_SATISFAISANT" },
  124: { label: "Propre", interpretation: "SATISFAISANT" },
};

/** The code that means « no conclusion » (blank on the report). */
export const LEGACY_NO_VERDICT = 100;

/** A verdict code read: its wording and our scale; nothing for a blank or unknown code. */
export function legacyVerdict(code: number | null | undefined): { label: string; interpretation: Interpretation | null } | null {
  if (code === null || code === undefined || code === LEGACY_NO_VERDICT) return null;
  return LEGACY_VERDICTS[code] ?? null;
}

// ---- the readings -----------------------------------------------------------------------

/**
 * One reading of the file (RESULTA_LIGNES), as `extract-legacy-history.py`
 * writes it — the keys short, an absent value left out:
 *   u  the unit (NUM_ECHE, 1…n)      v  the value (RESULTA, dot-decimal)
 *   e  its power of ten (EXP_R)       op the operator (« < », « > », « NE »…)
 *   c  the unit's verdict code        k  the kind (11 number, 12 presence, 13 text)
 *   b  the presence code (RESULT_BINAIR: 21 Absence, 22 Présence, 23 Non détecté, 24 Détecté)
 *   t  a text (RESULTA_LIGNES.OBSERVATION)
 */
export type LegacyFileReading = {
  u?: number;
  v?: string;
  e?: number;
  op?: string;
  c?: number;
  k?: number;
  b?: number;
  t?: string;
};

/** What a legacy result keeps of a reading (`LegacyResult.readings`). */
export type LegacyReading = { unit: number; value: string | null; verdict: string | null };

export const LEGACY_KIND_PRESENCE = 12;
export const LEGACY_KIND_TEXT = 13;

const PRESENCE_LABELS: Readonly<Record<number, string>> = {
  21: "Absence",
  22: "Présence",
  23: "Non détecté",
  24: "Détecté",
};

/** The comparison operators that print before the value. */
const PREFIX_OPERATORS = new Set(["<", ">", "=", "≤", "≥", "<=", ">="]);

const SUPERSCRIPTS: Readonly<Record<string, string>> = {
  "-": "⁻",
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
};

/** « 3 » → « ³ », « -1 » → « ⁻¹ ». */
export function superscript(exponent: number): string {
  return String(exponent)
    .split("")
    .map((c) => SUPERSCRIPTS[c] ?? c)
    .join("");
}

/**
 * The decimals a report printed (VALIDETAT_INFO.FORMAT_NUM, a Delphi
 * pattern: « 0.### » up to three, « 0.0 » exactly one, « 0.#0 »…): the
 * zeros after the point are the minimum, every character the maximum. No
 * pattern: as stored, trailing zeros dropped (up to four decimals).
 */
export function decimalsOf(format: string | null | undefined): { min: number; max: number } {
  const match = /^0?\.([0#]+)$/.exec((format ?? "").trim());
  if (!match) return { min: 0, max: 4 };
  const pattern = match[1];
  return { min: (pattern.match(/0/g) ?? []).length, max: pattern.length };
}

/** « 1.7 » → « 1,7 » with the decimals of the report. */
export function formatLegacyNumber(raw: string, decimals: { min: number; max: number }): string | null {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const fixed = value.toFixed(decimals.max);
  let [whole, fraction = ""] = fixed.split(".");
  while (fraction.length > decimals.min && fraction.endsWith("0")) fraction = fraction.slice(0, -1);
  if (whole === "-0") whole = "0";
  return fraction ? `${whole},${fraction}` : whole;
}

/**
 * A reading as the report printed it: « < 10 », « 1,7.10² », « Absence »,
 * « NE ». A mantissa with a power of ten keeps one decimal (« 3,0.10³ », the
 * lab's notation); without one, the report's decimals (`decimalsOf`). Null:
 * nothing was entered.
 */
export function formatLegacyReading(reading: LegacyFileReading, format: string | null | undefined): string | null {
  const text = reading.t?.trim() || null;
  if (reading.k === LEGACY_KIND_PRESENCE) return (reading.b !== undefined ? PRESENCE_LABELS[reading.b] : undefined) ?? text;
  if (reading.k === LEGACY_KIND_TEXT) return text;
  const op = reading.op?.trim() || null;
  const prefix = op && PREFIX_OPERATORS.has(op) ? op.replace("<=", "≤").replace(">=", "≥") : null;
  if (reading.v === undefined || reading.v === "") {
    // « NE », « ND » alone: the operator column carries the result.
    if (op && !prefix && /[A-Za-z]/.test(op)) return op;
    return text;
  }
  if (op && !prefix && /[A-Za-z]/.test(op)) return op;
  const exponent = reading.e ?? 0;
  const decimals = exponent !== 0 ? { min: 1, max: Math.max(1, Math.min(2, decimalsOf(format).max)) } : decimalsOf(format);
  const mantissa = formatLegacyNumber(reading.v, decimals);
  if (mantissa === null) return text;
  const value = exponent !== 0 ? `${mantissa}.10${superscript(exponent)}` : mantissa;
  // A non-breaking space between « < » and the value: it never wraps alone.
  return prefix ? `${prefix} ${value}` : value;
}

/**
 * The verdict of one analysis from its units' verdicts (n = 1 to 9):
 *   - one unit, or all units alike: that verdict;
 *   - any unit « Non satisfaisant »: « Non satisfaisant » — one unit above M
 *     fails the plan, whatever c (the verdict is never softened);
 *   - otherwise (Satisfaisant and Acceptable mixed): none — whether the
 *     acceptable units exceed c the history does not know (the criterion of
 *     the time is not in the base); the units show their own verdicts, the
 *     sample its verdict.
 */
export function legacyResultInterpretation(codes: readonly (number | undefined)[]): Interpretation | null {
  const verdicts = codes.map((code) => legacyVerdict(code)?.interpretation ?? null).filter((v): v is Interpretation => v !== null);
  if (verdicts.length === 0) return null;
  if (verdicts.includes("NON_SATISFAISANT")) return "NON_SATISFAISANT";
  return verdicts.every((v) => v === verdicts[0]) ? verdicts[0] : null;
}

/** The readings of a result, ready to store, and the value the list prints (the units joined). */
export function legacyReadings(
  readings: readonly LegacyFileReading[],
  format: string | null | undefined
): { readings: LegacyReading[]; value: string | null; interpretation: Interpretation | null } {
  const sorted = [...readings].sort((a, b) => (a.u ?? 0) - (b.u ?? 0));
  const kept = sorted.map((r, index) => ({
    unit: r.u ?? index + 1,
    value: formatLegacyReading(r, format),
    verdict: legacyVerdict(r.c)?.label ?? null,
  }));
  const values = kept.map((r) => r.value).filter((v): v is string => v !== null);
  return {
    readings: kept,
    value: values.length === 0 ? null : values.join(" ; ").slice(0, 1000),
    interpretation: legacyResultInterpretation(sorted.map((r) => r.c)),
  };
}

/**
 * The criterion of the file (`extract-legacy-history.py`): n, c, and the
 * limits m and M as [mantissa, power of ten], or `abs` for an absence test.
 * It is the old software's row as it stands today — the one its reprint
 * prints (it reads its criteria live), not a copy made at the time.
 */
export type LegacyFileCriterion = {
  n?: number;
  c?: number;
  m?: [string, number];
  M?: [string, number];
  abs?: number;
};

/** A limit in the lab's notation: [« 1 », 2] → « 10² », [« 1.5 », 3] → « 1,5.10³ », [« 100 », 0] → « 100 ». */
export function legacyLimit([mantissa, exponent]: [string, number]): string | null {
  const text = formatLegacyNumber(mantissa, { min: 0, max: 4 });
  if (text === null) return null;
  if (!exponent) return text;
  return text === "1" ? `10${superscript(exponent)}` : `${text}.10${superscript(exponent)}`;
}

/**
 * The criterion in clear: « n = 5 ; c = 2 ; m = 10² ; M = 10³ », « ≤ 10² »,
 * « Absence ». n and c are written only when the analysis was read on that
 * many units: the plan of today (n = 5) next to a single reading of the time
 * would mislead — the limit alone is then written.
 */
export function legacyCriterionText(criterion: LegacyFileCriterion | null | undefined, unitsRead: number): string | null {
  if (!criterion || typeof criterion !== "object") return null;
  const n = typeof criterion.n === "number" && criterion.n > 1 ? criterion.n : 1;
  const plan = n > 1 && n === unitsRead;
  const parts: string[] = plan ? [`n = ${n}`] : [];
  if (criterion.abs) return [...parts, "Absence"].join(" ; ");
  const valid = (limit: unknown): limit is [string, number] =>
    Array.isArray(limit) && typeof limit[0] === "string" && typeof limit[1] === "number";
  const m = valid(criterion.m) ? legacyLimit(criterion.m) : null;
  const bigM = valid(criterion.M) ? legacyLimit(criterion.M) : null;
  if (m === null && bigM === null) return null;
  if (m !== null && bigM !== null && m !== bigM) {
    if (plan && typeof criterion.c === "number") parts.push(`c = ${criterion.c}`);
    parts.push(`m = ${m}`, `M = ${bigM}`);
  } else {
    parts.push(`≤ ${m ?? bigM}`);
  }
  return parts.join(" ; ").slice(0, 255);
}

/** `LegacyResult.readings` read back — anything malformed is left out. */
export function storedReadings(json: unknown): LegacyReading[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const r = item as Record<string, unknown>;
    if (typeof r.unit !== "number") return [];
    return [{ unit: r.unit, value: typeof r.value === "string" ? r.value : null, verdict: typeof r.verdict === "string" ? r.verdict : null }];
  });
}

// ---- the screens' queries ---------------------------------------------------------------

/** 50 per page, as the portal's lists (PORTAIL.md §2). */
export const LEGACY_PAGE_SIZE = 50;
/** Highest page accepted from a URL (50 × 2 000 = 100 000 samples). */
const MAX_PAGE = 2000;
/** The `site` value meaning « Siège »: the samples whose visit named no site. */
export const LEGACY_SIEGE = "siege";

export type LegacyHistoryFilters = {
  q: string | null;
  /** A site id, or `LEGACY_SIEGE`. A site of another client simply matches nothing. */
  siteId: string | null;
  /**
   * Inclusive day bounds on the RECEPTION date: always typed by the
   * laboratory, while the old software's sampling date is missing on some
   * samples and holds typos (a day and a month swapped).
   */
  from: Date | null;
  to: Date | null;
  page: number;
};

function day(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The filters of the list, read from the URL (`?q=&site=&du=&au=&page=`). */
export function parseLegacyHistoryFilters(params: URLSearchParams): LegacyHistoryFilters {
  const text = (key: string) => params.get(key)?.trim() || null;
  let from = day(text("du"), false);
  let to = day(text("au"), true);
  if (from && to && from > to) [from, to] = [day(text("au"), false), day(text("du"), true)];
  const site = text("site");
  const page = Number.parseInt(text("page") ?? "1", 10);
  return {
    q: text("q")?.slice(0, 100) ?? null,
    siteId: site && site.length <= 191 ? site : null,
    from,
    to,
    page: Number.isFinite(page) ? Math.min(Math.max(page, 1), MAX_PAGE) : 1,
  };
}

/**
 * The `where` of a client's history. The client is a top-level equality no
 * filter can widen — a portal account's client, or the fiche's — and a
 * sample the old software cancelled after its import is never shown.
 */
export function legacyHistoryWhere(clientId: string, filters: Omit<LegacyHistoryFilters, "page">): Prisma.LegacySampleWhereInput {
  if (!clientId) throw new Error("legacyHistoryWhere: client manquant");
  const and: Prisma.LegacySampleWhereInput[] = [];
  if (filters.siteId) and.push({ siteId: filters.siteId === LEGACY_SIEGE ? null : filters.siteId });
  if (filters.from || filters.to) {
    and.push({ receivedAt: { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) } });
  }
  if (filters.q) {
    const q = filters.q;
    and.push({
      OR: [
        { controlNumber: { contains: q } },
        { serieNumber: { contains: q } },
        { reportNumber: { contains: q } },
        { designation: { contains: q } },
        { lot: { contains: q } },
        { place: { contains: q } },
      ],
    });
  }
  return { clientId, cancelled: false, ...(and.length > 0 ? { AND: and } : {}) };
}

/** One sample of the client's history, by id — another client's is not found. */
export function legacySampleByIdWhere(clientId: string, id: number): Prisma.LegacySampleWhereInput {
  if (!clientId) throw new Error("legacySampleByIdWhere: client manquant");
  return { id, clientId, cancelled: false };
}

/** « 5110057 » from a URL segment, or null (anything else is not found). */
export function parseLegacySampleId(value: string): number | null {
  if (!/^\d{1,10}$/.test(value)) return null;
  const id = Number(value);
  return id > 0 && id <= 2_147_483_647 ? id : null;
}

/** Newest reception first (see `LegacyHistoryFilters.from`); the id breaks ties so the pages never overlap. */
export const LEGACY_ORDER_BY: Prisma.LegacySampleOrderByWithRelationInput[] = [{ receivedAt: "desc" }, { id: "desc" }];

/** The query string of a filter set, for the pagination links. */
export function legacyHistoryQueryString(filters: Partial<LegacyHistoryFilters>): string {
  const params = new URLSearchParams();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (filters.q) params.set("q", filters.q);
  if (filters.siteId) params.set("site", filters.siteId);
  if (filters.from) params.set("du", iso(filters.from));
  if (filters.to) params.set("au", iso(filters.to));
  if (filters.page && filters.page > 1) params.set("page", String(filters.page));
  return params.toString();
}
