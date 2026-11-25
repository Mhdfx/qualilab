import { createHash } from "node:crypto";
import { parseIsoDay } from "./date-only";
import { applyMovement, MAX_STOCK_LEVEL } from "./stock";
import { cellDay, cellNumber, headerKey, type SheetCell, type SheetRow } from "./stock-import";
import { STOCK_EXPIRY_MONTH_END, STOCK_IMPORT_LEVEL_FROM_FILE, STOCK_IMPORT_QUANTITY_FROM_PRICE } from "./lab-proposals";

/**
 * Lot 6A (RETOUR-LABO-25-11.md §1, §5 M10–M12) — the laboratory's stock
 * file as it really is: **one tab per article** (« Consommable labo »), not
 * the single register of lot 3D. Pure: the route reads the workbook, the
 * server module loads what the database knows, this decides.
 *
 * - **Tables**: a header is a row holding « Date », « Libellé » and an
 *   « Entrée… » column, anywhere in the tab (column A or B, any row); a tab
 *   may hold two tables one under the other — two variants, two articles
 *   (« <onglet> — <variante> »), the variant read before « Entrée » in the
 *   header, else in the column left of the table on its first data row,
 *   else on a line alone right above the header. The price header spans two
 *   columns, its sub-titles (« prix unitaire » / « prix total ») on the row
 *   below, in either order.
 * - **Columns**: Date | Libellé (= the **bon de commande**, not the
 *   article) | Lot | Expiration | Entrée/<conditionnement> | Sortie | Stock |
 *   Prix | Lieu de stockage. The package of « Entrée/C500 » gives the unit
 *   (« carton de 500 ») and its size.
 * - **Rows → movements**: an entry, an exit, or — a row with a « Stock »
 *   only — a « stock de départ » (an entry). Each with its day (never in the
 *   future), bon de commande, lot, expiry, quantity and unit price HT, and
 *   an `importKey` (a fingerprint of the tab, the variant and the row's
 *   cells) that makes a second import write nothing.
 * - **Quantities against prices** (`STOCK_IMPORT_QUANTITY_FROM_PRICE`):
 *   `reconcile`.
 * - Texts outside any table are ignored and listed; every doubt is a
 *   warning in French, with its tab and line.
 */

export type ImportSheetInput = { name: string; rows: SheetRow[]; monthCells?: Set<string>; blankFormulas?: string[] };

export type PriceCheck =
  /** total = quantité × unitaire, sub-columns as titled. */
  | "ok"
  /** the same, the two sub-columns swapped (titles inverted). */
  | "inverse"
  /** total = quantité × taille × unitaire: the unit price was a piece's. */
  | "prix-piece"
  /** total = (quantité ÷ taille) × unitaire: the quantity was in pieces. */
  | "quantite-pieces"
  /** the two prices agree with none of the above: imported as written. */
  | "non-departage"
  /** one price only: nothing to check. */
  | "un-prix"
  | "sans-prix";

export type WorkbookMovement = {
  sheet: string;
  /** The row in the tab (1-based, as Excel shows it). */
  line: number;
  type: "ENTREE" | "SORTIE";
  /** A row with a « Stock » and no entry: the article's stock at that day. */
  opening: boolean;
  day: string;
  orderReference: string | null;
  lot: string | null;
  expiryDay: string | null;
  quantity: number;
  unitPriceHT: number | null;
  check: PriceCheck;
  importKey: string;
};

export type WorkbookArticle = {
  /** headerKey of the name — how an article of the database is matched. */
  key: string;
  name: string;
  sheet: string;
  variant: string | null;
  unit: string;
  /** The package's size (« C500 » → 500), when the header gives one. */
  packSize: number | null;
  location: string | null;
  /** The header's row in the tab (1-based). */
  line: number;
  movements: WorkbookMovement[];
  /** The « Stock » of the table's latest row (by day, in the article's unit), or null. */
  lastStock: number | null;
  /** The row of that last « Stock ». */
  lastStockLine: number | null;
};

export type WorkbookNote = { sheet: string; line: number; message: string };
export type IgnoredText = { sheet: string; cell: string; text: string };

export type StockWorkbook = {
  sheets: number;
  tables: number;
  /** Rows inside the tables (imported or not). */
  dataRows: number;
  articles: WorkbookArticle[];
  /** Rows not imported, with the reason. */
  refused: WorkbookNote[];
  /** Imported, with a doubt to read. */
  warnings: WorkbookNote[];
  ignored: IgnoredText[];
  /** Tabs holding no table. */
  emptySheets: string[];
};

