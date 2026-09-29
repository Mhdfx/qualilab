import { normalizeLabel } from "./serie-input";

/**
 * The client memory — the designations and places each client already
 * uses — loaded in one go (RETOUR-LABO-29-09.md, slice A). Without it the
 * corrector has nothing to propose: the memory only learned from the visits
 * entered in the new system. Pure: the route reads the rows, this module
 * groups them.
 *
 * Two sources share the same shape: the samples already in the database,
 * and a CSV exported from the old software (one row per sample: client,
 * désignation, lieu).
 */

export type MemoryRow = {
  line: number;
  /** The client as written in the file: a name, or an ICE of 15 digits. */
  client: string;
  designation: string;
  lieu: string;
};

export type MemoryEntry = { label: string; normalizedLabel: string; count: number };

export type ClientMemory = { products: MemoryEntry[]; places: MemoryEntry[] };

export type MemoryColumns = { client: number; designation: number; lieu: number };

const CLIENT_HEADERS = ["client", "raison sociale", "nom client", "nom du client", "ice", "societe"];
const DESIGNATION_HEADERS = ["designation", "nom produit", "nom_produit", "produit", "echantillon", "nature echantillon"];
const LIEU_HEADERS = ["lieu", "lieu de prelevement", "lieu prelevement", "section", "lieu preleve"];

function findColumn(headers: string[], names: string[]): number {
  const keys = headers.map((h) => normalizeLabel(h.replace(/_/g, " ")));
  for (const name of names) {
    const index = keys.indexOf(normalizeLabel(name.replace(/_/g, " ")));
    if (index >= 0) return index;
  }
  return -1;
}

/** Which column holds what, read from the header row; null when the client
 *  or the designation cannot be found. */
export function guessMemoryColumns(headers: string[]): MemoryColumns | null {
  const client = findColumn(headers, CLIENT_HEADERS);
  const designation = findColumn(headers, DESIGNATION_HEADERS);
  if (client < 0 || designation < 0) return null;
  return { client, designation, lieu: findColumn(headers, LIEU_HEADERS) };
}

export function readMemoryRows(rows: string[][], columns: MemoryColumns): MemoryRow[] {
  const out: MemoryRow[] = [];
  rows.forEach((row, index) => {
    const client = (row[columns.client] ?? "").trim();
    const designation = (row[columns.designation] ?? "").trim().replace(/\s+/g, " ");
    const lieu = columns.lieu >= 0 ? (row[columns.lieu] ?? "").trim().replace(/\s+/g, " ") : "";
    if (!client || (!designation && !lieu)) return;
    out.push({ line: index + 2, client, designation: designation.slice(0, 191), lieu: lieu.slice(0, 191) });
  });
  return out;
}

/**
 * One entry per spelling family: the label kept is the spelling used most
 * often (ties: the first seen), the count is how often the family appears —
 * what orders the suggestions.
 */
export function groupLabels(labels: string[]): MemoryEntry[] {
  const families = new Map<string, { spellings: Map<string, number>; count: number; order: number }>();
  labels.forEach((raw, order) => {
    const label = raw.trim();
    const key = normalizeLabel(label);
    if (!key) return;
    const family = families.get(key) ?? { spellings: new Map(), count: 0, order };
    family.count += 1;
    family.spellings.set(label, (family.spellings.get(label) ?? 0) + 1);
    families.set(key, family);
  });
  return [...families.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order)
    .map(([normalizedLabel, family]) => {
      const [label] = [...family.spellings.entries()].sort((a, b) => b[1] - a[1])[0];
      return { label, normalizedLabel, count: family.count };
    });
}

/** Resolves a file's client to a client of the database: by ICE when the
 *  cell is an ICE, otherwise by name once normalised. */
export function clientMatcher(clients: { id: string; name: string; ice: string | null }[]) {
  const byIce = new Map(clients.filter((c) => c.ice).map((c) => [c.ice!.replace(/\D/g, ""), c.id]));
  const byName = new Map(clients.map((c) => [normalizeLabel(c.name), c.id]));
  return (raw: string): string | null => {
    const digits = raw.replace(/\D/g, "");
    if (digits.length >= 9 && digits.length === raw.replace(/\s/g, "").length) return byIce.get(digits) ?? null;
    return byName.get(normalizeLabel(raw)) ?? null;
  };
}
