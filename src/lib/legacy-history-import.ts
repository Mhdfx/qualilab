import { createHash } from "node:crypto";
import type { Interpretation, LegacyLinkSource } from "@/generated/prisma/client";
import { parseCsv, detectDelimiter } from "./csv";
import { legacyDate } from "./client-prices-import";
import { normalizeSiteName } from "./sites-import";
export { LEGACY_CLIENTS_FILE_HEADER } from "./legacy-history";
import {
  legacyCriterionText,
  legacyReadings,
  legacyVerdict,
  type LegacyFileCriterion,
  type LegacyFileReading,
  type LegacyReading,
} from "./legacy-history";

/**
 * Lot 5B, HA3 (RETOUR-LABO-20-11.md §6) — « Importer l'historique de
 * l'ancien logiciel », in two steps, each analysed before it writes:
 *
 *   1. « Rattacher les clients » (`clients.csv`): each client of the old
 *      software that owns a reported sample is matched to ours — the ICE
 *      (digits), when it names one client (or, shared by several, one of the
 *      same name), else the normalised name when it names one client and
 *      only one. A client merged into another (or attached as its site)
 *      stands for the one it was merged into. Only these CERTAIN matches are
 *      written (`LegacyClientLink`); an ambiguous name (several fiches) is
 *      never guessed — the administrator decides it by hand (a fiche, or
 *      « ne pas reprendre »), and so for a client not found. A link already
 *      made is never rewritten by the import.
 *   2. « Importer un mois » (`historique-AAAA-MM.ndjson`, one per call): a
 *      sample comes in only through its client's link — no link, not
 *      written (« client non rattaché »), a link « ne pas reprendre », not
 *      written either. Its id is the old software's (LIN_BON_COMMANDE.ID_LIGNE):
 *      the same file twice writes nothing; a line changed in the old
 *      software (an amendment, a cancellation) has another hash and is
 *      rewritten — never a row of the LIMS. A sample the old software
 *      cancelled after its import is hidden (`cancelled`), never shown.
 *
 * Pure: the route (/api/admin/import/historique) reads the database, asks
 * these plans, then writes them in one transaction per call.
 */

/** The route's ceiling, the one of the other imports (8 Mo — nginx accepts 10). */
export const MAX_FILE_CHARS = 8 * 1024 * 1024;
/** The file kind and version `extract-legacy-history.py` writes on the first line. */
export const HISTORY_FILE_KIND = "qualilab-historique-ancien";
export const HISTORY_FILE_VERSION = 1;

const MAX_ID = 2_147_483_647;
const EXAMPLES = 20;

const positiveInt = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value > 0 && value <= MAX_ID ? value : null;
const optionalInt = (value: unknown): number | null => (typeof value === "number" && Number.isInteger(value) ? value : null);
const str = (value: unknown, max: number): string | null => {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text.slice(0, max) : null;
};
const id = (value: string | undefined): number | null => {
  const text = (value ?? "").trim();
  return /^\d+$/.test(text) ? positiveInt(Number(text)) : null;
};

// ---- step 1: the clients ----------------------------------------------------------------

export type LegacyClientRow = { line: number; legacyClientId: number; name: string; ice: string; samples: number; firstYear: number | null; lastYear: number | null };

