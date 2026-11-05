import type { Family, SampleType } from "@/generated/prisma/client";
import { parameterKey } from "./criteria-import";
import { parameterKeys } from "./legacy-catalogue";
import { normalizeSiteName } from "./sites-import";
import { roundMoney } from "./invoice-math";
import { clientPriceKey, type ClientPriceOrigin } from "./client-prices";
import { fromLabWallTime } from "./lab-time";
import { formatDate } from "./labels";

/**
 * Lot 4H, H5 (RETOUR-LABO-04-11.md §5, R-4 « Oui ») — « Importer les prix
 * clients »: the ≈ 6 700 prices proper to some clients in the old software
 * (PRIX_PARAME_PARCLIENTS, exported by
 * `scripts/legacy/extract-client-prices.py`) matched to our clients and
 * analyses. Pure: the route (/api/admin/import/prix-clients) reads the
 * database, asks `planClientPriceImport`, then writes the plan.
 *
 * The client. Our clients carry no id of the old software: the client
 * reprise of 01/10 imported them by name and ICE (`clients.csv`,
 * extract-legacy.py, `/admin/import` « Clients »), the sites import of 07/10
 * matched their parent by name, and only the sites (`Site.legacyId`), the
 * product types, the places and the regulations keep a legacy id. So a
 * price's client is found, in this order:
 *   1. a site of the old software (TYPECLIENT 102) imported as our site
 *      (`Site.legacyId`): the client its samples are billed to — the site's
 *      « Facturé à », else its client (hypothèse, à confirmer par C-8 — RETOUR-LABO-04-11.md
 *      §7); a site not imported: its parent client, by name;
 *   2. the ICE (digits only), when it names one client;
 *   3. the name, as the sites import compares them (`normalizeSiteName`),
 *      when it names one client — an active one before an archived one.
 * A client merged into another one (or attached as its site) stands for the
 * client it was merged into (`mergedIntoId`, followed).
 *
 * The analysis. A price of the old software is for a PARAMETRES row — a
 * parameter within a type d'analyse (ID_ECHANTILLION). The type d'analyse is
 * our `AnalysisNature` (`legacyId`), whose domain (`legacyType`) and family
 * narrow the search; the parameter is found by its name or one of its
 * aliases (`parameterKeys`), the rule of the catalogue reprise (names
 * before aliases, the nature's family first). No type d'analyse (0): the
 * slice J rule — food first, then water, then the environment.
 *
 * What is not taken (each counted and listed on the screen, the report of
 * RETOUR-LABO-04-11.md §5 H5):
 *   - a price of 0 — no price of its own: the catalogue's applies
 *     (hypothèse, à confirmer par C-8; 1 937 rows on 05/11);
 *   - with `skipLegacyTariff` (`CLIENT_PRICE_SKIP_LEGACY_TARIFF`), a price
 *     equal to the old software's own tariff for the analysis (« tarifAncien »,
 *     PARAMETRES.PRIX): a list price, not a negotiated one — the client
 *     follows the catalogue (hypothèse, à confirmer par C-8; 3 007 rows);
 *   - a client or an analysis not found, or a client whose name is ambiguous;
 *   - a second price for the same client and analysis (two types d'analyse
 *     of the same domain, a site's price going to the client billed for it,
 *     two old clients merged into one of ours): with `ownBeforeSite`
 *     (`CLIENT_PRICE_OWN_BEFORE_SITE`) the client's own price wins over a
 *     site's, then the most recently changed one is kept; the others are
 *     « doublons », each conflict listed (hypothèse, à confirmer par C-8).
 *
 * Idempotent: a price already taken over and unchanged is left alone, a
 * changed one updated; a price typed on the client's fiche (SAISIE) is never
 * overwritten, and a price removed by hand on the fiche (`removedAt`) never
 * comes back.
 */

