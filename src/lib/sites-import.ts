/**
 * « Sites de l'ancien logiciel » (RETOUR-LABO-06-10.md §5, V5) — pure.
 *
 * The old software files a client's sampling sites (the restaurants of a
 * chain, the canteens of a public body) under a « parent » client. The
 * client import of 01/10 took every one of those sites for a client of its
 * own, so the chain has no site and each restaurant is a separate client.
 * This module reads the sites file exported from the old database and plans
 * the repair, without touching the database:
 *
 *   - the parent is the one active client whose normalised name equals the
 *     row's client (several → ambiguous, none → missing: the row is skipped);
 *   - the site is found by its legacy id, else by its normalised name under
 *     the parent; otherwise it is created (inactive when obsolete);
 *   - the « client » created by mistake for the site — the one active client,
 *     other than the parent, bearing the site's name, a name the file uses
 *     once — is attached to the site and archived, unless it has a history
 *     (séries, samples, invoices or sites of its own): then it is only
 *     reported. Every doubtful case creates the site and leaves clients alone.
 *
 * The route `POST /api/admin/import/sites` loads the clients and sites, calls
 * `planSiteImport` and writes the plan parent by parent.
 */

/** Columns of the export, in the order the extraction script writes them. */
export const SITE_FILE_HEADER =
  "legacySiteId;site;adresse;ville;telephone;email;obsolete;legacyClientId;client;clientObsolete;alsoClient";

/** How many examples each category of the analysis shows. */
export const MAX_EXAMPLES = 30;
/** How many parents the analysis ranks. */
export const MAX_PARENTS = 10;
/** Width of the text columns (VARCHAR(191)). */
const MAX_TEXT = 191;
/** Site.legacyId is a signed INT. */
const MAX_LEGACY_ID = 2_147_483_647;

/**
 * The name used to compare: accents removed, upper case, every run of
 * characters other than A–Z and 0–9 turned into a single space, trimmed.
 * « Café d'Essai » and « CAFE  D ESSAI » are the same name.
 */
export function normalizeSiteName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

// ---- reading the file --------------------------------------------------------

const COLUMN_NAMES = {
  legacySiteId: ["legacysiteid", "idsite", "siteid"],
  site: ["site", "nomsite"],
  address: ["adresse", "address"],
  city: ["ville", "city"],
  phone: ["telephone", "tel", "phone"],
  obsolete: ["obsolete"],
  legacyClientId: ["legacyclientid", "idclient", "clientid"],
  client: ["client", "nomclient"],
  clientObsolete: ["clientobsolete"],
  /** 1 when the old software also has a real client (type 101) of the site's name. */
  alsoClient: ["alsoclient", "aussiclient"],
} as const;

export type SiteColumn = keyof typeof COLUMN_NAMES;
/** Index of each column in the file, -1 when the file does not have it. */
export type SiteColumns = Record<SiteColumn, number>;

const headerKey = (header: string) => normalizeSiteName(header).replace(/ /g, "").toLowerCase();

/**
 * Finds the columns from the header row, case, accents and separators
 * ignored. Null when « legacySiteId », « site » or « client » is missing.
 */
export function guessSiteColumns(headers: string[]): SiteColumns | null {
  const keys = headers.map(headerKey);
  const columns = Object.fromEntries(
    (Object.keys(COLUMN_NAMES) as SiteColumn[]).map((column) => [
      column,
      keys.findIndex((key) => (COLUMN_NAMES[column] as readonly string[]).includes(key)),
    ])
  ) as SiteColumns;
  if (columns.legacySiteId < 0 || columns.site < 0 || columns.client < 0) return null;
  return columns;
}

export type SiteRow = {
  /** The file's line number (the header is line 1). */
  line: number;
  legacySiteId: number;
  /** As written, trimmed, inner spaces collapsed. */
  site: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  obsolete: boolean;
  legacyClientId: number | null;
  client: string;
  clientObsolete: boolean;
  /**
   * The old software also has a real client of this name (not only a site):
   * the client of that name in the database may be that real client, merged
   * with the site by the import of 01/10 — it is never archived (recette 07/10).
   */
  alsoClient: boolean;
};

export type RejectedRow = { line: number; site: string; client: string; reason: string };

const clean = (value: string | undefined) => (value ?? "").replace(/\s+/g, " ").trim();
const optional = (value: string | undefined) => clean(value).slice(0, MAX_TEXT) || null;

