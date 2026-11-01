import type { Prisma } from "@/generated/prisma/client";

/**
 * What the stock journal reads of a movement (lot 3D, M3) — shared by its
 * page, its route and its export so the three read the same columns.
 */
export const STOCK_JOURNAL_SELECT = {
  id: true,
  type: true,
  quantity: true,
  lot: true,
  expiryDate: true,
  note: true,
  movementDate: true,
  createdAt: true,
  levelBefore: true,
  levelAfter: true,
  unitPriceHT: true,
  item: { select: { id: true, name: true, unit: true, location: true } },
  createdBy: { select: { name: true } },
} satisfies Prisma.StockMovementSelect;

/**
 * By the movement's day, then its recording: a movement of before lot 3D
 * (no `movementDate`) is older than every dated one.
 */
export const STOCK_JOURNAL_ORDER_DESC = [
  { movementDate: { sort: "desc", nulls: "last" } },
  { createdAt: "desc" },
  { id: "desc" },
] satisfies Prisma.StockMovementOrderByWithRelationInput[];

export const STOCK_JOURNAL_ORDER_ASC = [
  { movementDate: { sort: "asc", nulls: "first" } },
  { createdAt: "asc" },
  { id: "asc" },
] satisfies Prisma.StockMovementOrderByWithRelationInput[];