/** The file's first line, as `extract-client-prices.py` writes it. */
export const CLIENT_PRICE_FILE_HEADER =
  "legacyPriceId;legacyClientId;clientType;client;ice;clientObsolete;legacyParentId;parent;legacyParamId;legacyNatureId;parametre;prix;derniereModification;tarifAncien";

/** The rules of the plan that wait for C-8 — the switches of lab-proposals.ts. */
export type ClientPriceImportOptions = {
  /** `CLIENT_PRICE_SKIP_LEGACY_TARIFF`: a price equal to the old tariff is not taken. */
  skipLegacyTariff: boolean;
  /** `CLIENT_PRICE_OWN_BEFORE_SITE`: between two prices, the client's own before a site's. */
  ownBeforeSite: boolean;
};

const COLUMNS = [
  "legacyPriceId",
  "legacyClientId",
  "clientType",
  "client",
  "ice",
  "clientObsolete",
  "legacyParentId",
  "parent",
  "legacyParamId",
  "legacyNatureId",
  "parametre",
  "prix",
  "derniereModification",
  "tarifAncien",
] as const;
type Column = (typeof COLUMNS)[number];
const REQUIRED: Column[] = ["legacyPriceId", "legacyClientId", "client", "parametre", "prix"];

/** The old software's type of a « client » row that is a site of another one. */
export const LEGACY_SITE_TYPE = 102;

const MAX_LEGACY_ID = 2_147_483_647;
/** A price beyond an invoice line's bound is an error in the old base, not a price. */
const MAX_PRICE = 10_000_000;

export type LegacyClientPrice = {
  line: number;
  legacyPriceId: number;
  legacyClientId: number;
  clientType: number | null;
  client: string;
  ice: string;
  legacyParentId: number | null;
  parent: string;
  legacyParamId: number | null;
  legacyNatureId: number | null;
  parameter: string;
  price: number;
  modifiedAt: Date | null;
  /** The old software's own tariff for the analysis (PARAMETRES.PRIX); null when the file has none, or 0. */
  legacyTariff: number | null;
};

export type RejectedPriceRow = { line: number; client: string; parameter: string; reason: string };

/** Index of each column in the header, or null when a required one is missing. */
export function clientPriceColumns(header: readonly string[]): Record<Column, number> | null {
  const key = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  const found = Object.fromEntries(COLUMNS.map((column) => [column, header.findIndex((h) => key(h) === key(column))])) as Record<Column, number>;
  return REQUIRED.every((column) => found[column] >= 0) ? found : null;
}

function id(value: string | undefined): number | null {
  const text = (value ?? "").trim();
  if (!/^\d+$/.test(text)) return null;
  const n = Number(text);
  return n > 0 && n <= MAX_LEGACY_ID ? n : null;
}

/**
 * « 2022-02-22 10:12:26 » → a Date, or null. The old software wrote the
 * laboratory's wall clock (UTC+1 before 20/09/2026): read on that clock
 * (`fromLabWallTime`, lab-time.ts), so a change made at 23 h 30 is not shown
 * the next day.
 */
export function legacyDate(value: string | undefined): Date | null {
  const m = (value ?? "").trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "00", mi = "00", s = "00"] = m;
  if (+mo < 1 || +mo > 12 || +d < 1 || +d > 31) return null;
  return fromLabWallTime(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
}

/** « 250.00 », « 249,50 », « 1 200 » → a price, or null. */
export function legacyPrice(value: string | undefined): number | null {
  const text = (value ?? "").trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return null;
  const price = roundMoney(Number(text));
  return Number.isFinite(price) && price <= MAX_PRICE ? price : null;
}

