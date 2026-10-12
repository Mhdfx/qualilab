import { isEmail, isIce } from "./client-validation";
import { parseIsoDay } from "./date-only";
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

/** Every short text column is VARCHAR(191): refuse politely rather than crash on insert. */
export const TEXT_MAX = 191;
/** The free notes (TEXT columns): bounded well below their 65 535 bytes. */
export const NOTES_MAX = 5000;

/** The first field longer than its column, as the French message of the 400 — or null. */
function tooLong(fields: [label: string, value: string, feminine?: boolean][]): string | null {
  const field = fields.find(([, value]) => value.length > TEXT_MAX);
  return field ? `${field[0]} est trop ${field[2] ? "longue" : "long"} (${TEXT_MAX} caractères max).` : null;
}

/**
 * The largest figure a DECIMAL(12,2) column holds — a stock level, a
 * threshold, a movement. Far beyond any laboratory shelf: the bound only
 * keeps a typing slip from reaching the database as a crash.
 */
export const MAX_QUANTITY = 9_999_999_999.99;

/**
 * A calendar day typed in a form (« AAAA-MM-JJ »), or an ISO date-time whose
 * day is taken. An impossible day (« 2026-02-30 ») is refused instead of
 * rolling over to March like `new Date()` does.
 */
export function parseFormDay(value: string): Date | null {
  return parseIsoDay(value.slice(0, 10));
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
  if (name.length > 191) return { ok: false, error: "Le nom du fournisseur est trop long (191 caractères max)." };

  const email = text(input.email);
  if (email && !isEmail(email)) {
    return { ok: false, error: "L'adresse email n'est pas valide." };
  }

  const ice = text(input.ice).replace(/\s/g, "");
  if (ice && !isIce(ice)) {
    return { ok: false, error: "L'ICE doit comporter 15 chiffres." };
  }

  const long = tooLong([
    ["Le contact", text(input.contact)],
    ["L'adresse email", email, true],
    ["Le téléphone", text(input.phone)],
    ["L'adresse", text(input.address), true],
  ]);
  if (long) return { ok: false, error: long };

  // A TEXT column (65 535 bytes): a longer note was a 500.
  if (text(input.notes).length > NOTES_MAX) {
    return { ok: false, error: `Les notes sont trop longues (${NOTES_MAX} caractères max).` };
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
  const long = tooLong([
    ["Le numéro de la facture fournisseur", number],
    ["Le libellé", text(input.label)],
  ]);
  if (long) return { ok: false, error: long };

  const amount = numberFrom(input.amount);
  if (!isValidAmount(amount) || amount <= 0) {
    return { ok: false, error: "Le montant doit être un nombre positif." };
  }

  const issueDate = parseFormDay(text(input.issueDate));
  if (!issueDate) {
    return { ok: false, error: "La date d'émission est invalide." };
  }

  let dueDate: Date | null = null;
  if (text(input.dueDate)) {
    dueDate = parseFormDay(text(input.dueDate));
    if (!dueDate) {
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
  if (name.length > 191) return { ok: false, error: "Le nom de l'article est trop long (191 caractères max)." };

  const unit = text(input.unit);
  if (!unit) {
    return { ok: false, error: "L'unité de comptage est obligatoire (boîte, L, kg…)." };
  }
  const long = tooLong([
    ["La catégorie", text(input.category), true],
    ["L'unité de comptage", unit, true],
  ]);
  if (long) return { ok: false, error: long };

  const rawMin = input.minQuantity;
  const min =
    rawMin === undefined || rawMin === null || rawMin === ""
      ? 0
      : numberFrom(rawMin);
  if (!Number.isFinite(min) || min < 0 || min > MAX_QUANTITY) {
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
