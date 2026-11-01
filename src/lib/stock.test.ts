import { describe, it, expect } from "vitest";
import {
  applyMovement,
  dueDateFor,
  dueState,
  entriesInStock,
  entryAmount,
  expiryState,
  isLowStock,
  itemExpiry,
  knownLocations,
  lastUnitPrice,
  MAX_STOCK_LEVEL,
  movementDayError,
  stockTotals,
  stockValue,
  type StockEntry,
} from "./stock";
import {
  MAX_QUANTITY,
  parseFormDay,
  validateMovement,
  validatePurchaseInvoice,
  validateStockItem,
  validateSupplier,
} from "./achat-validation";

/**
 * Phase 6 arithmetic. Stock levels decide reorder alerts and due dates
 * decide payment alerts — both must be exact and both must refuse the
 * entries that would silently corrupt them.
 */

describe("applyMovement", () => {
  it("adds entries and subtracts exits, rounded to 2 decimals", () => {
    expect(applyMovement(10, "ENTREE", 2.5)).toEqual({ ok: true, next: 12.5 });
    expect(applyMovement(10, "SORTIE", 0.1)).toEqual({ ok: true, next: 9.9 });
  });

  it("refuses an exit that would take the stock below zero", () => {
    const result = applyMovement(3, "SORTIE", 5);
    expect(result.ok).toBe(false);
  });

  it("allows draining the stock to exactly zero", () => {
    expect(applyMovement(5, "SORTIE", 5)).toEqual({ ok: true, next: 0 });
  });

  it("AJUSTEMENT sets the counted quantity, including down to zero", () => {
    expect(applyMovement(42, "AJUSTEMENT", 38.25)).toEqual({ ok: true, next: 38.25 });
    expect(applyMovement(42, "AJUSTEMENT", 0)).toEqual({ ok: true, next: 0 });
  });

  it("refuses negative and unreadable quantities, and zero-sized movements", () => {
    expect(applyMovement(10, "ENTREE", -1).ok).toBe(false);
    expect(applyMovement(10, "SORTIE", Number.NaN).ok).toBe(false);
    expect(applyMovement(10, "ENTREE", 0).ok).toBe(false);
  });

  it("never accumulates float dust across repeated movements", () => {
    let level = 0;
    for (let i = 0; i < 10; i += 1) {
      const step = applyMovement(level, "ENTREE", 0.1);
      if (step.ok) level = step.next;
    }
    expect(level).toBe(1);
  });
});

describe("isLowStock", () => {
  it("alerts at or below the threshold", () => {
    expect(isLowStock(3, 5)).toBe(true);
    expect(isLowStock(5, 5)).toBe(true);
    expect(isLowStock(6, 5)).toBe(false);
  });

  it("a threshold of zero disables the alert", () => {
    expect(isLowStock(0, 0)).toBe(false);
  });
});

describe("dueState", () => {
  const today = new Date("2026-08-27T10:00:00");

  it("flags overdue, due-soon and comfortable invoices", () => {
    expect(dueState(new Date("2026-08-26"), today)).toBe("RETARD");
    expect(dueState(new Date("2026-08-27"), today)).toBe("BIENTOT");
    expect(dueState(new Date("2026-09-03"), today)).toBe("BIENTOT");
    expect(dueState(new Date("2026-09-04"), today)).toBe("OK");
  });
});

describe("dueDateFor", () => {
  it("applies the supplier's payment convention", () => {
    expect(dueDateFor(new Date("2026-08-01"), 30)).toEqual(new Date("2026-08-31"));
    expect(dueDateFor(new Date("2026-08-01"), 0)).toEqual(new Date("2026-08-01"));
  });
});