/** The data rows (header excluded), each one kept or rejected with its reason. */
export function readClientPriceRows(
  rows: readonly string[][],
  columns: Record<Column, number>
): { rows: LegacyClientPrice[]; rejected: RejectedPriceRow[] } {
  const kept: LegacyClientPrice[] = [];
  const rejected: RejectedPriceRow[] = [];
  rows.forEach((cells, index) => {
    const line = index + 2;
    const cell = (column: Column) => (columns[column] >= 0 ? (cells[columns[column]] ?? "").trim() : "");
    const client = cell("client");
    const parameter = cell("parametre");
    const reject = (reason: string) => rejected.push({ line, client, parameter, reason });
    const legacyPriceId = id(cell("legacyPriceId"));
    const legacyClientId = id(cell("legacyClientId"));
    const price = legacyPrice(cell("prix"));
    if (legacyPriceId === null) return reject("Identifiant du prix manquant ou invalide.");
    if (legacyClientId === null) return reject("Identifiant du client manquant ou invalide.");
    if (!client) return reject("Nom du client manquant.");
    if (!parameter) return reject("Analyse manquante.");
    if (price === null) return reject(`Prix illisible « ${cell("prix")} ».`);
    kept.push({
      line,
      legacyPriceId,
      legacyClientId,
      clientType: id(cell("clientType")),
      client,
      ice: cell("ice"),
      legacyParentId: id(cell("legacyParentId")),
      parent: cell("parent"),
      legacyParamId: id(cell("legacyParamId")),
      legacyNatureId: id(cell("legacyNatureId")),
      parameter,
      price,
      modifiedAt: legacyDate(cell("derniereModification")),
      legacyTariff: (() => {
        const tariff = legacyPrice(cell("tarifAncien"));
        return tariff !== null && tariff > 0 ? tariff : null;
      })(),
    });
  });
  return { rows: kept, rejected };
}

// ---- what the database knows ----------------------------------------------------------

export type PriceImportClient = { id: string; name: string; ice: string | null; archived: boolean; mergedIntoId: string | null };
export type PriceImportSite = { legacyId: number | null; clientId: string; billingClientId: string | null };
export type PriceImportParameter = { id: string; name: string; aliases: string | null; category: SampleType; family: Family };
export type PriceImportNature = { legacyId: number | null; category: SampleType; family: Family };
export type ExistingClientPrice = {
  id: string;
  clientId: string;
  itemKey: string;
  unitPrice: number;
  origin: ClientPriceOrigin;
  legacyPriceId: number | null;
  /** Removed by hand on the fiche: the reprise never brings it back. */
  removedAt: Date | null;
};

export type PriceImportDb = {
  clients: readonly PriceImportClient[];
  sites: readonly PriceImportSite[];
  parameters: readonly PriceImportParameter[];
  natures: readonly PriceImportNature[];
  existing: readonly ExistingClientPrice[];
};

const icDigits = (ice: string | null) => (ice ?? "").replace(/\D/g, "");
/** An ICE is 15 digits; shorter scraps (« 0 », a phone number cut) never identify a client. */
const usableIce = (digits: string) => digits.length >= 9 && !/^0+$/.test(digits);

export type ClientMatch =
  | { status: "found"; clientId: string; by: "site" | "ice" | "nom" | "parent" }
  | { status: "ambiguous"; candidates: string[] }
  | { status: "missing" };

/** The client lookup of the plan — built once, asked once per old client. */
export class LegacyClientResolver {
  private readonly byId: Map<string, PriceImportClient>;
  private readonly byIce = new Map<string, Set<string>>();
  private readonly byName = new Map<string, Set<string>>();
  private readonly siteByLegacy = new Map<number, PriceImportSite>();

  constructor(clients: readonly PriceImportClient[], sites: readonly PriceImportSite[]) {
    this.byId = new Map(clients.map((c) => [c.id, c]));
    for (const c of clients) {
      const digits = icDigits(c.ice);
      if (usableIce(digits)) add(this.byIce, digits, c.id);
      const name = normalizeSiteName(c.name);
      if (name) add(this.byName, name, c.id);
    }
    for (const s of sites) if (s.legacyId !== null) this.siteByLegacy.set(s.legacyId, s);
  }