/** `clients.csv` read: the rows kept, and the lines refused with their reason. */
export function readLegacyClients(text: string): { rows: LegacyClientRow[]; rejected: { line: number; reason: string }[] } | { error: string } {
  const table = parseCsv(text, detectDelimiter(text));
  const header = (table[0] ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name.toLowerCase());
  const at = { id: col("legacyClientId"), name: col("client"), ice: col("ice"), samples: col("echantillons"), first: col("premiereAnnee"), last: col("derniereAnnee") };
  if (at.id < 0 || at.name < 0) return { error: "Colonnes introuvables : la première ligne doit nommer au moins « legacyClientId » et « client »." };
  const rows: LegacyClientRow[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<number>();
  table.slice(1).forEach((cells, index) => {
    const line = index + 2;
    if (cells.every((c) => !c.trim())) return;
    const legacyClientId = id(cells[at.id]);
    const name = (cells[at.name] ?? "").trim();
    if (legacyClientId === null) return rejected.push({ line, reason: "Identifiant du client manquant ou invalide." });
    if (!name) return rejected.push({ line, reason: "Nom du client manquant." });
    if (seen.has(legacyClientId)) return rejected.push({ line, reason: "Client en double dans le fichier." });
    seen.add(legacyClientId);
    const year = (i: number) => (i >= 0 ? id(cells[i]) : null);
    rows.push({
      line,
      legacyClientId,
      name: name.slice(0, 191),
      ice: at.ice >= 0 ? (cells[at.ice] ?? "").trim() : "",
      samples: (at.samples >= 0 ? id(cells[at.samples]) : null) ?? 0,
      firstYear: year(at.first),
      lastYear: year(at.last),
    });
  });
  return { rows, rejected };
}

export type HistoryClient = { id: string; name: string; ice: string | null; archived: boolean; mergedIntoId: string | null };
export type ExistingLink = { legacyClientId: number; clientId: string | null; matchedBy: LegacyLinkSource };

export type ClientCandidate = { id: string; name: string; ice: string | null; archived: boolean };
export type LegacyClientMatch =
  | { status: "certain"; clientId: string; by: "ICE" | "NOM" }
  | { status: "ambiguous"; candidates: ClientCandidate[] }
  | { status: "missing" };

const iceDigits = (ice: string | null | undefined) => (ice ?? "").replace(/\D/g, "");
/** An ICE is 15 digits; a scrap (« 0 », a phone number cut) never identifies a client. */
const usableIce = (digits: string) => digits.length >= 9 && !/^0+$/.test(digits);

/**
 * The client lookup of step 1 — stricter than the prices' (`LegacyClientResolver`,
 * client-prices-import.ts): two fiches of the same name are ambiguous even
 * when one is archived; the history of one client must never reach another.
 */
export class HistoryClientResolver {
  private readonly byId: Map<string, HistoryClient>;
  private readonly byIce = new Map<string, Set<string>>();
  private readonly byName = new Map<string, Set<string>>();

  constructor(clients: readonly HistoryClient[]) {
    this.byId = new Map(clients.map((c) => [c.id, c]));
    for (const c of clients) {
      const digits = iceDigits(c.ice);
      if (usableIce(digits)) add(this.byIce, digits, c.id);
      const name = normalizeSiteName(c.name);
      if (name) add(this.byName, name, c.id);
    }
  }

  /** The record a merged (or attached) client now lives in. */
  kept(clientId: string): HistoryClient | null {
    let current = this.byId.get(clientId) ?? null;
    for (let hop = 0; current?.mergedIntoId && hop < 20; hop += 1) {
      const next = this.byId.get(current.mergedIntoId);
      if (!next) break;
      current = next;
    }
    return current;
  }

  private keptOf(ids: Iterable<string>): HistoryClient[] {
    const kept = new Map<string, HistoryClient>();
    for (const clientId of ids) {
      const record = this.kept(clientId);
      if (record) kept.set(record.id, record);
    }
    return [...kept.values()];
  }

  resolve(row: Pick<LegacyClientRow, "name" | "ice">): LegacyClientMatch {
    const digits = iceDigits(row.ice);
    const name = normalizeSiteName(row.name);
    if (usableIce(digits)) {
      const found = this.keptOf(this.byIce.get(digits) ?? []);
      if (found.length === 1) return { status: "certain", clientId: found[0].id, by: "ICE" };
      if (found.length > 1) {
        // A company and its establishments share the ICE: the name decides among them, or nobody does.
        const named = found.filter((c) => normalizeSiteName(c.name) === name);
        if (named.length === 1) return { status: "certain", clientId: named[0].id, by: "ICE" };
        return { status: "ambiguous", candidates: found.map(candidate) };
      }
    }
    const found = name ? this.keptOf(this.byName.get(name) ?? []) : [];
    if (found.length === 1) return { status: "certain", clientId: found[0].id, by: "NOM" };
    if (found.length > 1) return { status: "ambiguous", candidates: found.map(candidate) };
    return { status: "missing" };
  }
}

const candidate = (c: HistoryClient): ClientCandidate => ({ id: c.id, name: c.name, ice: c.ice, archived: c.archived });

function add(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

export type ClientLinkPlan = {
  rows: number;
  counts: { certain: number; byIce: number; byName: number; ambiguous: number; missing: number; linked: number; excluded: number; rejected: number };
  /** The samples the certain and already-linked clients bring (as the file counts them). */
  samples: { linked: number; certain: number; waiting: number };
  /** The links to write: certain, not linked yet. */
  writes: { legacyClientId: number; legacyName: string; clientId: string; matchedBy: "ICE" | "NOM" }[];
  ambiguous: { legacyClientId: number; name: string; ice: string; samples: number; candidates: ClientCandidate[] }[];
  missing: { legacyClientId: number; name: string; ice: string; samples: number }[];
  certainExamples: { legacyClientId: number; name: string; client: string; by: "ICE" | "NOM"; samples: number }[];
  rejected: { line: number; reason: string }[];
};

/** Step 1's plan. A link already made (automatic or by hand) is kept as it is. */
export function planLegacyClientLinks(
  rows: readonly LegacyClientRow[],
  rejected: readonly { line: number; reason: string }[],
  db: { clients: readonly HistoryClient[]; links: readonly ExistingLink[] }
): ClientLinkPlan {
  const resolver = new HistoryClientResolver(db.clients);
  const links = new Map(db.links.map((l) => [l.legacyClientId, l]));
  const names = new Map(db.clients.map((c) => [c.id, c.name]));
  const plan: ClientLinkPlan = {
    rows: rows.length + rejected.length,
    counts: { certain: 0, byIce: 0, byName: 0, ambiguous: 0, missing: 0, linked: 0, excluded: 0, rejected: rejected.length },
    samples: { linked: 0, certain: 0, waiting: 0 },
    writes: [],
    ambiguous: [],
    missing: [],
    certainExamples: [],
    rejected: [...rejected],
  };
  for (const row of rows) {
    const link = links.get(row.legacyClientId);
    if (link) {
      if (link.clientId === null) plan.counts.excluded += 1;
      else {
        plan.counts.linked += 1;
        plan.samples.linked += row.samples;
      }
      continue;
    }
    const match = resolver.resolve(row);
    if (match.status === "certain") {
      plan.counts.certain += 1;
      plan.counts[match.by === "ICE" ? "byIce" : "byName"] += 1;
      plan.samples.certain += row.samples;
      plan.writes.push({ legacyClientId: row.legacyClientId, legacyName: row.name, clientId: match.clientId, matchedBy: match.by });
      if (plan.certainExamples.length < EXAMPLES * 5) {
        plan.certainExamples.push({ legacyClientId: row.legacyClientId, name: row.name, client: names.get(match.clientId) ?? "", by: match.by, samples: row.samples });
      }
      continue;
    }
    plan.samples.waiting += row.samples;
    if (match.status === "ambiguous") {
      plan.counts.ambiguous += 1;
      plan.ambiguous.push({ legacyClientId: row.legacyClientId, name: row.name, ice: row.ice, samples: row.samples, candidates: match.candidates });
    } else {
      plan.counts.missing += 1;
      plan.missing.push({ legacyClientId: row.legacyClientId, name: row.name, ice: row.ice, samples: row.samples });
    }
  }
  // The clients with the most samples first: those the administrator decides first.
  plan.ambiguous.sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name, "fr"));
  plan.missing.sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name, "fr"));
  return plan;
}