/** « 1 », « true », « oui »… — how an export may write a flag that is set. */
export function isFlagSet(value: string | undefined): boolean {
  return ["1", "TRUE", "T", "OUI", "O", "YES", "Y", "X", "VRAI"].includes(normalizeSiteName(value ?? ""));
}

function legacyId(value: string | undefined): number | null {
  const text = clean(value);
  if (!/^\d+$/.test(text)) return null;
  const id = Number(text);
  return id > 0 && id <= MAX_LEGACY_ID ? id : null;
}

/** The data rows (header excluded), each one kept or rejected with its reason. */
export function readSiteRows(rows: string[][], columns: SiteColumns): { rows: SiteRow[]; rejected: RejectedRow[] } {
  const kept: SiteRow[] = [];
  const rejected: RejectedRow[] = [];
  rows.forEach((cells, index) => {
    const line = index + 2;
    const cell = (column: SiteColumn) => (columns[column] >= 0 ? cells[columns[column]] : undefined);
    const site = clean(cell("site"));
    const client = clean(cell("client"));
    const id = legacyId(cell("legacySiteId"));
    const reject = (reason: string) => rejected.push({ line, site, client, reason });
    if (id === null) return reject("Identifiant du site manquant ou invalide.");
    if (!site || !normalizeSiteName(site)) return reject("Nom du site manquant.");
    if (site.length > MAX_TEXT) return reject("Nom du site trop long (191 caractères maximum).");
    if (!client || !normalizeSiteName(client)) return reject("Client parent manquant.");
    kept.push({
      line,
      legacySiteId: id,
      site,
      address: optional(cell("address")),
      city: optional(cell("city")),
      phone: optional(cell("phone")),
      obsolete: isFlagSet(cell("obsolete")),
      legacyClientId: legacyId(cell("legacyClientId")),
      client,
      clientObsolete: isFlagSet(cell("clientObsolete")),
      alsoClient: isFlagSet(cell("alsoClient")),
    });
  });
  return { rows: kept, rejected };
}

// ---- planning ----------------------------------------------------------------------

/** An active client of the database, with what makes it a real client. */
export type ClientCandidate = {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  history: { series: number; samples: number; invoices: number; sites: number };
};

export type ExistingSite = {
  id: string;
  clientId: string;
  name: string;
  legacyId: number | null;
  address: string | null;
  city: string | null;
  phone: string | null;
};

/** What a site already present receives: only the fields it lacks. */
export type SiteFill = { address?: string; city?: string; phone?: string; legacyId?: number };

export type NewSite = {
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  legacyId: number;
  active: boolean;
};

export type PlannedSite = {
  line: number;
  legacySiteId: number;
  parentId: string;
  parentName: string;
  /** The site's name: the file's spelling for a new site, the stored one otherwise. */
  name: string;
  /** The site already in the database, or null when it is to be created. */
  existingId: string | null;
  create: NewSite | null;
  fill: SiteFill;
  /** The client created by mistake for this site: attached, then archived. */
  pseudo: { id: string; name: string } | null;
};

export const SITE_IMPORT_CATEGORIES = [
  "create",
  "present",
  "attach",
  "withHistory",
  "ambiguousSite",
  "ambiguousParent",
  "missingParent",
  "duplicate",
  "rejected",
] as const;
export type SiteImportCategory = (typeof SITE_IMPORT_CATEGORIES)[number];

export type SiteImportExample = { line: number; site: string; client: string; detail: string | null };

export type ParentSummary = { name: string; sites: number; create: number; attach: number };

export type SiteImportPlan = {
  /** Data rows read, rejected ones included. */
  rows: number;
  /** One entry per site kept (created or present), in file order. */
  sites: PlannedSite[];
  /**
   * create + present + ambiguousParent + missingParent + duplicate + rejected
   * = rows; attach, withHistory and ambiguousSite are rows of create / present.
   */
  counts: Record<SiteImportCategory, number>;
  /** Sites to create inactive (obsolete in the old software). */
  inactive: number;
  /** Present sites that receive a missing address, city, phone or legacy id. */
  completed: number;
  examples: Record<SiteImportCategory, SiteImportExample[]>;
  /** The parents with the most sites in the file. */
  parents: ParentSummary[];
};

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** « 2 séries, 1 facture » — why a client is kept as it is. */
export function historyText(history: ClientCandidate["history"]): string {
  return [
    history.series > 0 ? plural(history.series, "série", "séries") : null,
    history.samples > 0 ? plural(history.samples, "échantillon", "échantillons") : null,
    history.invoices > 0 ? plural(history.invoices, "facture", "factures") : null,
    history.sites > 0 ? plural(history.sites, "site", "sites") : null,
  ]
    .filter(Boolean)
    .join(", ");
}