  /** The record a merged (or attached) client now lives in. */
  kept(clientId: string): PriceImportClient | null {
    let current = this.byId.get(clientId) ?? null;
    for (let hop = 0; current?.mergedIntoId && hop < 20; hop += 1) {
      const next = this.byId.get(current.mergedIntoId);
      if (!next) break;
      current = next;
    }
    return current;
  }

  /** The kept records of some clients, active ones first when any. */
  private pick(ids: Iterable<string>): PriceImportClient[] {
    const kept = new Map<string, PriceImportClient>();
    for (const id of ids) {
      const record = this.kept(id);
      if (record) kept.set(record.id, record);
    }
    const all = [...kept.values()];
    const active = all.filter((c) => !c.archived);
    return active.length > 0 ? active : all;
  }

  private byNameOf(name: string): ClientMatch {
    const found = this.pick(this.byName.get(normalizeSiteName(name)) ?? []);
    if (found.length === 1) return { status: "found", clientId: found[0].id, by: "nom" };
    if (found.length > 1) return { status: "ambiguous", candidates: found.map((c) => c.name) };
    return { status: "missing" };
  }

  resolve(row: Pick<LegacyClientPrice, "legacyClientId" | "clientType" | "client" | "ice" | "parent">): ClientMatch {
    if (row.clientType === LEGACY_SITE_TYPE) {
      const site = this.siteByLegacy.get(row.legacyClientId);
      if (site) {
        const kept = this.kept(site.billingClientId ?? site.clientId);
        if (kept) return { status: "found", clientId: kept.id, by: "site" };
      }
      if (row.parent) {
        const parent = this.byNameOf(row.parent);
        return parent.status === "found" ? { ...parent, by: "parent" } : parent;
      }
    }
    const digits = icDigits(row.ice);
    if (usableIce(digits)) {
      const found = this.pick(this.byIce.get(digits) ?? []);
      if (found.length === 1) return { status: "found", clientId: found[0].id, by: "ice" };
      if (found.length > 1) {
        // Several clients share the ICE (a company and its establishments): the name decides among them.
        const name = normalizeSiteName(row.client);
        const named = found.filter((c) => normalizeSiteName(c.name) === name);
        if (named.length === 1) return { status: "found", clientId: named[0].id, by: "ice" };
      }
    }
    return this.byNameOf(row.client);
  }
}

function add(map: Map<string, Set<string>>, key: string, value: string) {
  const set = map.get(key) ?? new Set<string>();
  set.add(value);
  map.set(key, set);
}

const CATEGORIES: SampleType[] = ["ALIMENTAIRE", "EAU", "AMBIANCE"];

/** The analysis lookup of the plan: the catalogue reprise's rule (`ParameterResolver`, legacy-catalogue.ts). */
export class LegacyParameterResolver {
  private readonly index = new Map<SampleType, Map<string, PriceImportParameter[]>>(CATEGORIES.map((c) => [c, new Map()]));
  private readonly natures: Map<number, PriceImportNature>;

  constructor(parameters: readonly PriceImportParameter[], natures: readonly PriceImportNature[]) {
    this.natures = new Map(natures.flatMap((n) => (n.legacyId !== null ? [[n.legacyId, n] as const] : [])));
    // Names before aliases: a germ named « Levures » wins over another's alias.
    for (const aliases of [false, true]) {
      for (const p of parameters) {
        const keys = parameterKeys(p.name, p.aliases);
        const index = this.index.get(p.category)!;
        for (const key of aliases ? keys.slice(1) : keys.slice(0, 1)) {
          const list = index.get(key) ?? [];
          if (!list.includes(p)) list.push(p);
          index.set(key, list);
        }
      }
    }
  }

  private find(category: SampleType, family: Family | null, key: string): PriceImportParameter | null {
    const list = this.index.get(category)!.get(key);
    if (!list || list.length === 0) return null;
    return (family ? list.find((p) => p.family === family) : undefined) ?? list[0];
  }