// ---- step 2: a month --------------------------------------------------------------------

export type HistoryFileHeader = { month: string; part: number; parts: number; lines: number; extractedAt: string | null };

export type FileResult = {
  id: number;
  position: number;
  parameter: string;
  method: string | null;
  unit: string | null;
  value: string | null;
  readings: LegacyReading[];
  criterion: string | null;
  interpretation: Interpretation | null;
};

export type FileSample = {
  id: number;
  legacyClientId: number;
  legacySiteId: number | null;
  serieNumber: string | null;
  controlNumber: string | null;
  year: number;
  nature: string | null;
  productType: string | null;
  designation: string | null;
  lot: string | null;
  place: string | null;
  sampledAt: Date | null;
  receivedAt: Date | null;
  reportNumber: string | null;
  reportedAt: Date | null;
  interpretation: Interpretation | null;
  verdictLabel: string | null;
  conclusion: string | null;
  observation: string | null;
  amendmentNote: string | null;
  results: FileResult[];
  sourceHash: string;
};

export type FileLine = { line: number; cancelled: true; id: number; sourceHash: string } | { line: number; cancelled: false; sample: FileSample };

export type ParsedHistoryFile = { header: HistoryFileHeader; lines: FileLine[]; rejected: { line: number; reason: string }[] };

