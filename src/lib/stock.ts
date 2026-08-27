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