  /** Our analysis for a parameter of the old software and its type d'analyse, or the reason it has none. */
  resolve(label: string, legacyNatureId: number | null): { parameter: PriceImportParameter } | { reason: string } {
    const key = parameterKey(label).key;
    if (!key) return { reason: "Libellé d'analyse illisible." };
    const nature = legacyNatureId !== null ? this.natures.get(legacyNatureId) : undefined;
    if (nature) {
      const found = this.find(nature.category, nature.family, key);
      return found ? { parameter: found } : { reason: "Analyse absente du catalogue pour ce type d'analyse." };
    }
    // No type d'analyse (or one the reprise did not bring): food first, micro first.
    for (const category of CATEGORIES) {
      const found = this.find(category, "MICRO", key);
      if (found) return { parameter: found };
    }
    return { reason: legacyNatureId === null ? "Analyse sans type d'analyse, absente du catalogue." : "Type d'analyse inconnu et analyse absente du catalogue." };
  }
}

// ---- the plan ------------------------------------------------------------------------

export type PriceImportCategory =
  | "create"
  | "update"
  | "unchanged"
  | "keptManual"
  | "keptRemoved"
  | "zeroPrice"
  | "sameAsLegacyTariff"
  | "clientNotFound"
  | "clientAmbiguous"
  | "analysisNotFound"
  | "duplicate"
  | "rejected";

export const PRICE_IMPORT_CATEGORIES: readonly PriceImportCategory[] = [
  "create",
  "update",
  "unchanged",
  "keptManual",
  "keptRemoved",
  "zeroPrice",
  "sameAsLegacyTariff",
  "clientNotFound",
  "clientAmbiguous",
  "analysisNotFound",
  "duplicate",
  "rejected",
];

export type PriceImportExample = {
  line: number;
  client: string;
  parameter: string;
  price: number | null;
  detail: string;
};

/** A price of the file kept for writing. */
export type PlannedClientPrice = {
  clientId: string;
  parameterId: string;
  itemKey: string;
  unitPrice: number;
  legacyPriceId: number;
  legacyClientId: number;
  legacyModifiedAt: Date | null;
  /** The row to update, null for a new one. */
  existingId: string | null;
};

/** One old client the import did not place, with how many prices it holds. */
export type MissingClient = { legacyClientId: number; name: string; prices: number; reason: "introuvable" | "ambigu" };
/** One analysis of the old software the import did not place. */
export type MissingAnalysis = { label: string; legacyNatureId: number | null; prices: number; reason: string };

/** One price of a conflict, as the screen lists it. */
export type ConflictPrice = {
  line: number;
  price: number;
  /** The old software's row it came from: the client itself, or one of its sites. */
  source: "client" | "site";
  /** The old software's client (or site) name, as the file has it. */
  legacyName: string;
  legacyNatureId: number | null;
  /** « 22/02/2022 », or null. */
  modifiedOn: string | null;
};

/** Several prices of the old software at different prices for one client and analysis of ours. */
export type PriceConflict = { client: string; analysis: string; kept: ConflictPrice; others: ConflictPrice[] };

export type ClientPricePlan = {
  rows: number;
  counts: Record<PriceImportCategory, number>;
  /** Rows matched to a client and an analysis (written, unchanged, kept or duplicate). */
  matched: number;
  /** Duplicates whose price differs from the one kept. */
  conflicts: number;
  /** Those conflicts, one per client and analysis (the first ones). */
  conflictList: PriceConflict[];
  /** The rule that chose among them, in French. */
  duplicateRule: string;
  /**
   * The non-zero prices equal to the old software's tariff (« tarifAncien »),
   * whether skipped (`skipLegacyTariff`) or taken; `withTariff`: those the
   * file gives a tariff for.
   */
  legacyTariff: { equal: number; withTariff: number; skipped: boolean };
  clients: { matched: number; notFound: number; ambiguous: number; bySite: number; byIce: number; byName: number };
  /** Of the matched clients, how many are archived records with no kept fiche to follow. */
  archivedClients: number;
  missingClients: MissingClient[];
  missingAnalyses: MissingAnalysis[];
  examples: Record<PriceImportCategory, PriceImportExample[]>;
  writes: PlannedClientPrice[];
};