const MAX_PRICE = 9_999_999_999.99;
const round2 = (value: number) => Math.round(value * 100) / 100;
const isBlank = (value: SheetCell | undefined) => value === null || value === undefined || String(value).trim() === "";
const text = (value: SheetCell | undefined) => (isBlank(value) ? "" : String(value).trim());

/** Column index (0-based) → letters, for « L1 »-style addresses. */
function letters(index: number): string {
  let out = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) out = String.fromCharCode(65 + ((n - 1) % 26)) + out;
  return out;
}

// ————— Unit and package —————

export type PackageInfo = { unit: string; size: number | null; volumeMl: number | null; variant: string | null };

/**
 * « Entrée/B50 » → boîte de 50; « Entrée/C500 » → carton de 500;
 * « Entrée/500 » → lot de 500; « Entrée/48/carton » → carton de 48;
 * « Entrée 5U » → lot de 5; « Entrée/1l » → flacon de 1 L; « Entrée » →
 * unité (lot 3D, R-23). Text before « Entrée » is the table's variant
 * (« Réactif 1 Entrée/B200 »).
 */
export function packageOf(header: SheetCell): PackageInfo {
  const raw = text(header);
  const at = raw.search(/entr[ée]es?/i);
  const variant = at > 0 ? raw.slice(0, at).trim() || null : null;
  const rest = (at >= 0 ? raw.slice(at).replace(/^entr[ée]es?/i, "") : "").replace(/^[\s/:-]+/, "").trim();
  const n = (value: string) => Number(value.replace(",", "."));
  let match: RegExpExecArray | null;
  if (!rest) return { unit: "unité", size: null, volumeMl: null, variant };
  if ((match = /^b\s*(\d{1,6})$/i.exec(rest))) return { unit: `boîte de ${match[1]}`, size: Number(match[1]), volumeMl: null, variant };
  if ((match = /^c\s*(\d{1,6})$/i.exec(rest))) return { unit: `carton de ${match[1]}`, size: Number(match[1]), volumeMl: null, variant };
  if ((match = /^(\d{1,6})\s*\/\s*cartons?$/i.exec(rest))) return { unit: `carton de ${match[1]}`, size: Number(match[1]), volumeMl: null, variant };
  if ((match = /^(\d{1,6})\s*u$/i.exec(rest))) return { unit: `lot de ${match[1]}`, size: Number(match[1]), volumeMl: null, variant };
  if ((match = /^(\d{1,6})$/.exec(rest))) return { unit: `lot de ${match[1]}`, size: Number(match[1]), volumeMl: null, variant };
  if ((match = /^(\d{1,5}(?:[.,]\d{1,3})?)\s*(ml|l)$/i.exec(rest))) {
    const isMl = match[2].toLowerCase() === "ml";
    return {
      unit: `flacon de ${match[1].replace(".", ",")} ${isMl ? "mL" : "L"}`,
      size: null,
      volumeMl: n(match[1]) * (isMl ? 1 : 1000),
      variant,
    };
  }
  return { unit: rest.slice(0, 191), size: null, volumeMl: null, variant };
}

/** « Stock/ml » → 1 (mL per unit of the column), « Stock/l » → 1000; null otherwise. */
function stockUnitMl(header: SheetCell): number | null {
  const key = headerKey(header);
  if (/^stock ml$/.test(key)) return 1;
  if (/^stock l$/.test(key)) return 1000;
  return null;
}

// ————— Days —————

