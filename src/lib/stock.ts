/**
 * Stock and payment-due arithmetic — Phase 6 (Achat & Stock).
 *
 * Pure functions: the API routes and the screens share exactly these rules,
 * and they are tested without a database. Quantities travel as plain numbers
 * (rounded to 2 decimals, same discipline as money) — the DECIMAL columns
 * are the storage truth, `toMoney()` reads them back.
 */

export type MovementType = "ENTREE" | "SORTIE" | "AJUSTEMENT";

export type MovementResult =
  | { ok: true; next: number }
  | { ok: false; error: string };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** The largest level (or movement) a DECIMAL(12,2) quantity column holds. */
export const MAX_STOCK_LEVEL = 9_999_999_999.99;

/**
 * The stock level after a movement. ENTREE adds, SORTIE subtracts and can
 * never take the level below zero (a negative stock is a data-entry error,
 * not a state), AJUSTEMENT sets the absolute counted quantity — the
 * inventory correction case.
 */
export function applyMovement(
  current: number,
  type: MovementType,
  quantity: number
): MovementResult {
  if (!Number.isFinite(quantity) || quantity < 0) {
    return { ok: false, error: "La quantité doit être un nombre positif." };
  }
  if (type !== "AJUSTEMENT" && quantity === 0) {
    return { ok: false, error: "La quantité d'un mouvement ne peut pas être zéro." };
  }
  // DECIMAL(12,2): a level or a movement beyond it would crash the insert.
  if (quantity > MAX_STOCK_LEVEL || (type === "ENTREE" && current + quantity > MAX_STOCK_LEVEL)) {
    return { ok: false, error: "Quantité hors limites : vérifiez la saisie." };
  }

  if (type === "ENTREE") return { ok: true, next: round2(current + quantity) };
  if (type === "AJUSTEMENT") return { ok: true, next: round2(quantity) };

  const next = round2(current - quantity);
  if (next < 0) {
    return {
      ok: false,
      error: `Stock insuffisant : ${round2(current)} en stock, sortie de ${round2(quantity)} demandée.`,
    };
  }
  return { ok: true, next };
}

/** A threshold of 0 means "no alert for this article". */
export function isLowStock(quantity: number, minQuantity: number): boolean {
  return minQuantity > 0 && quantity <= minQuantity;
}

export type DueState = "RETARD" | "BIENTOT" | "OK";

/** How many days before the due date the alert starts. */
export const DUE_SOON_DAYS = 7;

/**
 * Where an unpaid invoice stands against its due date: overdue, due within
 * DUE_SOON_DAYS, or comfortably ahead. Computed on calendar days so an
 * invoice due today is BIENTOT all day, then RETARD from the next day.
 */
export function dueState(dueDate: Date, now: Date = new Date()): DueState {
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round(
    (startOfDay(dueDate) - startOfDay(now)) / 86_400_000
  );
  if (days < 0) return "RETARD";
  if (days <= DUE_SOON_DAYS) return "BIENTOT";
  return "OK";
}

/** Due date implied by a supplier's payment convention. */
export function dueDateFor(issueDate: Date, paymentTermDays: number): Date {
  const due = new Date(issueDate);
  due.setDate(due.getDate() + Math.max(0, paymentTermDays));
  return due;
}

// ————— Lot 3D (RETOUR-LABO-28-10.md M1, M4, M5) —————

/** The days between two calendar days « AAAA-MM-JJ » (b − a). */
function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb, db] = b.split("-").map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86_400_000);
}

/** The expiry window's default (days), also the settings' default. */
export const DEFAULT_EXPIRY_WARNING_DAYS = 30;

export type ExpiryState = "PERIME" | "BIENTOT";

export const EXPIRY_STATE_LABELS: Record<ExpiryState, string> = {
  PERIME: "Périmé",
  BIENTOT: "Expire bientôt",
};

/**
 * M4 — an expiry day against today (both « AAAA-MM-JJ », the lab's
 * calendar): « Périmé » once the day is past, « Expire bientôt » within the
 * window (the day itself included), else nothing.
 */
export function expiryState(expiryDay: string, today: string, windowDays: number): ExpiryState | null {
  const left = daysBetween(today, expiryDay);
  if (left < 0) return "PERIME";
  if (left <= windowDays) return "BIENTOT";
  return null;
}

