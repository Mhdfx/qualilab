import { describe, it, expect } from "vitest";
import {
  applyMovement,
  dueDateFor,
  dueState,
  isLowStock,
} from "./stock";
import {
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
