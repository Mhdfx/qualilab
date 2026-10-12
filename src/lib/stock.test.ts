import { describe, it, expect } from "vitest";
import {
  applyMovement,
  dueDateFor,
  dueState,
  isLowStock,
  MAX_STOCK_LEVEL,
} from "./stock";
import {
  MAX_QUANTITY,
  parseFormDay,
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