describe("validateSupplier", () => {
  it("accepts a complete supplier and normalises the term", () => {
    const result = validateSupplier({
      name: "BioMérieux Maroc",
      email: "commande@biomerieux.ma",
      ice: "001 234 567 000 011",
      paymentTermDays: "60",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.paymentTermDays).toBe(60);
      expect(result.value.ice).toBe("001234567000011");
    }
  });

  it("defaults the payment term to 30 days when empty", () => {
    const result = validateSupplier({ name: "Fournisseur X", paymentTermDays: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.paymentTermDays).toBe(30);
  });

  it("refuses missing names, bad ICE and absurd terms", () => {
    expect(validateSupplier({ name: "" }).ok).toBe(false);
    expect(validateSupplier({ name: "X", ice: "12" }).ok).toBe(false);
    expect(validateSupplier({ name: "X", paymentTermDays: "500" }).ok).toBe(false);
    expect(validateSupplier({ name: "X", paymentTermDays: "-1" }).ok).toBe(false);
  });

  it("refuses notes beyond their TEXT column, and says it in agreed French", () => {
    expect(validateSupplier({ name: "X", notes: "n".repeat(5000) }).ok).toBe(true);
    expect(validateSupplier({ name: "X", notes: "n".repeat(5001) })).toEqual({
      ok: false,
      error: "Les notes sont trop longues (5000 caractères max).",
    });
    expect(validateSupplier({ name: "X", address: "a".repeat(192) })).toEqual({
      ok: false,
      error: "L'adresse est trop longue (191 caractères max).",
    });
    expect(validateSupplier({ name: "X", contact: "c".repeat(192) })).toEqual({
      ok: false,
      error: "Le contact est trop long (191 caractères max).",
    });
  });
});

describe("validatePurchaseInvoice", () => {
  const valid = { number: "F-2026-001", amount: "1250,50", issueDate: "2026-08-27" };

  it("accepts a decimal-comma amount and keeps centimes exact", () => {
    const result = validatePurchaseInvoice(valid);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.amount).toBe(1250.5);
  });

  it("refuses a due date before the issue date", () => {
    const result = validatePurchaseInvoice({ ...valid, dueDate: "2026-08-01" });
    expect(result.ok).toBe(false);
  });

  it("refuses zero, negative or unreadable amounts", () => {
    for (const amount of ["0", "-5", "abc"]) {
      expect(validatePurchaseInvoice({ ...valid, amount }).ok).toBe(false);
    }
  });
});

describe("validateStockItem", () => {
  it("requires a name and a unit; empty threshold means no alert", () => {
    const result = validateStockItem({ name: "Gélose PCA", unit: "boîte", minQuantity: "" });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.minQuantity).toBe(0);
    expect(validateStockItem({ name: "", unit: "boîte" }).ok).toBe(false);
    expect(validateStockItem({ name: "Gélose", unit: "" }).ok).toBe(false);
  });
});

/**
 * Inputs the database cannot hold (VARCHAR(191), DECIMAL(12,2)) or days that
 * do not exist were answered with a server error, or — for a day like
 * 30/02 — silently stored on another day. Each is a French refusal now.
 */
describe("Achat & Stock — what the columns cannot hold", () => {
  const long = "x".repeat(192);

  it("refuses a supplier field longer than its column", () => {
    expect(validateSupplier({ name: "X", contact: long }).ok).toBe(false);
    expect(validateSupplier({ name: "X", address: long }).ok).toBe(false);
    expect(validateSupplier({ name: "X", phone: long }).ok).toBe(false);
    expect(validateSupplier({ name: "X", contact: "x".repeat(191) }).ok).toBe(true);
  });

  it("refuses an invoice number or label longer than its column, and an amount beyond DECIMAL(12,2)", () => {
    const valid = { number: "F-1", amount: "10", issueDate: "2026-08-27" };
    expect(validatePurchaseInvoice({ ...valid, number: long }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...valid, label: long }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...valid, amount: 99_999_999_999 }).ok).toBe(false);
    expect(validatePurchaseInvoice({ ...valid, amount: "9999999999,99" }).ok).toBe(true);
  });

  it("refuses an invoice day that does not exist instead of rolling it over", () => {
    expect(validatePurchaseInvoice({ number: "F-1", amount: "10", issueDate: "2026-02-30" }).ok).toBe(false);
    expect(validatePurchaseInvoice({ number: "F-1", amount: "10", issueDate: "2026-02-28", dueDate: "2026-02-31" }).ok).toBe(false);
    const ok = validatePurchaseInvoice({ number: "F-1", amount: "10", issueDate: "2026-02-28" });
    expect(ok.ok && ok.value.issueDate.toISOString()).toBe("2026-02-28T00:00:00.000Z");
  });

  it("parseFormDay reads a form day or an ISO date-time, never an impossible day", () => {
    expect(parseFormDay("2027-03-31")?.toISOString()).toBe("2027-03-31T00:00:00.000Z");
    expect(parseFormDay("2027-03-31T10:00:00.000Z")?.toISOString()).toBe("2027-03-31T00:00:00.000Z");
    expect(parseFormDay("2027-02-30")).toBeNull();
    expect(parseFormDay("31/03/2027")).toBeNull();
  });

  it("refuses a stock category, unit or threshold beyond its column", () => {
    expect(validateStockItem({ name: "G", unit: "boîte", category: long }).ok).toBe(false);
    expect(validateStockItem({ name: "G", unit: long }).ok).toBe(false);
    expect(validateStockItem({ name: "G", unit: "L", minQuantity: 1e12 }).ok).toBe(false);
    expect(validateStockItem({ name: "G", unit: "L", minQuantity: MAX_QUANTITY }).ok).toBe(true);
  });

  it("refuses a movement, or a level after an entry, beyond DECIMAL(12,2)", () => {
    expect(applyMovement(0, "ENTREE", 1e12).ok).toBe(false);
    expect(applyMovement(MAX_STOCK_LEVEL, "ENTREE", 1).ok).toBe(false);
    expect(applyMovement(0, "AJUSTEMENT", 1e12).ok).toBe(false);
    expect(applyMovement(10, "SORTIE", 1e12).ok).toBe(false);
    expect(applyMovement(0, "ENTREE", MAX_STOCK_LEVEL)).toEqual({ ok: true, next: MAX_STOCK_LEVEL });
  });
});

