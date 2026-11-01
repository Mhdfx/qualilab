import "server-only";
import { prisma } from "./prisma";
import { toMoney } from "./money";
import { isoDayOf } from "./date-only";
import { labDayOf } from "./lab-time";
import { isLowStock, itemExpiry, lastUnitPrice, stockValue, type ItemExpiry, type StockEntry } from "./stock";

export { knownLocations, stockTotals } from "./stock";

/**
 * The articles as the magasin shows them (lot 3D): level, threshold, place
 * (M1), the expiry of the units presumed on the shelf (M4, FIFO) and the
 * last unit price with the stock's value (M5). Shared by /magasin, the
 * stock page and `GET /api/stock/items` — one computation, one answer.
 */

export type StockOverviewRow = {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  location: string | null;
  quantity: number;
  minQuantity: number;
  low: boolean;
  archived: boolean;
  expiry: ItemExpiry | null;
  lastUnitPrice: number | null;
  value: number | null;
};

export async function loadStockOverview(options: { includeArchived?: boolean; expiryWarningDays: number; now?: Date }) {
  const items = await prisma.stockItem.findMany({
    where: options.includeArchived ? undefined : { archived: false },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const entries = await prisma.stockMovement.findMany({
    where: { type: "ENTREE", itemId: { in: items.map((item) => item.id) } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { itemId: true, movementDate: true, createdAt: true, quantity: true, lot: true, expiryDate: true, unitPriceHT: true },
  });
  const byItem = new Map<string, StockEntry[]>();
  for (const entry of entries) {
    const list = byItem.get(entry.itemId) ?? [];
    list.push({
      day: entry.movementDate ? isoDayOf(entry.movementDate) : labDayOf(entry.createdAt),
      quantity: toMoney(entry.quantity),
      lot: entry.lot,
      expiryDay: entry.expiryDate ? isoDayOf(entry.expiryDate) : null,
      unitPriceHT: entry.unitPriceHT === null ? null : toMoney(entry.unitPriceHT),
    });
    byItem.set(entry.itemId, list);
  }
  const today = labDayOf(options.now ?? new Date());

  return items.map((item): StockOverviewRow => {
    const quantity = toMoney(item.quantity);
    const minQuantity = toMoney(item.minQuantity);
    const itemEntries = byItem.get(item.id) ?? [];
    const price = lastUnitPrice(itemEntries);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      unit: item.unit,
      location: item.location,
      quantity,
      minQuantity,
      low: isLowStock(quantity, minQuantity),
      archived: item.archived,
      expiry: itemExpiry(itemEntries, quantity, today, options.expiryWarningDays),
      lastUnitPrice: price,
      value: stockValue(quantity, price),
    };
  });
}
