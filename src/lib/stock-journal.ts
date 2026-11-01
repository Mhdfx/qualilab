import { isoDayOf, parseIsoDay } from "./date-only";
import { parseLabDayRange } from "./lab-day-range";
import { toMoney, type MoneyInput } from "./money";
import { entryAmount, type MovementType } from "./stock";

/**
 * Le journal des mouvements de stock (lot 3D, RETOUR-LABO-28-10.md M3,
 * fichier 3.4 « Fiche de stock ») — pure: the rows, columns and filters of
 * /magasin/stock/journal, of `GET /api/stock/journal` and of its Excel
 * export.
 *
 * One chronological register for EVERY article, in the template's columns
 * and order: Date | Libellé | Lot | Expiration | Entrée | Sortie | Stock |
 * Prix (DH HT, two sub-columns: unit price and amount — hypothèse R-23) |
 * Lieu de stockage; then ours: unit, type, note, who.
 *
 * - « Date »: the movement's day (`movementDate`, M1); a movement recorded
 *   before lot 3D has none — the day of its recording stands for it.
 * - « Stock »: the level right after the movement was recorded
 *   (`levelAfter`, written in the guarded transaction); empty before lot 3D.
 *   Hypothèse (review of 01/11, RETOUR §5 M3): it is the level AT THE
 *   RECORDING, not recomputed — a movement dated before movements already
 *   recorded (antidaté) shows the level when it was typed, so the column
 *   does not follow a running balance by day for that article.
 * - An inventory adjustment (AJUSTEMENT) shows its difference in « Entrée »
 *   or « Sortie » when the level before it is known, and the counted level
 *   in « Stock ».
 */

export const STOCK_JOURNAL_EXPORT_PATH = "/api/stock/journal/export";
export const MAX_STOCK_EXPORT_ROWS = 20_000;

export const MOVEMENT_TYPE_LABELS: Record<MovementType, string> = {
  ENTREE: "Entrée",
  SORTIE: "Sortie",
  AJUSTEMENT: "Ajustement (inventaire)",
};

export type StockJournalMovement = {
  id: string;
  type: MovementType;
  quantity: MoneyInput;
  lot: string | null;
  expiryDate: Date | null;
  note: string | null;
  movementDate: Date | null;
  createdAt: Date;
  levelBefore: MoneyInput;
  levelAfter: MoneyInput;
  unitPriceHT: MoneyInput;
  item: { id: string; name: string; unit: string; location: string | null };
  createdBy: { name: string } | null;
};

export type StockJournalRow = {
  id: string;
  /** « AAAA-MM-JJ ». */
  day: string;
  label: string;
  lot: string;
  /** « AAAA-MM-JJ » or "". */
  expiry: string;
  entry: number | null;
  exit: number | null;
  stock: number | null;
  unitPrice: number | null;
  amount: number | null;
  location: string;
  unit: string;
  type: string;
  note: string;
  by: string;
  itemId: string;
};

const has = (value: MoneyInput) => value !== null && value !== undefined;
const cents = (value: number) => Math.round(value * 100);

/** The movement's day: its `movementDate`, else the lab's day of its recording. */
export function movementDay(movement: { movementDate: Date | null; createdAt: Date }, labDay: (at: Date) => string): string {
  return movement.movementDate ? isoDayOf(movement.movementDate) : labDay(movement.createdAt);
}

export function stockJournalRows(movements: StockJournalMovement[], labDay: (at: Date) => string): StockJournalRow[] {
  return movements.map((movement) => {
    const quantity = toMoney(movement.quantity);
    const before = has(movement.levelBefore) ? toMoney(movement.levelBefore) : null;
    let entry: number | null = null;
    let exit: number | null = null;
    if (movement.type === "ENTREE") entry = quantity;
    else if (movement.type === "SORTIE") exit = quantity;
    else if (before !== null) {
      const delta = (cents(quantity) - cents(before)) / 100;
      if (delta > 0) entry = delta;
      else if (delta < 0) exit = -delta;
    }
    const unitPrice = movement.type === "ENTREE" && has(movement.unitPriceHT) ? toMoney(movement.unitPriceHT) : null;
    return {
      id: movement.id,
      day: movementDay(movement, labDay),
      label: movement.item.name,
      lot: movement.lot ?? "",
      expiry: movement.expiryDate ? isoDayOf(movement.expiryDate) : "",
      entry,
      exit,
      stock: has(movement.levelAfter) ? toMoney(movement.levelAfter) : movement.type === "AJUSTEMENT" ? quantity : null,
      unitPrice,
      amount: entry !== null && movement.type === "ENTREE" ? entryAmount(quantity, unitPrice) : null,
      location: movement.item.location ?? "",
      unit: movement.item.unit,
      type: MOVEMENT_TYPE_LABELS[movement.type],
      note: movement.note ?? "",
      by: movement.createdBy?.name ?? "",
      itemId: movement.item.id,
    };
  });
}

