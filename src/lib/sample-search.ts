import type { Interpretation, SampleStatus, SampleType } from "@/generated/prisma/enums";
import { INTERPRETATION_LABELS, indicativeVerdict, nothingJudged, sampleVerdict } from "./interpretation";
import { SAMPLE_STATUS_LABELS, SAMPLE_TYPE_LABELS, formatIsoDay } from "./labels";

/**
 * Finding the analyses (RETOUR-LABO-29-09.md, slice F) — pure: the filters
 * read from a URL, turned into a Prisma `where`, shared by the search
 * screen, the samples API and the per-client Excel export so the three
 * always agree. The site filter (RETOUR-LABO-06-10.md §5, V5) narrows a
 * client to one of its sampling sites — or to its « Siège », the séries
 * recorded without a site.
 *
 * The dashboards link here (« comme un tri »): `statut` (one exact step of
 * the circuit), `type` (Alimentaire / Eau / Ambiance) and `rapport=1` (the
 * samples that carry a report) let a tile open exactly the samples it
 * counts — build those links with `rechercheHref`.
 */

export type SearchState = "en_cours" | "terminees" | "annulees";
export type DateField = "reception" | "prelevement";

/** The `site` value that means « Siège »: the client's séries without a site. */
export const SIEGE = "siege";

export type SampleSearch = {
  q: string | null;
  clientId: string | null;
  /** A site id of the client, or `SIEGE`; only read when a client is chosen. */
  siteId: string | null;
  natureId: string | null;
  /** « État »: a group of steps. Always null when `status` is set. */
  state: SearchState | null;
  /** « Étape » (`statut`): one exact status; it takes precedence over `state`. */
  status: SampleStatus | null;
  /** « Domaine » (`type`): Alimentaire, Eau or Ambiance. */
  type: SampleType | null;
  /** `rapport=1`: only the samples that carry a report (amended ones included). */
  withReport: boolean;
  dateField: DateField;
  /** Inclusive day bounds, local wall clock (the lab's time zone). */
  from: Date | null;
  to: Date | null;
};

export const DONE_STATUSES: SampleStatus[] = ["VALIDE", "RAPPORT_ENVOYE"];
/** « En cours » — every step before validation, the programme included (PROGRAMME.md §6). */
export const OPEN_STATUSES: SampleStatus[] = ["PRELEVE", "RECU", "PROGRAMME", "EN_ANALYSE", "RESULTATS_SAISIS"];

/** « 2026-09-01 » → the start of that day; anything else → null. */
function day(value: string | null, endOfDay: boolean): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const isKey = <K extends string>(labels: Record<K, string>, value: string | null): value is K =>
  value !== null && Object.prototype.hasOwnProperty.call(labels, value);

export function parseSampleSearch(params: URLSearchParams): SampleSearch {
  const text = (key: string) => params.get(key)?.trim() || null;
  const state = text("etat");
  const rawStatus = text("statut");
  const status = isKey(SAMPLE_STATUS_LABELS, rawStatus) ? rawStatus : null;
  const rawType = text("type");
  let from = day(text("du"), false);
  let to = day(text("au"), true);
  // A period typed backwards is still the period the user meant.
  if (from && to && from > to) [from, to] = [day(text("au"), false), day(text("du"), true)];
  const clientId = text("client");
  return {
    q: text("q")?.slice(0, 100) ?? null,
    clientId,
    // A site belongs to a client: without the client the filter means nothing.
    siteId: clientId ? text("site") : null,
    natureId: text("nature"),
    // One exact step says more than a group of steps: the step wins.
    state: !status && (state === "en_cours" || state === "terminees" || state === "annulees") ? state : null,
    status,
    type: isKey(SAMPLE_TYPE_LABELS, rawType) ? rawType : null,
    withReport: text("rapport") === "1",
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
  const status = search.status
    ? { status: search.status }
    : search.state === "terminees"
      ? { status: { in: DONE_STATUSES } }
      : search.state === "en_cours"
        ? { status: { in: OPEN_STATUSES } }
        : search.state === "annulees"
          ? { status: "ANNULE" as const }
          : {};
  return {
    ...(search.clientId ? { clientId: search.clientId } : {}),
    ...(search.siteId ? { serie: { siteId: search.siteId === SIEGE ? null : search.siteId } } : {}),
    ...(search.natureId ? { natureId: search.natureId } : {}),
    ...(search.type ? { type: search.type } : {}),
    ...(search.withReport ? { report: { isNot: null } } : {}),
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
            { serie: { site: { name: { contains: q } } } },
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
  if (search.siteId) params.set("site", search.siteId);
  if (search.natureId) params.set("nature", search.natureId);
  if (search.state) params.set("etat", search.state);
  if (search.status) params.set("statut", search.status);
  if (search.type) params.set("type", search.type);
  if (search.withReport) params.set("rapport", "1");
  if (search.dateField !== "reception") params.set("date", search.dateField);
  if (search.from) params.set("du", iso(search.from));
  if (search.to) params.set("au", iso(search.to));
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}

/** A search with no filter: every sample (within the viewer's own scope). */
export const EMPTY_SAMPLE_SEARCH: SampleSearch = {
  q: null,
  clientId: null,
  siteId: null,
  natureId: null,
  state: null,
  status: null,
  type: null,
  withReport: false,
  dateField: "reception",
  from: null,
  to: null,
};

/**
 * What a dashboard link asks of /recherche. Days are inclusive. A `Date` is
 * written with `formatIsoDay` (the lab's zone, the same on server and
 * browser). A boundary the server cut with `setHours(0, 0, 0, 0)` is better
 * passed as `serverIsoDay(boundary)` (`lib/dashboard-view.ts`): /recherche
 * reads `du` / `au` back on the server clock, so that string returns the
 * exact instant the tile counted from even when the runtime's zone data and
 * `lib/lab-time.ts` disagree.
 */
export type RechercheLink = {
  q?: string;
  clientId?: string;
  siteId?: string;
  natureId?: string;
  state?: SearchState;
  status?: SampleStatus;
  type?: SampleType;
  withReport?: boolean;
  /** Which date `from` / `to` apply to; the reception date by default. */
  dateField?: DateField;
  from?: Date | string;
  to?: Date | string;
};

/**
 * The /recherche link that lists exactly what a tile counts, e.g.
 * `rechercheHref({ status: "RECU" })` → `/recherche?statut=RECU`,
 * `rechercheHref({ from: new Date(), to: new Date() })` → today's receptions,
 * `rechercheHref({ type: "EAU", dateField: "prelevement", from: monthStart })`.
 * Written with the same parameter names `parseSampleSearch` reads, in the
 * same order as `searchQueryString`; no filter → `/recherche`.
 */
export function rechercheHref(link: RechercheLink = {}): string {
  const day = (value: Date | string | undefined) =>
    value === undefined ? null : typeof value === "string" ? value : formatIsoDay(value);
  const params = new URLSearchParams();
  if (link.q) params.set("q", link.q);
  if (link.clientId) params.set("client", link.clientId);
  if (link.clientId && link.siteId) params.set("site", link.siteId);
  if (link.natureId) params.set("nature", link.natureId);
  if (link.state && !link.status) params.set("etat", link.state);
  if (link.status) params.set("statut", link.status);
  if (link.type) params.set("type", link.type);
  if (link.withReport) params.set("rapport", "1");
  if (link.dateField && link.dateField !== "reception") params.set("date", link.dateField);
  const from = day(link.from);
  const to = day(link.to);
  if (from) params.set("du", from);
  if (to) params.set("au", to);
  const query = params.toString();
  return query ? `/recherche?${query}` : "/recherche";
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