function monthEnd(year: number, month: number, end: boolean): string | null {
  if (month < 1 || month > 12 || year < 1900 || year > 2200) return null;
  const day = end ? new Date(Date.UTC(year, month, 0)).getUTCDate() : 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * An expiry cell: a day (« AAAA-MM-JJ », « JJ/MM/AA(AA) », an Excel serial),
 * or a month — « MM-AAAA », « MM/AAAA », or a date shown as month-year
 * (`monthCell`) — read as its last day (`STOCK_EXPIRY_MONTH_END`) or its
 * 1st. Undefined when the cell is empty, null when unreadable.
 */
export function expiryOf(value: SheetCell | undefined, monthCell: boolean): string | null | undefined {
  if (isBlank(value)) return undefined;
  const raw = text(value);
  const month = /^(\d{1,2})\s*[-/.]\s*(\d{4})$/.exec(raw);
  if (month) return monthEnd(Number(month[2]), Number(month[1]), STOCK_EXPIRY_MONTH_END);
  const day = cellDay(value ?? null);
  if (day && monthCell) return monthEnd(Number(day.slice(0, 4)), Number(day.slice(5, 7)), STOCK_EXPIRY_MONTH_END);
  return day;
}

// ————— Quantities against prices —————

export type Reconciled = { quantity: number; unitPriceHT: number | null; check: PriceCheck };

const close = (actual: number, expected: number) => Math.abs(actual - expected) <= Math.max(0.011, Math.abs(expected) * 0.005);

/**
 * The quantity and the unit price of a row, from the quantity written, the
 * package's size and the two price sub-columns (`unitTitled`, `totalTitled`
 * — the values under « prix unitaire » and « prix total »). Tried in this
 * order, the titles first then swapped: total = q × u (« ok » /
 * « inverse »); total = q × size × u (the unit price was a piece's: the
 * package's is size × u); total = (q ÷ size) × u with q ≥ size (q was
 * counted in pieces: q ÷ size packages). Off (`STOCK_IMPORT_QUANTITY_FROM_PRICE`):
 * the quantity and the price titled « unitaire » as written, a mismatch
 * flagged « non-departage ».
 */
export function reconcile(quantity: number, size: number | null, unitTitled: number | null, totalTitled: number | null): Reconciled {
  if (unitTitled === null && totalTitled === null) return { quantity, unitPriceHT: null, check: "sans-prix" };
  if (totalTitled === null) return { quantity, unitPriceHT: unitTitled, check: "un-prix" };
  if (unitTitled === null) return { quantity, unitPriceHT: quantity > 0 ? round2(totalTitled / quantity) : null, check: "un-prix" };
  const asWritten: Reconciled = { quantity, unitPriceHT: unitTitled, check: "non-departage" };
  if (close(totalTitled, quantity * unitTitled)) return { quantity, unitPriceHT: unitTitled, check: "ok" };
  if (!STOCK_IMPORT_QUANTITY_FROM_PRICE) return asWritten;
  if (close(unitTitled, quantity * totalTitled)) return { quantity, unitPriceHT: totalTitled, check: "inverse" };
  const pairs: [number, number, boolean][] = [
    [unitTitled, totalTitled, false],
    [totalTitled, unitTitled, true],
  ];
  if (size && size > 1) {
    for (const [u, t] of pairs) {
      if (close(t, quantity * size * u)) return { quantity, unitPriceHT: round2(size * u), check: "prix-piece" };
      if (quantity >= size && close(t, (quantity / size) * u)) return { quantity: round2(quantity / size), unitPriceHT: u, check: "quantite-pieces" };
    }
  }
  return asWritten;
}

export const PRICE_CHECK_LABELS: Record<PriceCheck, string> = {
  ok: "prix vérifiés",
  inverse: "prix unitaire et total inversés dans le fichier — remis dans l'ordre",
  "prix-piece": "prix unitaire d'une pièce — ramené au conditionnement",
  "quantite-pieces": "quantité comptée en pièces — ramenée en conditionnements",
  "non-departage": "quantité × prix unitaire ≠ prix total — importé tel qu'écrit, à vérifier",
  "un-prix": "un seul prix — non vérifié",
  "sans-prix": "sans prix",
};

// ————— Tables —————

type Table = {
  header: number;
  dataStart: number;
  /** Exclusive. */
  dataEnd: number;
  firstCol: number;
  lastCol: number;
  col: {
    date: number;
    label: number;
    lot: number;
    expiry: number;
    entry: number;
    exit: number;
    stock: number;
    unit: number;
    total: number;
    location: number;
  };
  pkg: PackageInfo;
  stockMl: number | null;
  variant: string | null;
  /** The cell the variant was read from (« ligne,colonne »), if any. */
  variantCell: string | null;
};

function isHeaderRow(row: SheetRow): boolean {
  const keys = row.map(headerKey);
  return keys.includes("date") && keys.includes("libelle") && keys.some((key) => /(^| )entrees?( |$)/.test(key));
}

function readTable(rows: SheetRow[], at: number): Omit<Table, "dataEnd" | "variant" | "variantCell"> {
  const header = rows[at];
  const keys = header.map(headerKey);
  const find = (test: (key: string) => boolean) => keys.findIndex(test);
  const date = find((key) => key === "date");
  const label = find((key) => key === "libelle");
  const entry = find((key) => /(^| )entrees?( |$)/.test(key));
  const price = find((key) => key.startsWith("prix"));
  const sub = rows[at + 1] ?? [];
  const subKey = (index: number) => (index >= 0 ? headerKey(sub[index]) : "");
  const hasSub = price >= 0 && /unit|total/.test(`${subKey(price)} ${subKey(price + 1)}`);
  // « Prix (dh/ht) » over two columns: the unit price first unless its sub-title says « total ».
  let unit = -1;
  let total = -1;
  if (price >= 0) {
    const totalFirst = subKey(price).includes("total") || (subKey(price + 1).includes("unit") && !subKey(price).includes("unit"));
    const secondFree = isBlank(header[price + 1]) || hasSub;
    unit = totalFirst ? (secondFree ? price + 1 : -1) : price;
    total = totalFirst ? price : secondFree ? price + 1 : -1;
  }
  const col = {
    date,
    label,
    lot: find((key) => key === "lot" || key === "n lot" || key === "no lot" || key === "numero de lot" || key === "nlot"),
    expiry: find((key) => key.startsWith("exp") || key.startsWith("peremption") || key === "dlc"),
    entry,
    exit: find((key) => key === "sortie" || key === "sorties"),
    stock: find((key) => key === "stock" || key.startsWith("stock ")),
    unit,
    total,
    location: find((key) => key.startsWith("lieu") || key === "emplacement"),
  };
  const used = Object.values(col).filter((index) => index >= 0);
  return {
    header: at,
    dataStart: hasSub ? at + 2 : at + 1,
    firstCol: Math.min(...used),
    lastCol: Math.max(...used),
    col,
    pkg: packageOf(header[entry]),
    stockMl: col.stock >= 0 ? stockUnitMl(header[col.stock]) : null,
  };
}

/** One non-empty cell on the row, a text (not a number): its column, else -1. */
function loneText(row: SheetRow | undefined): number {
  if (!row) return -1;
  const filled = row.map((value, index) => (isBlank(value) ? -1 : index)).filter((index) => index >= 0);
  if (filled.length !== 1) return -1;
  const value = row[filled[0]];
  return typeof value === "string" && cellNumber(value) === null ? filled[0] : -1;
}

function tablesOf(rows: SheetRow[]): Table[] {
  const starts: number[] = [];
  for (let r = 0; r < rows.length; r += 1) if (isHeaderRow(rows[r] ?? [])) starts.push(r);
  const tables = starts.map((at) => readTable(rows, at));
  return tables.map((table, index) => {
    const next = tables[index + 1];
    let dataEnd = next ? next.header : rows.length;
    // A line alone right above the next header is that table's label, not a row of this one.
    if (next && next.header - 1 >= table.dataStart && loneText(rows[next.header - 1]) >= 0) dataEnd = next.header - 1;
    return { ...table, dataEnd, variant: null, variantCell: null };
  });
}

function firstDataRow(rows: SheetRow[], table: Table): number {
  for (let r = table.dataStart; r < table.dataEnd; r += 1) {
    const row = rows[r] ?? [];
    for (let c = table.firstCol; c <= table.lastCol; c += 1) if (!isBlank(row[c])) return r;
  }
  return -1;
}

/** The variant of each table of a tab holding several (§1.1): « Réactif 1 », « clair »… */
function nameVariants(rows: SheetRow[], tables: Table[]) {
  if (tables.length < 2) return;
  tables.forEach((table, index) => {
    if (table.pkg.variant) {
      table.variant = table.pkg.variant;
      return;
    }
    const first = firstDataRow(rows, table);
    if (first >= 0 && table.firstCol > 0) {
      const row = rows[first] ?? [];
      for (let c = table.firstCol - 1; c >= 0; c -= 1) {
        const value = row[c];
        if (typeof value === "string" && text(value) && cellNumber(value) === null) {
          table.variant = text(value);
          table.variantCell = `${first},${c}`;
          return;
        }
      }
    }
    const above = table.header - 1;
    const lone = loneText(rows[above]);
    if (above >= 0 && lone >= table.firstCol && lone <= table.lastCol) {
      table.variant = text(rows[above][lone]);
      table.variantCell = `${above},${lone}`;
      return;
    }
    table.variant = `tableau ${index + 1}`;
  });
}

// ————— Rows —————

/** The fingerprint of a row (`StockMovement.importKey`, 64 hex). */
export function importKeyOf(parts: (string | number | null)[]): string {
  return createHash("sha256").update(JSON.stringify(["lot6a-v1", ...parts])).digest("hex");
}

const ORDER_REFERENCE_MAX = 64;
const LOT_MAX = 191;

export function parseStockWorkbook(sheets: ImportSheetInput[], options: { today: string }): StockWorkbook {
  const out: StockWorkbook = { sheets: sheets.length, tables: 0, dataRows: 0, articles: [], refused: [], warnings: [], ignored: [], emptySheets: [] };
  const names = new Map<string, string>();

  for (const sheet of sheets) {
    const sheetName = sheet.name.trim();
    const rows = sheet.rows;
    const tables = tablesOf(rows);
    nameVariants(rows, tables);
    const consumed = new Set<string>();
    const refuse = (line: number, message: string) => out.refused.push({ sheet: sheetName, line, message });
    const warn = (line: number, message: string) => out.warnings.push({ sheet: sheetName, line, message });
    for (const formula of sheet.blankFormulas ?? []) {
      warn(Number(/\d+$/.exec(formula)?.[0] ?? 0), `Formule sans résultat enregistré en ${formula} — lue vide (ouvrez et enregistrez le fichier dans Excel).`);
    }
    if (tables.length === 0) out.emptySheets.push(sheetName);
    out.tables += tables.length;

    for (const table of tables) {
      if (table.variantCell) consumed.add(table.variantCell);
      for (let r = table.header; r < table.dataStart; r += 1) (rows[r] ?? []).forEach((_, c) => consumed.add(`${r},${c}`));
      const name = (table.variant ? `${sheetName} — ${table.variant}` : sheetName).slice(0, 191);
      const key = headerKey(name);
      if (names.has(key)) {
        refuse(table.header + 1, `Article « ${name} » en double dans le classeur (déjà lu dans l'onglet « ${names.get(key)} ») — tableau ignoré.`);
        continue;
      }
      names.set(key, sheetName);
      const article: WorkbookArticle = {
        key,
        name,
        sheet: sheetName,
        variant: table.variant,
        unit: table.pkg.unit,
        packSize: table.pkg.size,
        location: null,
        line: table.header + 1,
        movements: [],
        lastStock: null,
        lastStockLine: null,
      };
      const seen = new Map<string, number>();
      let lastStockDay: string | null = null;
      const c = table.col;

      for (let r = table.dataStart; r < table.dataEnd; r += 1) {
        const row = rows[r] ?? [];
        const inside = (index: number) => (index >= 0 ? row[index] : null);
        let filled = false;
        for (let col = table.firstCol; col <= table.lastCol; col += 1) {
          if (!isBlank(row[col])) {
            filled = true;
            consumed.add(`${r},${col}`);
          }
        }
        if (!filled) continue;
        out.dataRows += 1;
        const line = r + 1;
        const location = text(inside(c.location));
        if (location) article.location = location.slice(0, 191);

        const day = cellDay(inside(c.date) ?? null);
        const entryRaw = inside(c.entry);
        const exitRaw = inside(c.exit);
        const stockRaw = inside(c.stock);
        const entry = isBlank(entryRaw) ? null : cellNumber(entryRaw ?? null);
        const exit = isBlank(exitRaw) ? null : cellNumber(exitRaw ?? null);
        let stock = isBlank(stockRaw) ? null : cellNumber(stockRaw ?? null);
        const checks: { raw: SheetCell | undefined; value: number | null; title: string }[] = [
          { raw: entryRaw, value: entry, title: "Entrée" },
          { raw: exitRaw, value: exit, title: "Sortie" },
          { raw: stockRaw, value: stock, title: "Stock" },
        ];
        const unreadable = checks.find(({ raw, value }) => !isBlank(raw) && value === null);
        if (unreadable) {
          refuse(line, `« ${unreadable.title} » illisible (« ${text(unreadable.raw)} ») — ligne ignorée.`);
          continue;
        }
        if ([entry, exit, stock].some((value) => value !== null && (value < 0 || value > MAX_STOCK_LEVEL))) {
          refuse(line, "Quantité négative ou hors limites — ligne ignorée.");
          continue;
        }
        if (!entry && !exit && !stock) {
          refuse(line, "Ligne sans quantité (ni entrée, ni sortie, ni stock) — ignorée.");
          continue;
        }
        if (!day) {
          refuse(line, isBlank(inside(c.date)) ? "Ligne sans date — ignorée." : `Date illisible (« ${text(inside(c.date))} ») — ligne ignorée.`);
          continue;
        }
        if (day > options.today) {
          refuse(line, `Date dans le futur (${day}) — ligne ignorée.`);
          continue;
        }

        let orderReference = text(inside(c.label)) || null;
        if (orderReference && /^\d{4}-\d{2}-\d{2}$/.test(orderReference)) {
          warn(line, `« Libellé » lu comme une date (${orderReference}) : un numéro de bon de commande converti par Excel ? Vérifiez la cellule (format Texte).`);
        }
        if (orderReference && orderReference.length > ORDER_REFERENCE_MAX) {
          warn(line, `Bon de commande tronqué à ${ORDER_REFERENCE_MAX} caractères.`);
          orderReference = orderReference.slice(0, ORDER_REFERENCE_MAX);
        }
        const lotRaw = inside(c.lot);
        const lot = isBlank(lotRaw) ? null : (typeof lotRaw === "number" ? String(lotRaw) : text(lotRaw)).slice(0, LOT_MAX);
        const expiryRaw = inside(c.expiry);
        const expiry = expiryOf(expiryRaw, sheet.monthCells?.has(`${r},${c.expiry}`) ?? false);
        if (expiry === null) warn(line, `Expiration illisible (« ${text(expiryRaw)} ») — importée sans expiration.`);
        const expiryDay = expiry ?? null;
        if (expiryDay && expiryDay < day) warn(line, `Expiration (${expiryDay}) antérieure à la date d'entrée (${day}) — saisie à vérifier.`);

        const priceOf = (index: number, title: string) => {
          const raw = inside(index);
          if (isBlank(raw)) return null;
          const value = cellNumber(raw ?? null);
          if (value === null || value < 0 || value > MAX_PRICE) {
            warn(line, `« ${title} » illisible (« ${text(raw)} ») — ignoré.`);
            return null;
          }
          return value;
        };
        const unitPrice = priceOf(c.unit, "prix unitaire");
        const totalPrice = priceOf(c.total, "prix total");

        // The « Stock » column in the article's unit: mL → packages for a « Entrée/1l » article.
        if (stock !== null && STOCK_IMPORT_QUANTITY_FROM_PRICE && table.stockMl && table.pkg.volumeMl) {
          stock = round2((stock * table.stockMl) / table.pkg.volumeMl);
        }
        const baseKey = [headerKey(sheetName), headerKey(table.variant ?? ""), day, orderReference, lot, text(expiryRaw), text(entryRaw), text(exitRaw), text(stockRaw), text(inside(c.unit)), text(inside(c.total))];
        const signature = JSON.stringify(baseKey);
        const occurrence = (seen.get(signature) ?? 0) + 1;
        seen.set(signature, occurrence);
        if (occurrence > 1) warn(line, "Ligne identique à une ligne précédente du même tableau — importée elle aussi.");

        const common = { sheet: sheetName, line, day, orderReference, lot, expiryDay };
        const opening = !entry && !exit && stock !== null;
        const quantityWritten = entry ?? (opening ? stock : null);
        let entryQuantity: number | null = null;
        if (quantityWritten) {
          const result = reconcile(quantityWritten, table.pkg.size, unitPrice, totalPrice);
          if (result.check === "non-departage") {
            warn(line, `Quantité × prix unitaire ≠ prix total — importée telle qu'écrite (${quantityWritten} × ${unitPrice} ≠ ${totalPrice}), à vérifier.`);
          } else if (result.check !== "ok" && result.check !== "sans-prix" && result.check !== "un-prix") {
            warn(line, `${PRICE_CHECK_LABELS[result.check][0].toUpperCase()}${PRICE_CHECK_LABELS[result.check].slice(1)}.`);
          }
          const unitPriceHT = result.unitPriceHT !== null && result.unitPriceHT > 0 && result.unitPriceHT <= MAX_PRICE ? round2(result.unitPriceHT) : null;
          entryQuantity = round2(result.quantity);
          if (entryQuantity <= 0) {
            refuse(line, "Quantité nulle une fois ramenée en conditionnements — ligne ignorée.");
            continue;
          }
          // The « Stock » written in pieces follows the quantity back to packages.
          if (stock !== null && STOCK_IMPORT_QUANTITY_FROM_PRICE && table.pkg.size && table.pkg.size > 1) {
            if (result.check === "quantite-pieces" && !opening) {
              if (stock >= table.pkg.size) stock = round2(stock / table.pkg.size);
            }
            else if (!opening && entry && close(stock, entry * table.pkg.size) && !close(stock, entry)) {
              stock = round2(stock / table.pkg.size);
              warn(line, "« Stock » écrit en pièces — ramené en conditionnements.");
            }
          }
          if (opening) stock = entryQuantity;
          article.movements.push({
            ...common,
            type: "ENTREE",
            opening,
            quantity: entryQuantity,
            unitPriceHT,
            check: result.check,
            importKey: importKeyOf([...baseKey, "E", occurrence]),
          });
        }
        if (exit) {
          article.movements.push({
            ...common,
            type: "SORTIE",
            opening: false,
            quantity: round2(exit),
            unitPriceHT: null,
            check: "sans-prix",
            importKey: importKeyOf([...baseKey, "S", occurrence]),
          });
        }
        // The latest row's « Stock » (by day, then by line): the level the sheet ends on.
        if (stock !== null && (lastStockDay === null || day >= lastStockDay)) {
          article.lastStock = round2(stock);
          article.lastStockLine = line;
          lastStockDay = day;
        }
      }
      out.articles.push(article);
    }

    // Everything else written in the tab: listed, never read.
    rows.forEach((row, r) =>
      (row ?? []).forEach((value, c) => {
        if (!isBlank(value) && !consumed.has(`${r},${c}`)) {
          out.ignored.push({ sheet: sheetName, cell: `${letters(c)}${r + 1}`, text: text(value).slice(0, 80) });
        }
      })
    );
  }
  return out;
}

// ————— Format detection (M11) —————

export type StockImportFormat = "par-article" | "registre";

const ORDER_NUMBER = /^(bc\s*)?\d{1,5}\s*\/\s*\d{2,4}$/i;

/**
 * « Une feuille par article » when the workbook has more than one non-empty
 * sheet, or when most « Libellé » of its only sheet read like bons de
 * commande (« 12/26 », « BC 64/26 »); else the single register of lot 3D.
 */
export function detectStockFormat(sheets: ImportSheetInput[]): StockImportFormat {
  const filled = sheets.filter((sheet) => sheet.rows.some((row) => row.some((value) => !isBlank(value))));
  if (filled.length > 1) return "par-article";
  const rows = filled[0]?.rows ?? [];
  const at = rows.findIndex((row) => (row ?? []).some((value) => headerKey(value) === "libelle"));
  if (at < 0) return "registre";
  const col = rows[at].findIndex((value) => headerKey(value) === "libelle");
  const labels = rows.slice(at + 1).map((row) => text((row ?? [])[col])).filter(Boolean);
  if (labels.length === 0) return isHeaderRow(rows[at]) ? "par-article" : "registre";
  const orders = labels.filter((label) => ORDER_NUMBER.test(label)).length;
  return orders * 2 > labels.length ? "par-article" : "registre";
}

// ————— The plan against the database (M12) —————

export type ExistingArticle = {
  id: string;
  name: string;
  quantity: number;
  archived: boolean;
  /** Movements recorded without an `importKey` — by hand, or by lot 3D's import. */
  handMovements: number;
  /** The day of its latest movement, « AAAA-MM-JJ », or null. */
  lastDay: string | null;
};

export type ArticleStatus = "a-creer" | "reprise" | "suivi-a-la-main" | "archive";

export type PlannedMovement = WorkbookMovement & {
  levelBefore: number;
  levelAfter: number;
};

export type PlannedAdjustment = { from: number; to: number; day: string; importKey: string };

export type ArticlePlan = {
  article: WorkbookArticle;
  status: ArticleStatus;
  existingId: string | null;
  levelNow: number;
  /** Written, in date order. */
  movements: PlannedMovement[];
  adjustment: PlannedAdjustment | null;
  levelAfter: number;
  /** Rows already imported (their `importKey` is known). */
  skipped: number;
  refused: WorkbookNote[];
};

export type WorkbookPlan = {
  articles: ArticlePlan[];
  totals: {
    toCreate: number;
    resumed: number;
    untouched: number;
    movements: number;
    adjustments: number;
    skipped: number;
    refused: number;
  };
};

export const ARTICLE_STATUS_LABELS: Record<ArticleStatus, string> = {
  "a-creer": "à créer",
  reprise: "déjà importé",
  "suivi-a-la-main": "suivi à la main — non touché",
  archive: "archivé — non touché",
};

/** The fingerprint of the level adjustment of an article (its last « Stock » and the rows before it). */
export function adjustmentKeyOf(article: WorkbookArticle): string {
  return importKeyOf([article.key, "niveau", article.lastStock, article.lastStockLine, article.movements.at(-1)?.importKey ?? null]);
}

/** Every fingerprint the plan may look up: the rows', and each article's adjustment. */
export function workbookKeys(parsed: StockWorkbook): string[] {
  return parsed.articles.flatMap((article) => [...article.movements.map((movement) => movement.importKey), adjustmentKeyOf(article)]);
}

/**
 * What the import will write, article by article: a new article, or one
 * already imported (only imported movements — `handMovements` 0) resumed
 * with the rows it does not hold yet; an article followed by hand, or
 * archived, is left alone. The new rows go in date order (file order within
 * a day) from the article's level; a row dated before the article's latest
 * movement is refused (« à saisir à la main ») so that no recorded level is
 * rewritten; an exit beyond the level is refused. Then, with
 * `STOCK_IMPORT_LEVEL_FROM_FILE`, one adjustment dated `today` to the file's
 * last « Stock ».
 */
export function planStockWorkbook(
  parsed: StockWorkbook,
  existing: Map<string, ExistingArticle>,
  importedKeys: Set<string>,
  today: string
): WorkbookPlan {
  const articles: ArticlePlan[] = parsed.articles.map((article) => {
    const known = existing.get(article.key) ?? null;
    const status: ArticleStatus = !known ? "a-creer" : known.archived ? "archive" : known.handMovements > 0 ? "suivi-a-la-main" : "reprise";
    const levelNow = known?.quantity ?? 0;
    const plan: ArticlePlan = {
      article,
      status,
      existingId: known?.id ?? null,
      levelNow,
      movements: [],
      adjustment: null,
      levelAfter: levelNow,
      skipped: 0,
      refused: [],
    };
    if (status === "suivi-a-la-main" || status === "archive") return plan;

    const fresh = article.movements.filter((movement) => {
      if (!importedKeys.has(movement.importKey)) return true;
      plan.skipped += 1;
      return false;
    });
    const ordered = fresh.map((movement, index) => ({ movement, index })).sort((a, b) => a.movement.day.localeCompare(b.movement.day) || a.index - b.index);
    let level = levelNow;
    const floor = known?.lastDay ?? null;
    for (const { movement } of ordered) {
      const refuse = (message: string) => plan.refused.push({ sheet: movement.sheet, line: movement.line, message });
      if (floor && movement.day < floor) {
        refuse(`Datée du ${movement.day}, avant le dernier mouvement de l'article (${floor}) — à saisir à la main.`);
        continue;
      }
      const result = applyMovement(level, movement.type, movement.quantity);
      if (!result.ok) {
        refuse(`${result.error} — ligne ignorée.`);
        continue;
      }
      plan.movements.push({ ...movement, levelBefore: level, levelAfter: result.next });
      level = result.next;
    }
    if (STOCK_IMPORT_LEVEL_FROM_FILE && article.lastStock !== null && Math.abs(article.lastStock - level) >= 0.005) {
      const importKey = adjustmentKeyOf(article);
      if (!importedKeys.has(importKey)) {
        plan.adjustment = { from: level, to: article.lastStock, day: today, importKey };
        level = article.lastStock;
      }
    }
    plan.levelAfter = level;
    return plan;
  });

  const writes = (plan: ArticlePlan) => plan.status === "a-creer" || plan.status === "reprise";
  return {
    articles,
    totals: {
      toCreate: articles.filter((plan) => plan.status === "a-creer").length,
      resumed: articles.filter((plan) => plan.status === "reprise" && (plan.movements.length > 0 || plan.adjustment)).length,
      untouched: articles.filter((plan) => !writes(plan)).length,
      movements: articles.reduce((sum, plan) => sum + plan.movements.length, 0),
      adjustments: articles.filter((plan) => plan.adjustment).length,
      skipped: articles.reduce((sum, plan) => sum + plan.skipped, 0),
      refused: parsed.refused.length + articles.reduce((sum, plan) => sum + plan.refused.length, 0),
    },
  };
}

/** Anything to write? (an article to create, or rows / an adjustment for one already imported). */
export function planWrites(plan: WorkbookPlan): boolean {
  return plan.articles.some((article) => article.status === "a-creer" || (article.status === "reprise" && (article.movements.length > 0 || article.adjustment)));
}

/** « AAAA-MM-JJ » → the UTC midnight the DATE columns store. */
export function dayDate(day: string): Date {
  return parseIsoDay(day) ?? new Date(`${day}T00:00:00Z`);
}