const FIELD_WORDS = { address: "adresse", city: "ville", phone: "téléphone" } as const;

const hasHistory = (history: ClientCandidate["history"]) =>
  history.series + history.samples + history.invoices + history.sites > 0;

/** The fields of a site that are empty and that the file (or the attached client) can fill. */
function missingFields(
  existing: Pick<ExistingSite, "address" | "city" | "phone" | "legacyId">,
  values: { address: string | null; city: string | null; phone: string | null; legacyId: number }
): SiteFill {
  const fill: SiteFill = {};
  if (!existing.address && values.address) fill.address = values.address;
  if (!existing.city && values.city) fill.city = values.city;
  if (!existing.phone && values.phone) fill.phone = values.phone;
  if (existing.legacyId === null) fill.legacyId = values.legacyId;
  return fill;
}

export function planSiteImport(
  rows: SiteRow[],
  db: { clients: ClientCandidate[]; sites: ExistingSite[] },
  rejected: RejectedRow[] = []
): SiteImportPlan {
  const counts = Object.fromEntries(SITE_IMPORT_CATEGORIES.map((c) => [c, 0])) as Record<SiteImportCategory, number>;
  const examples = Object.fromEntries(SITE_IMPORT_CATEGORIES.map((c) => [c, []])) as unknown as Record<
    SiteImportCategory,
    SiteImportExample[]
  >;
  const note = (category: SiteImportCategory, row: { line: number; site: string; client: string }, detail: string | null = null) => {
    counts[category] += 1;
    if (examples[category].length < MAX_EXAMPLES) examples[category].push({ line: row.line, site: row.site, client: row.client, detail });
  };
  for (const row of rejected) note("rejected", row, row.reason);

  // ---- indexes ---------------------------------------------------------------------
  const clientsByName = new Map<string, ClientCandidate[]>();
  for (const client of db.clients) {
    const key = normalizeSiteName(client.name);
    if (!key) continue;
    clientsByName.set(key, [...(clientsByName.get(key) ?? []), client]);
  }
  const sitesByLegacy = new Map<number, ExistingSite>();
  const sitesByName = new Map<string, ExistingSite>();
  for (const site of db.sites) {
    if (site.legacyId !== null) sitesByLegacy.set(site.legacyId, site);
    sitesByName.set(`${site.clientId}|${normalizeSiteName(site.name)}`, site);
  }
  // How often each site name appears in the whole file, and the parents' names:
  // a client named like a parent of the file is never a site imported by mistake.
  const nameCount = new Map<string, number>();
  const parentNames = new Set<string>();
  for (const row of rows) {
    const key = normalizeSiteName(row.site);
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);
    parentNames.add(normalizeSiteName(row.client));
  }

  // ---- row by row ------------------------------------------------------------------
  const sites: PlannedSite[] = [];
  const seenLegacy = new Map<number, number>();
  const claimed = new Map<string, number>(); // existing site id or new-site key → line
  let inactive = 0;
  let completed = 0;

  for (const row of rows) {
    const firstLine = seenLegacy.get(row.legacySiteId);
    if (firstLine !== undefined) {
      note("duplicate", row, `Même identifiant que la ligne ${firstLine}.`);
      continue;
    }
    seenLegacy.set(row.legacySiteId, row.line);

    const parents = clientsByName.get(normalizeSiteName(row.client)) ?? [];
    if (parents.length === 0) {
      note("missingParent", row, "Aucun client actif de ce nom.");
      continue;
    }
    if (parents.length > 1) {
      note("ambiguousParent", row, `${parents.length} clients actifs portent ce nom.`);
      continue;
    }
    const parent = parents[0];
    const siteKey = normalizeSiteName(row.site);
    const existing = sitesByLegacy.get(row.legacySiteId) ?? sitesByName.get(`${parent.id}|${siteKey}`) ?? null;
    const claimKey = existing ? existing.id : `${parent.id}|${siteKey}`;
    const claimedBy = claimed.get(claimKey);
    if (claimedBy !== undefined) {
      note("duplicate", row, `Même site que la ligne ${claimedBy}.`);
      continue;
    }
    claimed.set(claimKey, row.line);

    // A site already filed under another client was moved there by hand: left alone.
    if (existing && existing.clientId !== parent.id) {
      note("present", row, "Déjà rattaché à un autre client : laissé tel quel.");
      continue;
    }

    // ---- the client created by mistake for this site ----------------------------
    let pseudo: ClientCandidate | null = null;
    const candidates = (clientsByName.get(siteKey) ?? []).filter((c) => c.id !== parent.id);
    if (candidates.length > 0) {
      const times = nameCount.get(siteKey) ?? 0;
      if (times > 1) {
        note("ambiguousSite", row, `Nom présent ${times} fois dans le fichier : aucun client n'est touché.`);
      } else if (candidates.length > 1) {
        note("ambiguousSite", row, `${candidates.length} clients actifs portent ce nom : aucun n'est touché.`);
      } else if (parentNames.has(siteKey)) {
        note("ambiguousSite", row, `« ${candidates[0].name} » est aussi un client parent du fichier : il n'est pas touché.`);
      } else if (row.alsoClient) {
        note("ambiguousSite", row, `« ${candidates[0].name} » est aussi un client à part entière dans l'ancien logiciel : il n'est pas touché.`);
      } else if (hasHistory(candidates[0].history)) {
        note("withHistory", row, `« ${candidates[0].name} » : ${historyText(candidates[0].history)}.`);
      } else {
        pseudo = candidates[0];
        note("attach", row, pseudo.name);
      }
    }

    // The file first; the attached client's own record when the file is silent.
    const values = {
      address: row.address ?? optional(pseudo?.address ?? undefined),
      city: row.city,
      phone: row.phone ?? optional(pseudo?.phone ?? undefined),
      legacyId: row.legacySiteId,
    };
    const planned: PlannedSite = {
      line: row.line,
      legacySiteId: row.legacySiteId,
      parentId: parent.id,
      parentName: parent.name,
      name: existing ? existing.name : row.site,
      existingId: existing?.id ?? null,
      create: null,
      fill: {},
      pseudo: pseudo ? { id: pseudo.id, name: pseudo.name } : null,
    };
    if (existing) {
      planned.fill = missingFields(existing, values);
      const filled = (Object.keys(planned.fill) as (keyof SiteFill)[]).filter((k) => k !== "legacyId") as (keyof typeof FIELD_WORDS)[];
      if (Object.keys(planned.fill).length > 0) completed += 1;
      note("present", row, filled.length > 0 ? `À compléter : ${filled.map((k) => FIELD_WORDS[k]).join(", ")}.` : null);
    } else {
      planned.create = { name: row.site, ...values, active: !row.obsolete };
      if (row.obsolete) inactive += 1;
      note("create", row, [row.city, row.obsolete ? "inactif (obsolète dans l'ancien logiciel)" : null].filter(Boolean).join(" · ") || null);
    }
    sites.push(planned);
  }

  // ---- the parents with the most sites -------------------------------------------------
  const byParent = new Map<string, ParentSummary>();
  for (const site of sites) {
    const entry = byParent.get(site.parentId) ?? { name: site.parentName, sites: 0, create: 0, attach: 0 };
    entry.sites += 1;
    if (site.create) entry.create += 1;
    if (site.pseudo) entry.attach += 1;
    byParent.set(site.parentId, entry);
  }
  const parents = [...byParent.values()]
    .sort((a, b) => b.sites - a.sites || a.name.localeCompare(b.name, "fr"))
    .slice(0, MAX_PARENTS);

  return { rows: rows.length + rejected.length, sites, counts, inactive, completed, examples, parents };
}

/** The plan's sites grouped by parent, parents in name order: one transaction each. */
export function sitesByParent(sites: PlannedSite[]): { parentId: string; parentName: string; sites: PlannedSite[] }[] {
  const groups = new Map<string, { parentId: string; parentName: string; sites: PlannedSite[] }>();
  for (const site of sites) {
    const group = groups.get(site.parentId) ?? { parentId: site.parentId, parentName: site.parentName, sites: [] };
    group.sites.push(site);
    groups.set(site.parentId, group);
  }
  return [...groups.values()].sort((a, b) => a.parentName.localeCompare(b.parentName, "fr"));
}

/** True when the plan writes something: a site, a missing field or an attachment. */
export function planWrites(plan: Pick<SiteImportPlan, "sites">): boolean {
  return plan.sites.some((s) => s.create !== null || Object.keys(s.fill).length > 0 || s.pseudo !== null);
}
