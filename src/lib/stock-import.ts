import { isoDayOf, parseIsoDay } from "./date-only";
import { validateStockItem, validateSupplier, type CleanStockItem, type CleanSupplier } from "./achat-validation";

/**
 * Imports of the magasin (lot 3D, RETOUR-LABO-28-10.md M8): the articles
 * and the suppliers, read from the laboratory's own workbooks — « créer
 * seulement » (an article or a supplier already known by its name is
 * reported and left alone), in three steps: analyse → essai → import, the
 * import journalled. Pure: the routes read the file into rows, this decides.
 *
 * - **Articles** — the « Fiche de stock » template (fichier 3.4): Date |
 *   Libellé | Lot | EXPIRATION | Entrée | Sortie | Stock | Prix (dh/ht, two
 *   sub-columns) | Lieu de stockage (optional columns of ours: Unité,
 *   Catégorie, Seuil). One article per distinct « Libellé »; the register's
 *   rows of an article give its opening stock — the « Stock » of its last
 *   row, else Σ entrées − Σ sorties — recorded as ONE entry movement
 *   (« Stock d'ouverture ») with the lot, expiry and unit price of its last
 *   entry. Unit « unité » when the file has none (hypothèse, à confirmer
 *   par R-23: the template names no unit). The first price sub-column is
 *   read as the unit price HT (R-23).
 * - **Suppliers** — the « Journal Achat » template (fichier 3.3): the
 *   « Fournisseurs » and « Délai de paiement » columns (optional: ICE,
 *   Contact, Téléphone, Email, Adresse, Soumis à la retenue). One supplier
 *   per distinct name; the journal's invoices themselves are not imported.
 */

export type SheetCell = string | number | null;
export type SheetRow = SheetCell[];

export const MAX_IMPORT_ROWS = 5_000;

/** Lower case, without accents, spaces squeezed — to match the headers. */
export function headerKey(value: SheetCell): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, " ")
    .trim();
}

const cell = (row: SheetRow, index: number): string =>
  index < 0 ? "" : String(row[index] ?? "").trim();