export type StockJournalColumn = {
  header: string;
  key: keyof StockJournalRow;
  width: number;
  format?: "day" | "money" | "quantity";
};

/** The template's columns in its order, then ours. */
export const STOCK_JOURNAL_COLUMNS: StockJournalColumn[] = [
  { header: "Date", key: "day", width: 12, format: "day" },
  { header: "Libellé", key: "label", width: 32 },
  { header: "Lot", key: "lot", width: 14 },
  { header: "Expiration", key: "expiry", width: 12, format: "day" },
  { header: "Entrée", key: "entry", width: 10, format: "quantity" },
  { header: "Sortie", key: "exit", width: 10, format: "quantity" },
  { header: "Stock", key: "stock", width: 10, format: "quantity" },
  { header: "Prix unitaire (DH HT)", key: "unitPrice", width: 14, format: "money" },
  { header: "Montant (DH HT)", key: "amount", width: 14, format: "money" },
  { header: "Lieu de stockage", key: "location", width: 20 },
  { header: "Unité", key: "unit", width: 10 },
  { header: "Type", key: "type", width: 22 },
  { header: "Note", key: "note", width: 28 },
  { header: "Saisi par", key: "by", width: 18 },
];

export type StockJournalFilters = {
  /** Inclusive, « AAAA-MM-JJ »; null = open. */
  fromDay: string | null;
  toDay: string | null;
  itemId: string | null;
  type: MovementType | null;
};

const TYPES: MovementType[] = ["ENTREE", "SORTIE", "AJUSTEMENT"];

/** `?du=&au=&article=&type=` → the filters; a value present but unreadable is refused. */
export function stockJournalFilters(params: {
  du?: string | null;
  au?: string | null;
  article?: string | null;
  type?: string | null;
}): { ok: true; filters: StockJournalFilters } | { ok: false; error: string } {
  const du = params.du?.trim() || null;
  const au = params.au?.trim() || null;
  if (du && !parseIsoDay(du)) return { ok: false, error: "La date de début est invalide (AAAA-MM-JJ)." };
  if (au && !parseIsoDay(au)) return { ok: false, error: "La date de fin est invalide (AAAA-MM-JJ)." };
  if (du && au && au < du) return { ok: false, error: "La fin de la période précède son début." };
  const type = params.type?.trim() || null;
  if (type && !TYPES.includes(type as MovementType)) return { ok: false, error: "Type de mouvement invalide." };
  return {
    ok: true,
    filters: { fromDay: du, toDay: au, itemId: params.article?.trim() || null, type: (type as MovementType) ?? null },
  };
}

/**
 * The database filter of the journal. A movement of before lot 3D has no
 * `movementDate`: its recording instant is read on the lab's clock instead.
 */
export function stockJournalWhere(filters: StockJournalFilters) {
  const where: Record<string, unknown> = {};
  if (filters.itemId) where.itemId = filters.itemId;
  if (filters.type) where.type = filters.type;
  if (filters.fromDay || filters.toDay) {
    const days = {
      ...(filters.fromDay ? { gte: parseIsoDay(filters.fromDay) as Date } : {}),
      ...(filters.toDay ? { lte: parseIsoDay(filters.toDay) as Date } : {}),
    };
    const range = parseLabDayRange(filters.fromDay, filters.toDay);
    const instants = {
      ...(range.from ? { gte: range.from } : {}),
      ...(range.until ? { lt: range.until } : {}),
    };
    where.OR = [{ movementDate: days }, { movementDate: null, createdAt: instants }];
  }
  return where;
}

/** « journal-du-stock-2026-10-01-au-2026-10-31.xlsx ». */
export function stockJournalFileName(filters: StockJournalFilters, today: string): string {
  const period =
    filters.fromDay && filters.toDay
      ? `${filters.fromDay}-au-${filters.toDay}`
      : filters.fromDay
        ? `depuis-${filters.fromDay}`
        : filters.toDay
          ? `jusqu-au-${filters.toDay}`
          : `au-${today}`;
  return `journal-du-stock-${period}.xlsx`;
}

/** The export's address for the filters shown on the screen. */
export function stockJournalHref(filters: { du?: string; au?: string; article?: string; type?: string }, base = STOCK_JOURNAL_EXPORT_PATH): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/** An Excel day cell from « AAAA-MM-JJ » (its UTC midnight), or null. */
export function excelDayOf(day: string): Date | null {
  return day ? parseIsoDay(day) : null;
}