const MAX_EXAMPLES = 50;
const MAX_MISSING = 200;

const isSiteRow = (row: Pick<LegacyClientPrice, "clientType">) => row.clientType === LEGACY_SITE_TYPE;

/**
 * Whether `a` is kept over `b` when the same client and analysis come twice
 * (C-8 (c)): with `ownBeforeSite`, the client's own price before a site's;
 * then the newest change, then the newest row.
 */
export function preferredPrice(a: LegacyClientPrice, b: LegacyClientPrice, ownBeforeSite: boolean): boolean {
  if (ownBeforeSite && isSiteRow(a) !== isSiteRow(b)) return !isSiteRow(a);
  const ta = a.modifiedAt?.getTime() ?? 0;
  const tb = b.modifiedAt?.getTime() ?? 0;
  return ta !== tb ? ta > tb : a.legacyPriceId > b.legacyPriceId;
}

/** Whether a price only repeats the old software's tariff for the analysis. */
export function equalsLegacyTariff(row: Pick<LegacyClientPrice, "price" | "legacyTariff">): boolean {
  return row.legacyTariff !== null && row.price > 0 && Math.round(row.price * 100) === Math.round(row.legacyTariff * 100);
}

const conflictPrice = (row: LegacyClientPrice): ConflictPrice => ({
  line: row.line,
  price: row.price,
  source: isSiteRow(row) ? "site" : "client",
  legacyName: row.client,
  legacyNatureId: row.legacyNatureId,
  modifiedOn: row.modifiedAt ? formatDate(row.modifiedAt) : null,
});

export const DEFAULT_CLIENT_PRICE_IMPORT_OPTIONS: ClientPriceImportOptions = { skipLegacyTariff: true, ownBeforeSite: true };

