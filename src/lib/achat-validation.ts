import { isEmail, isIce } from "./client-validation";
import { isValidAmount } from "./money";

/**
 * Validating the Achat & Stock inputs — same discipline as clients and
 * parameters: pure functions shared by the API and the forms, tested
 * without a database.
 */

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberFrom(value: unknown): number {
  if (typeof value === "number") return value;
  return Number(String(value ?? "").replace(",", "."));
}

// ————— Supplier —————

export type CleanSupplier = {
  name: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  ice: string | null;
  paymentTermDays: number;
  notes: string | null;
};

export function validateSupplier(
  input: Record<string, unknown>
): { ok: true; value: CleanSupplier } | { ok: false; error: string } {
  const name = text(input.name);
  if (!name) return { ok: false, error: "Le nom du fournisseur est obligatoire." };
  if (name.length > 200) return { ok: false, error: "Le nom du fournisseur est trop long." };

  const email = text(input.email);
  if (email && !isEmail(email)) {
    return { ok: false, error: "L'adresse email n'est pas valide." };
  }

  const ice = text(input.ice).replace(/\s/g, "");
  if (ice && !isIce(ice)) {
    return { ok: false, error: "L'ICE doit comporter 15 chiffres." };
  }

  // The payment convention: empty means the 30-day default; 0 = comptant.
  const rawTerm = input.paymentTermDays;
  const term =
    rawTerm === undefined || rawTerm === null || rawTerm === ""
      ? 30
      : numberFrom(rawTerm);
  if (!Number.isInteger(term) || term < 0 || term > 365) {
    return {
      ok: false,
      error: "Le délai de paiement doit être un nombre de jours entre 0 et 365.",
    };
  }

  return {
    ok: true,
    value: {
      name,
      contact: text(input.contact) || null,
      email: email || null,
      phone: text(input.phone) || null,
      address: text(input.address) || null,
      ice: ice || null,
      paymentTermDays: term,
      notes: text(input.notes) || null,
    },
  };
}

// ————— Purchase invoice —————

export type CleanPurchaseInvoice = {
  number: string;
  label: string | null;
  amount: number;
  issueDate: Date;
  dueDate: Date | null;
};

export function validatePurchaseInvoice(
  input: Record<string, unknown>
): { ok: true; value: CleanPurchaseInvoice } | { ok: false; error: string } {
  const number = text(input.number);
  if (!number) {
    return { ok: false, error: "Le numéro de la facture fournisseur est obligatoire." };
  }

  const amount = numberFrom(input.amount);
  if (!isValidAmount(amount) || amount <= 0) {
    return { ok: false, error: "Le montant doit être un nombre positif." };
  }

  const issueDate = new Date(text(input.issueDate));
  if (Number.isNaN(issueDate.getTime())) {
    return { ok: false, error: "La date d'émission est invalide." };
  }

  let dueDate: Date | null = null;
  if (text(input.dueDate)) {
    dueDate = new Date(text(input.dueDate));
    if (Number.isNaN(dueDate.getTime())) {
      return { ok: false, error: "La date d'échéance est invalide." };
    }
    if (dueDate.getTime() < issueDate.getTime()) {
      return {
        ok: false,
        error: "L'échéance ne peut pas précéder la date d'émission.",
      };
    }
  }

  return {
    ok: true,
    value: {
      number,
      label: text(input.label) || null,
      amount: Math.round(amount * 100) / 100,
      issueDate,
      dueDate,
    },
  };
}

// ————— Stock item —————

export type CleanStockItem = {
  name: string;
  category: string | null;
  unit: string;
  minQuantity: number;
};

export function validateStockItem(
  input: Record<string, unknown>
): { ok: true; value: CleanStockItem } | { ok: false; error: string } {
  const name = text(input.name);
  if (!name) return { ok: false, error: "Le nom de l'article est obligatoire." };
  if (name.length > 200) return { ok: false, error: "Le nom de l'article est trop long." };

  const unit = text(input.unit);
  if (!unit) {
    return { ok: false, error: "L'unité de comptage est obligatoire (boîte, L, kg…)." };
  }

  const rawMin = input.minQuantity;
  const min =
    rawMin === undefined || rawMin === null || rawMin === ""
      ? 0
      : numberFrom(rawMin);
  if (!Number.isFinite(min) || min < 0) {
    return {
      ok: false,
      error: "Le seuil d'alerte doit être un nombre positif (ou vide pour aucun).",
    };
  }

  return {
    ok: true,
    value: {
      name,
      category: text(input.category) || null,
      unit,
      minQuantity: Math.round(min * 100) / 100,
    },
  };
}