// ————— Lot 3D (RETOUR-LABO-28-10.md M1, M4, M5) —————

describe("lot 3D — expiry (M4)", () => {
  it("says « Périmé » past the day, « Expire bientôt » within the window, the day included", () => {
    expect(expiryState("2026-10-31", "2026-11-01", 30)).toBe("PERIME");
    expect(expiryState("2026-11-01", "2026-11-01", 30)).toBe("BIENTOT");
    expect(expiryState("2026-12-01", "2026-11-01", 30)).toBe("BIENTOT");
    expect(expiryState("2026-12-02", "2026-11-01", 30)).toBeNull();
    expect(expiryState("2026-11-02", "2026-11-01", 0)).toBeNull();
  });

  const entry = (day: string, quantity: number, expiryDay: string | null, lot: string | null = null, unitPriceHT: number | null = null): StockEntry => ({
    day,
    quantity,
    lot,
    expiryDay,
    unitPriceHT,
  });

  it("presumes the oldest units left first (FIFO): the level is the newest entries", () => {
    const entries = [entry("2026-09-01", 10, "2026-10-15", "A"), entry("2026-10-01", 10, "2027-06-30", "B"), entry("2026-10-20", 5, "2026-11-20", "C")];
    expect(entriesInStock(entries, 12).map((kept) => [kept.lot, kept.remaining])).toEqual([
      ["C", 5],
      ["B", 7],
    ]);
    expect(entriesInStock(entries, 0)).toEqual([]);
    // Lot A (expired) is presumed consumed; C expires within 30 days.
    expect(itemExpiry(entries, 12, "2026-11-01", 30)).toEqual({ state: "BIENTOT", expiryDay: "2026-11-20", lot: "C" });
    // With 25 on the shelf, lot A is still there — and expired.
    expect(itemExpiry(entries, 25, "2026-11-01", 30)).toEqual({ state: "PERIME", expiryDay: "2026-10-15", lot: "A" });
    expect(itemExpiry(entries, 7, "2026-11-01", 10)).toBeNull();
    expect(itemExpiry([entry("2026-10-01", 5, null)], 5, "2026-11-01", 30)).toBeNull();
  });

  it("keeps the later of two entries of the same day first", () => {
    const entries = [entry("2026-10-01", 4, "2026-11-05", "early"), entry("2026-10-01", 4, "2027-01-01", "late")];
    expect(entriesInStock(entries, 4).map((kept) => kept.lot)).toEqual(["late"]);
  });

  it("prices the stock at the last unit price (M5)", () => {
    const entries = [entry("2026-09-01", 10, null, null, 12), entry("2026-10-01", 10, null, null, 13.5), entry("2026-10-20", 5, null, null, null)];
    expect(lastUnitPrice(entries)).toBe(13.5);
    expect(lastUnitPrice([entry("2026-10-01", 1, null)])).toBeNull();
    expect(stockValue(12, 13.5)).toBe(162);
    expect(stockValue(0.3, 0.1)).toBe(0.03);
    expect(stockValue(5, null)).toBeNull();
    expect(entryAmount(10, 12.5)).toBe(125);
    expect(entryAmount(10, null)).toBeNull();
    expect(stockTotals([{ value: 162, quantity: 12 }, { value: null, quantity: 3 }, { value: null, quantity: 0 }])).toEqual({ value: 162, unpriced: 1 });
  });

  it("suggests the places already used, once each, in French order", () => {
    expect(knownLocations([{ location: "Réfrigérateur 2" }, { location: null }, { location: "Armoire A" }, { location: "Réfrigérateur 2" }, { location: " " }])).toEqual([
      "Armoire A",
      "Réfrigérateur 2",
    ]);
  });
});