export function planClientPriceImport(
  rows: readonly LegacyClientPrice[],
  rejected: readonly RejectedPriceRow[],
  db: PriceImportDb,
  options: ClientPriceImportOptions = DEFAULT_CLIENT_PRICE_IMPORT_OPTIONS
): ClientPricePlan {
  const counts = Object.fromEntries(PRICE_IMPORT_CATEGORIES.map((c) => [c, 0])) as Record<PriceImportCategory, number>;
  const examples = Object.fromEntries(PRICE_IMPORT_CATEGORIES.map((c) => [c, [] as PriceImportExample[]])) as Record<
    PriceImportCategory,
    PriceImportExample[]
  >;
  const note = (category: PriceImportCategory, example: PriceImportExample) => {
    counts[category] += 1;
    if (examples[category].length < MAX_EXAMPLES) examples[category].push(example);
  };
  for (const r of rejected) note("rejected", { line: r.line, client: r.client, parameter: r.parameter, price: null, detail: r.reason });

  const clients = new LegacyClientResolver(db.clients, db.sites);
  const parameters = new LegacyParameterResolver(db.parameters, db.natures);
  const clientName = new Map(db.clients.map((c) => [c.id, c.name]));
  const archived = new Set(db.clients.filter((c) => c.archived).map((c) => c.id));

  // One answer per old client, whatever the number of its prices.
  const clientMatches = new Map<number, ClientMatch>();
  const missingClients = new Map<number, MissingClient>();
  const missingAnalyses = new Map<string, MissingAnalysis>();
  const groups = new Map<string, { row: LegacyClientPrice; clientId: string; parameter: PriceImportParameter }[]>();
  const existingByKey = new Map(db.existing.map((e) => [`${e.clientId}|${e.itemKey}`, e]));
  const existingByLegacy = new Map(db.existing.flatMap((e) => (e.legacyPriceId !== null ? [[e.legacyPriceId, e] as const] : [])));
  const legacyTariff = { equal: 0, withTariff: 0, skipped: options.skipLegacyTariff };

  for (const row of rows) {
    const base = { line: row.line, client: row.client, parameter: row.parameter, price: row.price };
    if (row.price <= 0) {
      note("zeroPrice", { ...base, detail: "Prix 0 : le prix du catalogue s'applique." });
      continue;
    }
    if (row.legacyTariff !== null) legacyTariff.withTariff += 1;
    if (equalsLegacyTariff(row)) {
      legacyTariff.equal += 1;
      if (options.skipLegacyTariff) {
        const taken = existingByLegacy.get(row.legacyPriceId);
        note("sameAsLegacyTariff", {
          ...base,
          detail: taken
            ? "Égal à l'ancien tarif, mais déjà repris par un import précédent : laissé tel quel (à retirer sur la fiche si le client doit suivre le catalogue)."
            : "Égal au tarif de l'ancien logiciel pour cette analyse : pas un prix négocié, le catalogue s'applique.",
        });
        continue;
      }
    }
    let match = clientMatches.get(row.legacyClientId);
    if (!match) {
      match = clients.resolve(row);
      clientMatches.set(row.legacyClientId, match);
    }
    if (match.status !== "found") {
      const ambiguous = match.status === "ambiguous";
      note(ambiguous ? "clientAmbiguous" : "clientNotFound", {
        ...base,
        detail: match.status === "ambiguous" ? `Plusieurs clients : ${match.candidates.join(" ; ")}` : "Aucun client de ce nom ni de cet ICE.",
      });
      const entry = missingClients.get(row.legacyClientId) ?? {
        legacyClientId: row.legacyClientId,
        name: row.client,
        prices: 0,
        reason: ambiguous ? ("ambigu" as const) : ("introuvable" as const),
      };
      entry.prices += 1;
      missingClients.set(row.legacyClientId, entry);
      continue;
    }
    const analysis = parameters.resolve(row.parameter, row.legacyNatureId);
    if ("reason" in analysis) {
      note("analysisNotFound", { ...base, detail: analysis.reason });
      const key = `${row.legacyNatureId ?? 0}|${row.parameter}`;
      const entry = missingAnalyses.get(key) ?? { label: row.parameter, legacyNatureId: row.legacyNatureId, prices: 0, reason: analysis.reason };
      entry.prices += 1;
      missingAnalyses.set(key, entry);
      continue;
    }
    const key = `${match.clientId}|${clientPriceKey({ parameterId: analysis.parameter.id })}`;
    const group = groups.get(key) ?? [];
    group.push({ row, clientId: match.clientId, parameter: analysis.parameter });
    groups.set(key, group);
  }

  const writes: PlannedClientPrice[] = [];
  let conflicts = 0;
  const conflictList: PriceConflict[] = [];
  const matchedClients = new Set<string>();
  const duplicateRule = options.ownBeforeSite
    ? "le prix propre du client avant celui d'un de ses sites, puis le plus récemment modifié"
    : "le prix modifié le plus récemment";

  for (const [key, group] of groups) {
    const winner = group.reduce((best, candidate) => (preferredPrice(candidate.row, best.row, options.ownBeforeSite) ? candidate : best));
    matchedClients.add(winner.clientId);
    const ours = `${clientName.get(winner.clientId) ?? "?"} — ${winner.parameter.name}`;
    const differing: ConflictPrice[] = [];
    for (const other of group) {
      if (other === winner) continue;
      const conflict = other.row.price !== winner.row.price;
      if (conflict) {
        conflicts += 1;
        differing.push(conflictPrice(other.row));
      }
      note("duplicate", {
        line: other.row.line,
        client: other.row.client,
        parameter: other.row.parameter,
        price: other.row.price,
        detail: conflict
          ? `Même client et même analyse que la ligne ${winner.row.line} (${ours}) à un autre prix : gardé, ${duplicateRule}.`
          : `Même client, même analyse et même prix que la ligne ${winner.row.line} (${ours}).`,
      });
    }
    if (differing.length > 0 && conflictList.length < MAX_MISSING) {
      conflictList.push({
        client: clientName.get(winner.clientId) ?? "?",
        analysis: winner.parameter.name,
        kept: conflictPrice(winner.row),
        others: differing,
      });
    }
    const { row } = winner;
    const base = { line: row.line, client: row.client, parameter: row.parameter, price: row.price };
    const existing = existingByKey.get(key);
    const itemKey = clientPriceKey({ parameterId: winner.parameter.id });
    if (existing?.removedAt) {
      note("keptRemoved", {
        ...base,
        detail: `Prix retiré à la main sur la fiche le ${formatDate(existing.removedAt)} : non repris, le catalogue s'applique.`,
      });
      continue;
    }
    if (existing?.origin === "SAISIE") {
      note("keptManual", { ...base, detail: `Prix saisi sur la fiche (${existing.unitPrice.toFixed(2)}) : conservé.` });
      continue;
    }
    const elsewhere = existingByLegacy.get(row.legacyPriceId);
    if (elsewhere?.removedAt) {
      note("keptRemoved", {
        ...base,
        detail: `Prix retiré à la main le ${formatDate(elsewhere.removedAt)} : non repris.`,
      });
      continue;
    }
    if (elsewhere && elsewhere.id !== existing?.id) {
      // Already taken over onto another fiche (a client merged since): left where it is.
      note("unchanged", { ...base, detail: "Déjà repris sur une autre fiche (client fusionné depuis) : laissé tel quel." });
      continue;
    }
    if (existing && existing.unitPrice === row.price && existing.legacyPriceId === row.legacyPriceId) {
      note("unchanged", { ...base, detail: ours });
      continue;
    }
    note(existing ? "update" : "create", {
      ...base,
      detail: existing ? `${ours} : ${existing.unitPrice.toFixed(2)} → ${row.price.toFixed(2)}` : ours,
    });
    writes.push({
      clientId: winner.clientId,
      parameterId: winner.parameter.id,
      itemKey,
      unitPrice: row.price,
      legacyPriceId: row.legacyPriceId,
      legacyClientId: row.legacyClientId,
      legacyModifiedAt: row.modifiedAt,
      existingId: existing?.id ?? null,
    });
  }

  const found = [...clientMatches.values()].filter((m): m is Extract<ClientMatch, { status: "found" }> => m.status === "found");
  return {
    rows: rows.length + rejected.length,
    counts,
    matched: counts.create + counts.update + counts.unchanged + counts.keptManual + counts.keptRemoved + counts.duplicate,
    conflicts,
    conflictList,
    duplicateRule,
    legacyTariff,
    clients: {
      matched: found.length,
      notFound: [...clientMatches.values()].filter((m) => m.status === "missing").length,
      ambiguous: [...clientMatches.values()].filter((m) => m.status === "ambiguous").length,
      bySite: found.filter((m) => m.by === "site" || m.by === "parent").length,
      byIce: found.filter((m) => m.by === "ice").length,
      byName: found.filter((m) => m.by === "nom").length,
    },
    archivedClients: [...matchedClients].filter((id) => archived.has(id)).length,
    missingClients: [...missingClients.values()].sort((a, b) => b.prices - a.prices || a.name.localeCompare(b.name, "fr")).slice(0, MAX_MISSING),
    missingAnalyses: [...missingAnalyses.values()].sort((a, b) => b.prices - a.prices || a.label.localeCompare(b.label, "fr")).slice(0, MAX_MISSING),
    examples,
    writes,
  };
}

/** Whether the plan writes anything. */
export function planWritesPrices(plan: Pick<ClientPricePlan, "writes">): boolean {
  return plan.writes.length > 0;
}
