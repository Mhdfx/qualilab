import type { Interpretation, SampleStatus } from "@/generated/prisma/enums";
import { INTERPRETATION_LABELS, indicativeVerdict, nothingJudged, sampleVerdict } from "./interpretation";

/**
 * Finding the analyses (RETOUR-LABO-29-09.md, slice F) — pure: the filters
 * read from a URL, turned into a Prisma `where`, shared by the search
 * screen, the samples API and the per-client Excel export so the three
 * always agree.
 */

export type SearchState = "en_cours" | "terminees" | "annulees";
export type DateField = "reception" | "prelevement";

export type SampleSearch = {
  q: string | null;
  clientId: string | null;
  natureId: string | null;
  state: SearchState | null;
  dateField: DateField;
  /** Inclusive day bounds, local wall clock (the lab's time zone). */
  from: Date | null;
  to: Date | null;
};

export const DONE_STATUSES: SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];
export const OPEN_STATUSES: SampleStatus[] = ["PRELEVE", "RECU", "EN_ANALYSE", "RESULTATS_SAISIS"];

/** « 2026-09-01 » → the start of that day; anything else → null. */
function day(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function parseSampleSearch(params: URLSearchParams): SampleSearch {
  const text = (key: string) => params.get(key)?.trim() || null;
  const state = text("etat");
  let from = day(text("du"), false);
  let to = day(text("au"), true);
  // A period typed backwards is still the period the user meant.
  if (from && to && from > to) [from, to] = [day(text("au"), false), day(text("du"), true)];
  return {
    q: text("q")?.slice(0, 100) ?? null,
    clientId: text("client"),
    natureId: text("nature"),
    state: state === "en_cours" || state === "terminees" || state === "annulees" ? state : null,
    dateField: text("date") === "prelevement" ? "prelevement" : "reception",
    from,
    to,
  };
}

/**
 * The `where` of a search. `blind` = the préleveur's search, which never
 * matches the laboratory's N° de contrôle (the blind-analysis rule).
 */
export function sampleSearchWhere(search: SampleSearch, options: { blind?: boolean } = {}) {
  const { q } = search;
  const dateKey = search.dateField === "prelevement" ? "sampledAt" : "receivedAt";
  const range =
    search.from || search.to
      ? { [dateKey]: { ...(search.from ? { gte: search.from } : {}), ...(search.to ? { lte: search.to } : {}) } }
      : {};
  const status =
    search.state === "terminees"
      ? { status: { in: DONE_STATUSES } }
      : search.state === "en_cours"
        ? { status: { in: OPEN_STATUSES } }
        : search.state === "annulees"
          ? { status: "ANNULE" as const }
          : {};
  return {
    ...(search.clientId ? { clientId: search.clientId } : {}),
    ...(search.natureId ? { natureId: search.natureId } : {}),
    ...status,
    ...range,
    ...(q
      ? {
          OR: [
            { code: { contains: q } },
            { serie: { serialNumber: { contains: q } } },
            { produit: { contains: q } },
            { numeroLot: { contains: q } },
            { lieu: { contains: q } },
            { client: { name: { contains: q } } },
            ...(options.blind ? [] : [{ controlCode: { contains: q } }, { serialNumber: { contains: q } }]),
          ],
        }
      : {}),
  };
}

/** The query string of a search, for links (pagination, export). */
export function searchQueryString(search: SampleSearch, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (search.q) params.set("q", search.q);
  if (search.clientId) params.set("client", search.clientId);
  if (search.natureId) params.set("nature", search.natureId);
  if (search.state) params.set("etat", search.state);
  if (search.dateField !== "reception") params.set("date", search.dateField);
  if (search.from) params.set("du", iso(search.from));
  if (search.to) params.set("au", iso(search.to));
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

type ConclusionInput = {
  status: SampleStatus;
  report: { interpretation: Interpretation | null } | null;
  results: { interpretation: Interpretation | null; conform: boolean | null; informalInterpretation?: Interpretation | null }[];
};

export type Conclusion = { label: string; tone: "ok" | "mid" | "no" | "pending" | "muted" };

/**
 * The conclusion of one sample as the lists and the export print it: the
 * report's official verdict, the indicative one when too few units left the
 * report without any, the old conform reading otherwise — or « En cours ».
 */
export function sampleConclusion(sample: ConclusionInput): Conclusion {
  if (sample.status === "ANNULE") return { label: "Annulé", tone: "muted" };
  if (!DONE_STATUSES.includes(sample.status)) return { label: "En cours", tone: "pending" };
  const tone = (v: Interpretation): Conclusion["tone"] =>
    v === "SATISFAISANT" ? "ok" : v === "ACCEPTABLE" ? "mid" : v === "NON_SATISFAISANT" ? "no" : "pending";
  const official = sample.report?.interpretation ?? sampleVerdict(sample.results);
  if (official) return { label: INTERPRETATION_LABELS[official], tone: tone(official) };
  if (sample.results.some((r) => r.interpretation === null && r.informalInterpretation)) {
    const indicative = indicativeVerdict(sample.results);
    if (indicative) return { label: `${INTERPRETATION_LABELS[indicative]} (indicatif)`, tone: tone(indicative) };
  }
  if (nothingJudged(sample.results)) return { label: "Sans interprétation", tone: "pending" };
  return sample.results.some((r) => r.conform === false)
    ? { label: "Non conforme", tone: "no" }
    : { label: "Conforme", tone: "ok" };
}