describe("lot 3D — validateMovement (M1, M5)", () => {
  const today = "2026-11-01";
  const base = { itemId: "i1", type: "ENTREE", quantity: "10" };

  it("dates a movement today by default, never in the future", () => {
    const result = validateMovement(base, today);
    expect(result.ok && result.value.movementDate.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    const back = validateMovement({ ...base, movementDate: "2026-10-28" }, today);
    expect(back.ok && back.value.movementDate.toISOString().slice(0, 10)).toBe("2026-10-28");
    expect(validateMovement({ ...base, movementDate: "2026-11-02" }, today)).toEqual({
      ok: false,
      error: "La date du mouvement ne peut pas être dans le futur.",
    });
    expect(validateMovement({ ...base, movementDate: "2026-02-30" }, today).ok).toBe(false);
    expect(movementDayError("2026-11-01", today)).toBeNull();
  });

  it("keeps a unit price HT on an entry only", () => {
    const priced = validateMovement({ ...base, unitPriceHT: "12,5" }, today);
    expect(priced.ok && priced.value.unitPriceHT).toBe(12.5);
    const exit = validateMovement({ ...base, type: "SORTIE", unitPriceHT: "12,5" }, today);
    expect(exit.ok && exit.value.unitPriceHT).toBeNull();
    expect(validateMovement({ ...base, unitPriceHT: "-1" }, today).ok).toBe(false);
    const zero = validateMovement({ ...base, unitPriceHT: "0" }, today);
    expect(zero.ok && zero.value.unitPriceHT).toBeNull();
  });

  it("refuses what the route refused before: no article, a bad type, an unreadable quantity, a long lot", () => {
    expect(validateMovement({ ...base, itemId: "" }, today)).toEqual({ ok: false, error: "Article manquant." });
    expect(validateMovement({ ...base, type: "VOL" }, today)).toEqual({ ok: false, error: "Type de mouvement invalide." });
    expect(validateMovement({ ...base, quantity: "" }, today)).toEqual({ ok: false, error: "Quantité illisible." });
    expect(validateMovement({ ...base, quantity: "abc" }, today)).toEqual({ ok: false, error: "Quantité illisible." });
    expect(validateMovement({ ...base, lot: "x".repeat(192) }, today).ok).toBe(false);
    expect(validateMovement({ ...base, expiryDate: "2027-02-30" }, today)).toEqual({ ok: false, error: "Date de péremption invalide." });
    expect(validateMovement({ ...base, note: "n".repeat(5001) }, today).ok).toBe(false);
    const rounded = validateMovement({ ...base, quantity: "2,345" }, today);
    expect(rounded.ok && rounded.value.quantity).toBe(2.35);
  });
});

describe("lot 3D — the article's place and the supplier's attestation (M1, M7)", () => {
  it("records the place of an article, bounded by its column", () => {
    const result = validateStockItem({ name: "Gélose", unit: "boîte", location: " Réfrigérateur 2 " });
    expect(result.ok && result.value.location).toBe("Réfrigérateur 2");
    expect(validateStockItem({ name: "Gélose", unit: "boîte", location: "x".repeat(192) }).ok).toBe(false);
    const none = validateStockItem({ name: "Gélose", unit: "boîte" });
    expect(none.ok && none.value.location).toBeNull();
  });

  it("records « soumis à la retenue » and the attestation's dates, the end never before the date", () => {
    const result = validateSupplier({
      name: "Fournisseur X",
      withholdingSubject: true,
      taxCertificateDate: "2026-10-01",
      taxCertificateValidUntil: "2026-12-31",
    });
    expect(result.ok && result.value.withholdingSubject).toBe(true);
    expect(result.ok && result.value.taxCertificateValidUntil?.toISOString().slice(0, 10)).toBe("2026-12-31");
    expect(validateSupplier({ name: "X", taxCertificateDate: "2026-10-01", taxCertificateValidUntil: "2026-09-30" }).ok).toBe(false);
    expect(validateSupplier({ name: "X", taxCertificateDate: "2026-02-30" }).ok).toBe(false);
    const plain = validateSupplier({ name: "X" });
    expect(plain.ok && [plain.value.withholdingSubject, plain.value.taxCertificateDate]).toEqual([false, null]);
  });
});
