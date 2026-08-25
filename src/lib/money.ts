import type { Prisma } from "@/generated/prisma/client";

/**
 * Money.
 *
 * Amounts are stored as SQL `DECIMAL(12,2)` — exact — rather than as floating
 * point, because an invoice is a legal document and 0.1 + 0.2 must not become
 * 0.30000000000000004 in a total the client is asked to pay.
 *
 * Prisma hands those columns back as `Decimal` objects, and JSON turns them
 * into strings, so every value crossing a boundary — API response, server
 * component to client component — goes through `toMoney()` first. The screens
 * then work with plain numbers, which are exact for the amounts a laboratory
 * invoices (well inside 2^53 once rounded to centimes).
 */

export type MoneyInput =
  | Prisma.Decimal
  | number
  | string
  | null
  | undefined;

/** Reads any stored/serialised amount back as a number, rounded to centimes. */
export function toMoney(value: MoneyInput): number {
  if (value === null || value === undefined) return 0;

  const asNumber =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number(value.toString());

  return Number.isFinite(asNumber) ? Math.round(asNumber * 100) / 100 : 0;
}

/** True when an amount is a usable, non-negative figure. */
export function isValidAmount(value: unknown): value is number {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0;
}