export type StockEntry = {
  /** The entry's day « AAAA-MM-JJ » (its movement day). */
  day: string;
  quantity: number;
  lot: string | null;
  /** « AAAA-MM-JJ », or null when not recorded. */
  expiryDay: string | null;
  unitPriceHT: number | null;
};

/**
 * M4 — the entries presumed still on the shelf. The stock is kept per
 * article, not per lot (hypothèse, à confirmer par R-23): the oldest units
 * are presumed to leave first (FIFO), so today's level is made of the most
 * recent entries. `entries`: the article's entries, oldest first. Walks
 * them newest first until the level is reached; the
 * oldest one kept may be partly consumed (`remaining`).
 */
export function entriesInStock(entries: StockEntry[], level: number): (StockEntry & { remaining: number })[] {
  // `entries` come oldest first: reversed, then a stable sort by day keeps
  // the later entry of a same day first.
  const newestFirst = [...entries].reverse().sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
  const kept: (StockEntry & { remaining: number })[] = [];
  let left = Math.round(level * 100);
  for (const entry of newestFirst) {
    if (left <= 0) break;
    const quantity = Math.round(entry.quantity * 100);
    const remaining = Math.min(quantity, left);
    kept.push({ ...entry, remaining: remaining / 100 });
    left -= remaining;
  }
  return kept;
}

export type ItemExpiry = { state: ExpiryState; expiryDay: string; lot: string | null };

/**
 * M4 — the worst expiry of the units presumed on the shelf (FIFO): the
 * earliest expiry day among them, « Périmé » or « Expire bientôt »; null
 * when none is within the window (or none was recorded).
 */
export function itemExpiry(entries: StockEntry[], level: number, today: string, windowDays: number): ItemExpiry | null {
  const dated = entriesInStock(entries, level)
    .filter((entry) => entry.expiryDay !== null)
    .sort((a, b) => ((a.expiryDay as string) < (b.expiryDay as string) ? -1 : 1));
  for (const entry of dated) {
    const state = expiryState(entry.expiryDay as string, today, windowDays);
    if (state) return { state, expiryDay: entry.expiryDay as string, lot: entry.lot };
  }
  return null;
}

/** M5 — the last unit price HT paid (the most recent priced entry), or null. */
export function lastUnitPrice(entries: StockEntry[]): number | null {
  const priced = entries.filter((entry) => entry.unitPriceHT !== null && entry.unitPriceHT > 0);
  if (priced.length === 0) return null;
  const latest = priced.reduce((best, entry) => (entry.day >= best.day ? entry : best));
  return latest.unitPriceHT;
}

/**
 * M5 — the value of the stock, HT: the level at the last unit price
 * (hypothèse, à confirmer par R-23 — not a weighted average); null when no
 * price was ever recorded. To the centime.
 */
export function stockValue(level: number, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  return Math.round(Math.round(level * 100) * unitPrice) / 100;
}

/** M5 — an entry's « Montant HT »: quantity × unit price, to the centime; null without a price. */
export function entryAmount(quantity: number, unitPrice: number | null): number | null {
  if (unitPrice === null) return null;
  return Math.round(Math.round(quantity * 100) * unitPrice) / 100;
}

/**
 * M1 — a movement's day: today on the lab's clock by default, never in the
 * future. Null when acceptable; the French refusal else.
 */
export function movementDayError(day: string, today: string): string | null {
  if (day > today) return "La date du mouvement ne peut pas être dans le futur.";
  return null;
}

/** M5 — the value of the whole stock (HT, at the last prices) and how many articles in stock have no price yet. */
export function stockTotals(rows: { value: number | null; quantity: number }[]) {
  const priced = rows.filter((row) => row.value !== null);
  return {
    value: priced.reduce((sum, row) => sum + Math.round((row.value ?? 0) * 100), 0) / 100,
    unpriced: rows.filter((row) => row.value === null && row.quantity > 0).length,
  };
}

/** M1 — the places already used: the suggestions of « Lieu de stockage ». */
export function knownLocations(rows: { location: string | null }[]): string[] {
  return [...new Set(rows.map((row) => row.location?.trim()).filter((value): value is string => !!value))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );
}