/** A number typed in a cell: « 12 », « 12,5 », « 1 250,00 »; null when empty or unreadable. */
export function cellNumber(value: SheetCell): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").replace(/\s| | /g, "").replace(",", ".");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A day typed in a cell: « AAAA-MM-JJ », « JJ/MM/AAAA » or an Excel serial; null otherwise. */
export function cellDay(value: SheetCell): string | null {
  if (typeof value === "number" && value > 20000 && value < 80000) {
    // Excel's day 1 is 1900-01-01, with its phantom 29/02/1900.
    return isoDayOf(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86_400_000));
  }
  const raw = String(value ?? "").trim();
  if (parseIsoDay(raw.slice(0, 10))) return raw.slice(0, 10);
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(raw);
  if (!match) return null;
  const year = match[3].length === 2 ? 2000 + Number(match[3]) : Number(match[3]);
  const day = `${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return parseIsoDay(day) ? day : null;
}

/** The first row (among the first ten) holding one of the key headers, and its index. */
function findHeader(rows: SheetRow[], keys: string[]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    if ((rows[i] ?? []).some((value) => keys.includes(headerKey(value)))) return i;
  }
  return -1;
}

function columnOf(header: SheetRow, candidates: string[]): number {
  return header.findIndex((value) => candidates.includes(headerKey(value)));
}

export type ImportProblem = { line: number; error: string };

// ————— Articles —————

export type ArticleDraft = {
  /** The file's line of the article's last row (1-based, for the report). */
  line: number;
  item: CleanStockItem;
  /** The opening stock (0 = the article is created without a movement). */
  opening: number;
  lot: string | null;
  expiryDay: string | null;
  unitPriceHT: number | null;
};

export type ArticleImport = {
  rows: number;
  drafts: ArticleDraft[];
  invalid: ImportProblem[];
};

const LABEL_KEYS = ["libelle", "article", "designation"];

export function parseArticleSheet(rows: SheetRow[]): ArticleImport | { error: string } {
  const at = findHeader(rows, LABEL_KEYS);
  if (at < 0) return { error: "Colonne « Libellé » introuvable : utilisez le modèle « Fiche de stock »." };
  const header = rows[at];
  const col = {
    label: columnOf(header, LABEL_KEYS),
    lot: columnOf(header, ["lot"]),
    expiry: columnOf(header, ["expiration", "peremption", "date de peremption", "dlc"]),
    entry: columnOf(header, ["entree", "entrees"]),
    exit: columnOf(header, ["sortie", "sorties"]),
    stock: columnOf(header, ["stock"]),
    price: header.findIndex((value) => headerKey(value).startsWith("prix")),
    location: columnOf(header, ["lieu de stockage", "lieu", "emplacement"]),
    unit: columnOf(header, ["unite", "unite de comptage"]),
    category: columnOf(header, ["categorie", "famille"]),
    threshold: columnOf(header, ["seuil", "seuil d alerte", "stock minimum"]),
  };
  // « Prix (dh/ht) » spans two columns (merged header): unit price, then amount.
  const amountColumn = col.price >= 0 && headerKey(header[col.price + 1]) === "" ? col.price + 1 : -1;

  type Acc = { name: string; line: number; rows: { line: number; row: SheetRow }[] };
  const byName = new Map<string, Acc>();
  const invalid: ImportProblem[] = [];
  let count = 0;
  for (let i = at + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.every((value) => String(value ?? "").trim() === "")) continue;
    count += 1;
    const name = cell(row, col.label);
    if (!name) {
      invalid.push({ line: i + 1, error: "Ligne sans libellé — ignorée." });
      continue;
    }
    const key = headerKey(name);
    const acc = byName.get(key) ?? { name, line: i + 1, rows: [] };
    acc.rows.push({ line: i + 1, row });
    acc.line = i + 1;
    byName.set(key, acc);
  }

  const drafts: ArticleDraft[] = [];
  for (const acc of byName.values()) {
    const last = acc.rows.at(-1)!.row;
    const pick = (index: number) => [...acc.rows].reverse().map(({ row }) => cell(row, index)).find(Boolean) ?? "";
    const validated = validateStockItem({
      name: acc.name,
      unit: pick(col.unit) || "unité",
      category: pick(col.category),
      location: pick(col.location),
      minQuantity: pick(col.threshold),
    });
    if (!validated.ok) {
      invalid.push({ line: acc.line, error: `« ${acc.name} » : ${validated.error}` });
      continue;
    }
    // Opening stock: the register's last « Stock », else entries − exits.
    const lastStock = cellNumber(last[col.stock] ?? null);
    let opening: number;
    if (col.stock >= 0 && lastStock !== null) opening = lastStock;
    else {
      const total = acc.rows.reduce(
        (sum, { row }) => sum + Math.round((cellNumber(row[col.entry] ?? null) ?? 0) * 100) - Math.round((cellNumber(row[col.exit] ?? null) ?? 0) * 100),
        0
      );
      opening = total / 100;
    }
    if (opening < 0) {
      invalid.push({ line: acc.line, error: `« ${acc.name} » : stock négatif (${opening}) — vérifiez les entrées et sorties.` });
      continue;
    }
    // Lot, expiry and price: from the article's last entry (else its last row).
    const lastEntry = [...acc.rows].reverse().find(({ row }) => (cellNumber(row[col.entry] ?? null) ?? 0) > 0)?.row ?? last;
    const expiryRaw = lastEntry[col.expiry] ?? null;
    const expiryDay = col.expiry >= 0 ? cellDay(expiryRaw) : null;
    if (col.expiry >= 0 && String(expiryRaw ?? "").trim() && !expiryDay) {
      invalid.push({ line: acc.line, error: `« ${acc.name} » : date d'expiration illisible (« ${String(expiryRaw)} »).` });
      continue;
    }
    let unitPriceHT = col.price >= 0 ? cellNumber(lastEntry[col.price] ?? null) : null;
    if (unitPriceHT === null && amountColumn >= 0) {
      const amount = cellNumber(lastEntry[amountColumn] ?? null);
      const quantity = cellNumber(lastEntry[col.entry] ?? null);
      if (amount !== null && quantity) unitPriceHT = Math.round((amount / quantity) * 100) / 100;
    }
    if (unitPriceHT !== null && (unitPriceHT < 0 || unitPriceHT > 9_999_999_999.99)) {
      invalid.push({ line: acc.line, error: `« ${acc.name} » : prix illisible.` });
      continue;
    }
    drafts.push({
      line: acc.line,
      item: validated.value,
      opening: Math.round(opening * 100) / 100,
      lot: col.lot >= 0 ? cell(lastEntry, col.lot).slice(0, 191) || null : null,
      expiryDay,
      unitPriceHT: unitPriceHT && unitPriceHT > 0 ? Math.round(unitPriceHT * 100) / 100 : null,
    });
  }
  return { rows: count, drafts, invalid };
}