/** SHA-256 of a line of the file — what tells a changed sample from an unchanged one. */
export const lineHash = (raw: string) => createHash("sha256").update(raw).digest("hex");

const TEXT = 65_000;

/** One analysis of a line, read; null when it is no analysis. */
function readResult(value: unknown, format: string | null, fallbackPosition: number): FileResult | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const resultId = positiveInt(r.id);
  if (resultId === null) return null;
  const readings = Array.isArray(r.readings) ? (r.readings.filter((x) => x && typeof x === "object") as LegacyFileReading[]) : [];
  const read = legacyReadings(readings, format);
  return {
    id: resultId,
    // The report's order when the old software kept one, else the order of the file.
    position: optionalInt(r.pos) ?? 100_000 + fallbackPosition,
    parameter: str(r.parameter, 255) ?? "Analyse sans libellé",
    method: str(r.method, 255),
    unit: str(r.unit, 64),
    value: read.value,
    readings: read.readings,
    criterion: legacyCriterionText(r.criterion as LegacyFileCriterion | null, readings.length),
    interpretation: read.interpretation,
  };
}

/** A line's date: « 2026-09-07 » or « 2026-09-07T09:00:00 », the lab's wall clock. */
function lineDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  return legacyDate(value.length === 10 ? `${value} 00:00:00` : value.replace("T", " "));
}

/**
 * A monthly file read. The first line is the header; each other line one
 * sample (or a cancelled one's stub). A line that cannot be read is refused
 * with its number, the others kept.
 */
