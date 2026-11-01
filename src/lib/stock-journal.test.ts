import { describe, expect, it } from "vitest";
import { parseIsoDay } from "./date-only";
import {
  STOCK_JOURNAL_COLUMNS,
  excelDayOf,
  movementDay,
  stockJournalFileName,
  stockJournalFilters,
  stockJournalHref,
  stockJournalRows,
  stockJournalWhere,
  type StockJournalMovement,
} from "./stock-journal";

/**
 * Lot 3D, M3 — le journal des mouvements de stock: every article in one
 * register, in the template « Fiche de stock »'s columns and order.
 */

const d = (day: string) => parseIsoDay(day) as Date;
const labDay = (at: Date) => at.toISOString().slice(0, 10);

const movement = (patch: Partial<StockJournalMovement> = {}): StockJournalMovement => ({
  id: "m1",
  type: "ENTREE",
  quantity: 10,
  lot: "L-42",
  expiryDate: d("2027-03-31"),
  note: null,
  movementDate: d("2026-10-30"),
  createdAt: new Date("2026-10-31T09:00:00Z"),
  levelBefore: 5,
  levelAfter: 15,
  unitPriceHT: 12.5,
  item: { id: "i1", name: "Gélose PCA", unit: "boîte", location: "Réfrigérateur 2" },
  createdBy: { name: "Magasinier" },
  ...patch,
});

describe("the register's columns", () => {
  it("keeps the template's columns in its order, the price in two sub-columns", () => {
    expect(STOCK_JOURNAL_COLUMNS.slice(0, 10).map((column) => column.header)).toEqual([
      "Date",
      "Libellé",
      "Lot",
      "Expiration",
      "Entrée",
      "Sortie",
      "Stock",
      "Prix unitaire (DH HT)",
      "Montant (DH HT)",
      "Lieu de stockage",
    ]);
  });
});

describe("stockJournalRows", () => {
  it("writes an entry with its day, lot, expiry, level after, price and amount", () => {
    expect(stockJournalRows([movement()], labDay)[0]).toMatchObject({
      day: "2026-10-30",
      label: "Gélose PCA",
      lot: "L-42",
      expiry: "2027-03-31",
      entry: 10,
      exit: null,
      stock: 15,
      unitPrice: 12.5,
      amount: 125,
      location: "Réfrigérateur 2",
      type: "Entrée",
      by: "Magasinier",
    });
  });

  it("puts an exit in « Sortie », without a price", () => {
    expect(stockJournalRows([movement({ type: "SORTIE", quantity: 3, levelBefore: 15, levelAfter: 12, unitPriceHT: null })], labDay)[0]).toMatchObject({
      entry: null,
      exit: 3,
      stock: 12,
      unitPrice: null,
      amount: null,
    });
  });

  it("shows an inventory adjustment's difference, and the counted level", () => {
    const down = stockJournalRows([movement({ type: "AJUSTEMENT", quantity: 8, levelBefore: 12, levelAfter: 8 })], labDay)[0];
    expect(down).toMatchObject({ entry: null, exit: 4, stock: 8, type: "Ajustement (inventaire)" });
    const up = stockJournalRows([movement({ type: "AJUSTEMENT", quantity: 14, levelBefore: 12, levelAfter: 14 })], labDay)[0];
    expect(up).toMatchObject({ entry: 2, exit: null, stock: 14, amount: null });
  });

  it("shows a backdated movement's level at its recording, not a running balance by day (hypothèse, RETOUR §5 M3)", () => {
    // 30/10: entry of 10 recorded (5 → 15). Then an exit of 3 recorded on 31/10 but dated 29/10 (15 → 12).
    const rows = stockJournalRows(
      [
        movement({ id: "m2", type: "SORTIE", quantity: 3, movementDate: d("2026-10-29"), levelBefore: 15, levelAfter: 12, unitPriceHT: null }),
        movement(),
      ],
      labDay
    );
    expect(rows.map((row) => [row.day, row.stock])).toEqual([
      ["2026-10-29", 12],
      ["2026-10-30", 15],
    ]);
  });

  it("reads a movement of before lot 3D by its recording day, its level unknown", () => {
    const old = movement({ movementDate: null, levelBefore: null, levelAfter: null, unitPriceHT: null });
    expect(stockJournalRows([old], labDay)[0]).toMatchObject({ day: "2026-10-31", stock: null, unitPrice: null });
    expect(movementDay(old, labDay)).toBe("2026-10-31");
    // An old adjustment still says the level it counted.
    expect(stockJournalRows([{ ...old, type: "AJUSTEMENT", quantity: 7 }], labDay)[0]).toMatchObject({ entry: null, exit: null, stock: 7 });
  });
});

describe("the journal's filters", () => {
  it("reads a period, an article and a type; refuses what it cannot read", () => {
    expect(stockJournalFilters({ du: "2026-10-01", au: "2026-10-31", article: "i1", type: "SORTIE" })).toEqual({
      ok: true,
      filters: { fromDay: "2026-10-01", toDay: "2026-10-31", itemId: "i1", type: "SORTIE" },
    });
    expect(stockJournalFilters({})).toEqual({ ok: true, filters: { fromDay: null, toDay: null, itemId: null, type: null } });
    expect(stockJournalFilters({ du: "2026-02-30" }).ok).toBe(false);
    expect(stockJournalFilters({ du: "2026-10-31", au: "2026-10-01" }).ok).toBe(false);
    expect(stockJournalFilters({ type: "VOL" }).ok).toBe(false);
  });

  it("filters by the movement's day, or the recording instant of an old movement", () => {
    const where = stockJournalWhere({ fromDay: "2026-10-01", toDay: "2026-10-31", itemId: "i1", type: null }) as {
      itemId: string;
      OR: [{ movementDate: { gte: Date; lte: Date } }, { movementDate: null; createdAt: { gte: Date; lt: Date } }];
    };
    expect(where.itemId).toBe("i1");
    expect(where.OR[0].movementDate.gte.toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(where.OR[0].movementDate.lte.toISOString().slice(0, 10)).toBe("2026-10-31");
    expect(where.OR[1].movementDate).toBeNull();
    expect(where.OR[1].createdAt.lt.getTime()).toBeGreaterThan(where.OR[1].createdAt.gte.getTime());
    expect(stockJournalWhere({ fromDay: null, toDay: null, itemId: null, type: "ENTREE" })).toEqual({ type: "ENTREE" });
  });

  it("names the file after the period and builds the addresses", () => {
    expect(stockJournalFileName({ fromDay: "2026-10-01", toDay: "2026-10-31", itemId: null, type: null }, "2026-11-01")).toBe(
      "journal-du-stock-2026-10-01-au-2026-10-31.xlsx"
    );
    expect(stockJournalFileName({ fromDay: null, toDay: null, itemId: null, type: null }, "2026-11-01")).toBe("journal-du-stock-au-2026-11-01.xlsx");
    expect(stockJournalHref({ du: "2026-10-01", article: "", type: "SORTIE" })).toBe("/api/stock/journal/export?du=2026-10-01&type=SORTIE");
    expect(stockJournalHref({}, "/magasin/stock/journal")).toBe("/magasin/stock/journal");
    expect(excelDayOf("2026-10-30")?.toISOString()).toBe("2026-10-30T00:00:00.000Z");
    expect(excelDayOf("")).toBeNull();
  });
});