// ————— Suppliers —————

export type SupplierDraft = { line: number; supplier: CleanSupplier };
export type SupplierImport = { rows: number; drafts: SupplierDraft[]; invalid: ImportProblem[] };

const SUPPLIER_KEYS = ["fournisseurs", "fournisseur", "raison sociale"];

/** « 30 », « 30 jours », « 60 j », « Comptant », « à réception » → days; null when unreadable. */
export function paymentTermDays(value: SheetCell): number | null {
  if (typeof value === "number") return Number.isInteger(value) ? value : null;
  const key = headerKey(value);
  if (!key) return null;
  if (/comptant|reception/.test(key)) return 0;
  const match = /^(\d{1,3})(?:\s*(?:j|jours?))?$/.exec(key);
  return match ? Number(match[1]) : null;
}

export function parseSupplierSheet(rows: SheetRow[]): SupplierImport | { error: string } {
  const at = findHeader(rows, SUPPLIER_KEYS);
  if (at < 0) return { error: "Colonne « Fournisseurs » introuvable : utilisez le modèle « Journal Achat »." };
  const header = rows[at];
  const col = {
    name: columnOf(header, SUPPLIER_KEYS),
    term: header.findIndex((value) => headerKey(value).startsWith("delai")),
    ice: columnOf(header, ["ice"]),
    contact: columnOf(header, ["contact"]),
    phone: columnOf(header, ["telephone", "tel"]),
    email: columnOf(header, ["email", "e mail", "mail"]),
    address: columnOf(header, ["adresse"]),
    subject: header.findIndex((value) => headerKey(value).startsWith("soumis")),
  };

  type Acc = { name: string; line: number; rows: SheetRow[] };
  const byName = new Map<string, Acc>();
  let count = 0;
  for (let i = at + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.every((value) => String(value ?? "").trim() === "")) continue;
    count += 1;
    const name = cell(row, col.name);
    if (!name) continue;
    const key = headerKey(name);
    const acc = byName.get(key) ?? { name, line: i + 1, rows: [] };
    acc.rows.push(row);
    byName.set(key, acc);
  }

  const drafts: SupplierDraft[] = [];
  const invalid: ImportProblem[] = [];
  for (const acc of byName.values()) {
    const first = (index: number) => acc.rows.map((row) => cell(row, index)).find(Boolean) ?? "";
    const termCell = acc.rows.map((row) => (col.term >= 0 ? row[col.term] ?? null : null)).find((value) => String(value ?? "").trim() !== "") ?? null;
    const term = termCell === null ? 30 : paymentTermDays(termCell);
    if (term === null) {
      invalid.push({ line: acc.line, error: `« ${acc.name} » : délai de paiement illisible (« ${String(termCell)} »).` });
      continue;
    }
    const validated = validateSupplier({
      name: acc.name,
      paymentTermDays: term,
      ice: first(col.ice),
      contact: first(col.contact),
      phone: first(col.phone),
      email: first(col.email),
      address: first(col.address),
      withholdingSubject: /^(oui|o|x|1|true)$/i.test(first(col.subject)),
    });
    if (!validated.ok) {
      invalid.push({ line: acc.line, error: `« ${acc.name} » : ${validated.error}` });
      continue;
    }
    drafts.push({ line: acc.line, supplier: validated.value });
  }
  return { rows: count, drafts, invalid };
}

/** Names already known (case and accents ignored) — reported, never overwritten. */
export function splitKnown<T>(drafts: T[], nameOf: (draft: T) => string, known: string[]) {
  const existing = new Set(known.map(headerKey));
  return {
    toCreate: drafts.filter((draft) => !existing.has(headerKey(nameOf(draft)))),
    alreadyKnown: drafts.filter((draft) => existing.has(headerKey(nameOf(draft)))),
  };
}