export function readHistoryFile(text: string): ParsedHistoryFile | { error: string } {
  const raw = text.replace(/^﻿/, "").split(/\r?\n/);
  let header: HistoryFileHeader | null = null;
  try {
    const h = JSON.parse(raw[0] ?? "") as Record<string, unknown>;
    if (h && h.kind === HISTORY_FILE_KIND) {
      if (h.version !== HISTORY_FILE_VERSION) return { error: `Version de fichier ${String(h.version)} inconnue : relancez l'extraction avec le script de cette version.` };
      if (typeof h.month === "string" && /^\d{4}-\d{2}$/.test(h.month)) {
        header = {
          month: h.month,
          part: positiveInt(h.part) ?? 1,
          parts: positiveInt(h.parts) ?? 1,
          lines: optionalInt(h.lines) ?? 0,
          extractedAt: typeof h.extractedAt === "string" ? h.extractedAt.slice(0, 19) : null,
        };
      }
    }
  } catch {
    header = null;
  }
  if (!header) return { error: "Ce fichier n'est pas un fichier mensuel de l'historique (première ligne inattendue) : choisissez un « historique-AAAA-MM.ndjson »." };

  const lines: FileLine[] = [];
  const rejected: { line: number; reason: string }[] = [];
  const seen = new Set<number>();
  for (let index = 1; index < raw.length; index += 1) {
    const source = raw[index];
    if (!source.trim()) continue;
    const line = index + 1;
    let value: Record<string, unknown>;
    try {
      value = JSON.parse(source);
    } catch {
      rejected.push({ line, reason: "Ligne illisible." });
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      rejected.push({ line, reason: "Ligne illisible." });
      continue;
    }
    const sampleId = positiveInt(value.id);
    if (sampleId === null) {
      rejected.push({ line, reason: "Identifiant de l'échantillon manquant." });
      continue;
    }
    if (seen.has(sampleId)) {
      rejected.push({ line, reason: "Échantillon en double dans le fichier." });
      continue;
    }
    seen.add(sampleId);
    const sourceHash = lineHash(source);
    if (value.cancelled === true) {
      lines.push({ line, cancelled: true, id: sampleId, sourceHash });
      continue;
    }
    const legacyClientId = positiveInt(value.client);
    const year = optionalInt(value.year);
    if (legacyClientId === null) {
      rejected.push({ line, reason: "Client de l'ancien logiciel manquant." });
      continue;
    }
    if (year === null || year < 2000 || year > 2100) {
      rejected.push({ line, reason: "Année manquante ou invalide." });
      continue;
    }
    const format = str(value.format, 16);
    const results = (Array.isArray(value.results) ? value.results : [])
      .map((r, i) => readResult(r, format, i))
      .filter((r): r is FileResult => r !== null)
      // The report's order (as the screens read them back, `position` then id).
      .sort((a, b) => a.position - b.position || a.id - b.id);
    const verdict = legacyVerdict(optionalInt(value.verdict));
    lines.push({
      line,
      cancelled: false,
      sample: {
        id: sampleId,
        legacyClientId,
        legacySiteId: positiveInt(value.site),
        serieNumber: str(value.serie, 32),
        controlNumber: str(value.control, 32),
        year,
        nature: str(value.nature, 191),
        productType: str(value.productType, 191),
        designation: str(value.designation, 255),
        lot: str(value.lot, 191),
        place: str(value.place, 255),
        sampledAt: lineDate(value.sampledAt),
        receivedAt: lineDate(value.receivedAt),
        reportNumber: str(value.reportNumber, 32),
        reportedAt: lineDate(value.reportedAt),
        interpretation: verdict?.interpretation ?? null,
        verdictLabel: verdict?.label ?? null,
        conclusion: str(value.conclusion, TEXT),
        observation: str(value.observation, TEXT),
        amendmentNote: str(value.amendment, TEXT),
        results,
        sourceHash,
      },
    });
  }
  return { header, lines, rejected };
}

export type ExistingLegacySample = { id: number; sourceHash: string; clientId: string; siteId: string | null; cancelled: boolean };
export type LinkTarget = { clientId: string | null; siteId: string | null };
export type SiteByLegacy = { id: string; clientId: string };

export type MonthCategory = "create" | "update" | "unchanged" | "hide" | "cancelledSkipped" | "clientNotLinked" | "clientExcluded" | "rejected";
export const MONTH_CATEGORIES: readonly MonthCategory[] = ["create", "update", "unchanged", "hide", "cancelledSkipped", "clientNotLinked", "clientExcluded", "rejected"];

/** A sample to write, with the client and site it goes to. */
export type PlannedLegacySample = FileSample & { clientId: string; siteId: string | null };

export type MonthPlan = {
  header: HistoryFileHeader;
  lines: number;
  counts: Record<MonthCategory, number>;
  /** Analyses of the samples to write. */
  results: number;
  create: PlannedLegacySample[];
  /** Rewritten: deleted then created again (their results with them). */
  update: PlannedLegacySample[];
  /** Imported before, cancelled since in the old software. */
  hide: number[];
  /** The old software's clients whose samples wait for a link, most samples first. */
  notLinked: { legacyClientId: number; samples: number }[];
  rejected: { line: number; reason: string }[];
};

/**
 * Step 2's plan for one file. The site of a sample: the old software's site
 * of its visit when we imported it as a site of that same client
 * (`Site.legacyId`), else the link's site (a client attached as a site),
 * else none (« Siège »).
 */
export function planLegacyMonth(
  file: ParsedHistoryFile,
  db: { existing: ReadonlyMap<number, ExistingLegacySample>; links: ReadonlyMap<number, LinkTarget>; sites: ReadonlyMap<number, SiteByLegacy> }
): MonthPlan {
  const counts = Object.fromEntries(MONTH_CATEGORIES.map((c) => [c, 0])) as Record<MonthCategory, number>;
  counts.rejected = file.rejected.length;
  const plan: MonthPlan = { header: file.header, lines: file.lines.length + file.rejected.length, counts, results: 0, create: [], update: [], hide: [], notLinked: [], rejected: [...file.rejected] };
  const waiting = new Map<number, number>();
  for (const line of file.lines) {
    if (line.cancelled) {
      const existing = db.existing.get(line.id);
      if (!existing) counts.cancelledSkipped += 1;
      else if (existing.cancelled) counts.unchanged += 1;
      else {
        counts.hide += 1;
        plan.hide.push(line.id);
      }
      continue;
    }
    const sample = line.sample;
    const link = db.links.get(sample.legacyClientId);
    if (!link) {
      counts.clientNotLinked += 1;
      waiting.set(sample.legacyClientId, (waiting.get(sample.legacyClientId) ?? 0) + 1);
      continue;
    }
    if (link.clientId === null) {
      counts.clientExcluded += 1;
      continue;
    }
    const site = sample.legacySiteId !== null ? db.sites.get(sample.legacySiteId) : undefined;
    const siteId = site && site.clientId === link.clientId ? site.id : link.siteId;
    const planned: PlannedLegacySample = { ...sample, clientId: link.clientId, siteId };
    const existing = db.existing.get(sample.id);
    if (!existing) {
      counts.create += 1;
      plan.create.push(planned);
    } else if (existing.sourceHash !== sample.sourceHash || existing.clientId !== link.clientId || existing.siteId !== siteId || existing.cancelled) {
      counts.update += 1;
      plan.update.push(planned);
    } else {
      counts.unchanged += 1;
      continue;
    }
    plan.results += sample.results.length;
  }
  plan.notLinked = [...waiting.entries()].map(([legacyClientId, samples]) => ({ legacyClientId, samples })).sort((a, b) => b.samples - a.samples);
  return plan;
}

/** Whether the plan writes anything. */
export const monthPlanWrites = (plan: MonthPlan) => plan.create.length + plan.update.length + plan.hide.length > 0;

/** A planned sample as the LegacySample row it becomes. */
export function legacySampleRow(s: PlannedLegacySample) {
  return {
    id: s.id,
    clientId: s.clientId,
    siteId: s.siteId,
    legacyClientId: s.legacyClientId,
    serieNumber: s.serieNumber,
    controlNumber: s.controlNumber,
    year: s.year,
    nature: s.nature,
    productType: s.productType,
    designation: s.designation,
    lot: s.lot,
    place: s.place,
    sampledAt: s.sampledAt,
    receivedAt: s.receivedAt,
    reportNumber: s.reportNumber,
    reportedAt: s.reportedAt,
    interpretation: s.interpretation,
    verdictLabel: s.verdictLabel,
    conclusion: s.conclusion,
    observation: s.observation,
    amendmentNote: s.amendmentNote,
    cancelled: false,
    sourceHash: s.sourceHash,
  };
}

/** The LegacyResult rows of the planned samples. */
export function legacyResultRows(samples: readonly PlannedLegacySample[]) {
  return samples.flatMap((s) =>
    s.results.map((r) => ({
      id: r.id,
      legacySampleId: s.id,
      position: r.position,
      parameter: r.parameter,
      method: r.method,
      unit: r.unit,
      value: r.value,
      readings: r.readings,
      criterion: r.criterion,
      interpretation: r.interpretation,
    }))
  );
}

/** The plan without its rows, for the screen and the journal. */
export function summarizeMonthPlan(plan: MonthPlan) {
  return {
    header: plan.header,
    lines: plan.lines,
    counts: plan.counts,
    results: plan.results,
    notLinked: plan.notLinked.slice(0, 50),
    notLinkedClients: plan.notLinked.length,
    rejected: plan.rejected.slice(0, EXAMPLES),
  };
}
