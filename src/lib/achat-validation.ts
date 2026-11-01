import type { PaymentMode } from "@/generated/prisma/enums";
import { isEmail, isIce } from "./client-validation";
import { parseIsoDay } from "./date-only";
import { isValidAmount } from "./money";
import { PURCHASE_PAYMENT_METHODS } from "./purchase-invoice";
import { movementDayError } from "./stock";
import { parseRate, type WithholdingBaseCode, type WithholdingScopeCode } from "./withholding";

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

/** Whether a field was filled: a number, or a non-empty text. */
function filled(value: unknown): boolean {
  return typeof value === "number" || text(value) !== "";
}

/** A checkbox or a JSON boolean: true, « true », « on », « 1 », « oui ». */
function flag(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["true", "on", "1", "oui"].includes(String(value ?? "").trim().toLowerCase());
}

/** An optional form day: null when empty, `false` when unreadable. */
function optionalDay(value: unknown): Date | null | false {
  const raw = text(value);
  if (!raw) return null;
  return parseFormDay(raw) ?? false;
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
  /** Lot 3D (M7) — « soumis à la retenue à la source ». */
  withholdingSubject: boolean;
  /** Lot 3D (M7) — the last attestation de régularité fiscale and its end. */
  taxCertificateDate: Date | null;
  taxCertificateValidUntil: Date | null;
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

  // M7 — the attestation: its date, and the day it stops being valid.
  const certificateDate = optionalDay(input.taxCertificateDate);
  if (certificateDate === false) return { ok: false, error: "La date de l'attestation fiscale est invalide." };
  const validUntil = optionalDay(input.taxCertificateValidUntil);
  if (validUntil === false) return { ok: false, error: "La fin de validité de l'attestation est invalide." };
  if (certificateDate && validUntil && validUntil.getTime() < certificateDate.getTime()) {
    return { ok: false, error: "La fin de validité de l'attestation ne peut pas précéder sa date." };
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
      withholdingSubject: flag(input.withholdingSubject),
      taxCertificateDate: certificateDate,
      taxCertificateValidUntil: validUntil,
    },
  };
}

// ————— Purchase invoice —————

export type CleanPurchaseInvoice = {
  number: string;
  label: string | null;
  /** TTC — HT + TVA when the HT is typed; the TTC typed alone otherwise. */
  amount: number;
  /** Lot 3D (M1) — null when only the TTC was typed. */
  amountHT: number | null;
  vatRate: number | null;
  vatAmount: number | null;
  issueDate: Date;
  dueDate: Date | null;
  /** Lot 3D (M6) — a foreign currency (ISO code), its amount and rate. */
  currency: string | null;
  amountForeign: number | null;
  exchangeRate: number | null;
  /** Lot 3D (M7) — the attestation given with the invoice. */
  taxCertificateProvided: boolean;
  taxCertificateDate: Date | null;
  /** Lot 3D (M7) — the retenue's rate typed; null = the settings' proposal. */
  withholdingRate: number | null;
};

/** The largest exchange rate accepted (DECIMAL(12,6)). */
export const MAX_EXCHANGE_RATE = 999_999;

const centsOf = (value: number) => Math.round(value * 100);

/**
 * A supplier invoice as typed (lot 3D, M1): the HT and the VAT rate (the
 * settings' default when empty) give the TVA and the TTC, to the centime; a
 * VAT amount typed by hand (the supplier's own rounding, several rates on
 * one invoice — R-23) replaces the computed one. Without an HT, the TTC
 * typed alone is kept (an API caller of before lot 3D).
 */
export function validatePurchaseInvoice(
  input: Record<string, unknown>,
  options: { defaultVatRate?: number } = {}
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

  let amount: number;
  let amountHT: number | null = null;
  let vatRate: number | null = null;
  let vatAmount: number | null = null;
  if (filled(input.amountHT)) {
    const ht = numberFrom(input.amountHT);
    if (!isValidAmount(ht) || ht <= 0) {
      return { ok: false, error: "Le montant HT doit être un nombre positif." };
    }
    const rate = parseRate(input.vatRate) ?? options.defaultVatRate ?? 20;
    if (Number.isNaN(rate)) {
      return { ok: false, error: "Le taux de TVA doit être un pourcentage entre 0 et 100." };
    }
    amountHT = Math.round(ht * 100) / 100;
    let vat = Math.round(centsOf(amountHT) * rate / 100) / 100;
    if (filled(input.vatAmount)) {
      const typed = numberFrom(input.vatAmount);
      if (!isValidAmount(typed)) {
        return { ok: false, error: "Le montant de la TVA doit être un nombre positif ou nul." };
      }
      vat = Math.round(typed * 100) / 100;
    }
    vatRate = rate;
    vatAmount = vat;
    amount = (centsOf(amountHT) + centsOf(vat)) / 100;
    if (!isValidAmount(amount)) {
      return { ok: false, error: "Le montant TTC dépasse la limite : vérifiez la saisie." };
    }
  } else {
    const ttc = numberFrom(input.amount);
    if (!isValidAmount(ttc) || ttc <= 0) {
      return { ok: false, error: "Le montant doit être un nombre positif." };
    }
    amount = Math.round(ttc * 100) / 100;
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

  // M6 — « Euro »: the DH amounts stay the base; the currency is a record.
  const currency = text(input.currency).toUpperCase();
  let amountForeign: number | null = null;
  let exchangeRate: number | null = null;
  const foreign = currency !== "" && currency !== "MAD" && currency !== "DH";
  if (foreign) {
    if (!/^[A-Z]{3}$/.test(currency)) {
      return { ok: false, error: "La devise doit être un code de trois lettres (EUR, USD…)." };
    }
    const value = numberFrom(input.amountForeign);
    if (!isValidAmount(value) || value <= 0) {
      return { ok: false, error: `Le montant en devise (${currency}) doit être un nombre positif.` };
    }
    amountForeign = Math.round(value * 100) / 100;
    if (filled(input.exchangeRate)) {
      const rate = numberFrom(input.exchangeRate);
      if (!Number.isFinite(rate) || rate <= 0 || rate > MAX_EXCHANGE_RATE) {
        return { ok: false, error: "Le taux de change doit être un nombre positif." };
      }
      exchangeRate = Math.round(rate * 1_000_000) / 1_000_000;
    }
  }

  // M7 — the attestation given with the invoice, and the retenue's rate.
  const provided = flag(input.taxCertificateProvided);
  const certificateDate = provided ? optionalDay(input.taxCertificateDate) : null;
  if (certificateDate === false) {
    return { ok: false, error: "La date de l'attestation fiscale est invalide." };
  }
  const withholdingRate = parseRate(input.withholdingRate);
  if (Number.isNaN(withholdingRate)) {
    return { ok: false, error: "Le taux de retenue doit être un pourcentage entre 0 et 100." };
  }

  return {
    ok: true,
    value: {
      number,
      label: text(input.label) || null,
      amount,
      amountHT,
      vatRate,
      vatAmount,
      issueDate,
      dueDate,
      currency: foreign ? currency : null,
      amountForeign,
      exchangeRate,
      taxCertificateProvided: provided,
      taxCertificateDate: certificateDate,
      withholdingRate,
    },
  };
}

// ————— Payment of a supplier invoice (lot 3D, M1) —————

export type CleanPurchasePayment = {
  paidOn: Date;
  /** Null = the whole remaining amount. */
  amount: number | null;
  method: PaymentMode;
  reference: string | null;
};

/**
 * A payment as typed: its day (today on the lab's clock when empty, never in
 * the future nor before the invoice), its method (required) and reference,
 * its amount (empty = all that is left). `today` and `issueDay`: « AAAA-MM-JJ ».
 */
export function validatePurchasePayment(
  input: Record<string, unknown>,
  context: { today: string; issueDay: string }
): { ok: true; value: CleanPurchasePayment } | { ok: false; error: string } {
  const typedDay = text(input.paidOn);
  const paidOn = typedDay ? parseFormDay(typedDay) : parseIsoDay(context.today);
  if (!paidOn) return { ok: false, error: "La date de paiement est invalide." };
  const day = paidOn.toISOString().slice(0, 10);
  if (day > context.today) return { ok: false, error: "La date de paiement ne peut pas être dans le futur." };
  if (day < context.issueDay) return { ok: false, error: "La date de paiement ne peut pas précéder la date de la facture." };

  const method = text(input.method) as PaymentMode;
  if (!PURCHASE_PAYMENT_METHODS.includes(method)) {
    return { ok: false, error: "Choisissez le mode de paiement." };
  }
  const reference = text(input.reference);
  if (reference.length > TEXT_MAX) {
    return { ok: false, error: `La référence du paiement est trop longue (${TEXT_MAX} caractères max).` };
  }

  let amount: number | null = null;
  if (filled(input.amount)) {
    const value = numberFrom(input.amount);
    if (!isValidAmount(value) || value <= 0) {
      return { ok: false, error: "Le montant payé doit être un nombre positif." };
    }
    amount = Math.round(value * 100) / 100;
  }

  return { ok: true, value: { paidOn, amount, method, reference: reference || null } };
}

// ————— Settings of the magasin (lot 3D, M4, M1, M7) —————

export type CleanAchatSettings = {
  expiryWarningDays: number;
  defaultVatRate: number;
  withholdingScope: WithholdingScopeCode;
  withholdingBase: WithholdingBaseCode;
  withholdingRateWithCertificate: number | null;
  withholdingRateWithoutCertificate: number | null;
  taxCertificateValidityMonths: number;
};

const SCOPES: WithholdingScopeCode[] = ["AUCUN", "FOURNISSEURS_SOUMIS", "TOUS"];
const BASES: WithholdingBaseCode[] = ["HT", "TVA", "TTC"];

/** The settings as typed by the administrator on /magasin/reglages. No rate has a default. */
export function validateAchatSettings(
  input: Record<string, unknown>
): { ok: true; value: CleanAchatSettings } | { ok: false; error: string } {
  const window = filled(input.expiryWarningDays) ? numberFrom(input.expiryWarningDays) : Number.NaN;
  if (!Number.isInteger(window) || window < 0 || window > 365) {
    return { ok: false, error: "La fenêtre de péremption doit être un nombre de jours entre 0 et 365." };
  }
  const vat = parseRate(input.defaultVatRate);
  if (vat === null || Number.isNaN(vat)) {
    return { ok: false, error: "Le taux de TVA par défaut doit être un pourcentage entre 0 et 100." };
  }
  const scope = text(input.withholdingScope) as WithholdingScopeCode;
  if (!SCOPES.includes(scope)) return { ok: false, error: "Champ d'application de la retenue invalide." };
  const base = text(input.withholdingBase) as WithholdingBaseCode;
  if (!BASES.includes(base)) return { ok: false, error: "Base de la retenue invalide." };
  const withCertificate = parseRate(input.withholdingRateWithCertificate);
  const withoutCertificate = parseRate(input.withholdingRateWithoutCertificate);
  if (Number.isNaN(withCertificate) || Number.isNaN(withoutCertificate)) {
    return { ok: false, error: "Les taux de retenue doivent être des pourcentages entre 0 et 100 (ou vides)." };
  }
  if (scope !== "AUCUN" && withCertificate === null && withoutCertificate === null) {
    return { ok: false, error: "Indiquez au moins un taux de retenue, ou choisissez « Aucune retenue »." };
  }
  // 100 % of the TTC leaves nothing to pay: such an invoice could never be settled.
  if (base === "TTC" && [withCertificate, withoutCertificate].some((rate) => rate !== null && rate >= 100)) {
    return { ok: false, error: "Sur le montant TTC, un taux de retenue de 100 % ne laisse rien à payer : indiquez un taux inférieur." };
  }
  const months = filled(input.taxCertificateValidityMonths) ? numberFrom(input.taxCertificateValidityMonths) : Number.NaN;
  if (!Number.isInteger(months) || months < 1 || months > 60) {
    return { ok: false, error: "La validité d'une attestation doit être un nombre de mois entre 1 et 60." };
  }
  return {
    ok: true,
    value: {
      expiryWarningDays: window,
      defaultVatRate: vat,
      withholdingScope: scope,
      withholdingBase: base,
      withholdingRateWithCertificate: withCertificate,
      withholdingRateWithoutCertificate: withoutCertificate,
      taxCertificateValidityMonths: months,
    },
  };
}

// ————— Stock item —————

export type CleanStockItem = {
  name: string;
  category: string | null;
  unit: string;
  minQuantity: number;
  /** Lot 3D (M1) — « Lieu de stockage ». */
  location: string | null;
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
    ["Le lieu de stockage", text(input.location)],
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
      location: text(input.location) || null,
    },
  };
}

// ————— Stock movement (lot 3D, M1, M5) —————

export type CleanMovement = {
  itemId: string;
  type: "ENTREE" | "SORTIE" | "AJUSTEMENT";
  quantity: number;
  lot: string | null;
  expiryDate: Date | null;
  note: string | null;
  /** M1 — the day of the movement (today when empty, never in the future). */
  movementDate: Date;
  /** M5 — an entry's unit price HT; null otherwise. */
  unitPriceHT: number | null;
};

const MOVEMENT_TYPES = ["ENTREE", "SORTIE", "AJUSTEMENT"] as const;

/**
 * A movement as typed; `today`: the lab's calendar day « AAAA-MM-JJ ». The
 * level arithmetic itself (`applyMovement`) runs in the guarded transaction.
 */
export function validateMovement(
  input: Record<string, unknown>,
  today: string
): { ok: true; value: CleanMovement } | { ok: false; error: string } {
  const itemId = typeof input.itemId === "string" ? input.itemId : "";
  if (!itemId) return { ok: false, error: "Article manquant." };
  const type = input.type as CleanMovement["type"];
  if (!MOVEMENT_TYPES.includes(type)) return { ok: false, error: "Type de mouvement invalide." };
  // Two decimals, like the DECIMAL(12,2) column — the stored movement and
  // the level delta must be the same figure.
  const quantity = Math.round(numberFrom(input.quantity) * 100) / 100;
  if (!filled(input.quantity) || !Number.isFinite(quantity)) {
    return { ok: false, error: "Quantité illisible." };
  }

  let expiryDate: Date | null = null;
  if (text(input.expiryDate)) {
    // A calendar day: « 2027-02-30 » is refused, not rolled over to March.
    expiryDate = parseFormDay(text(input.expiryDate));
    if (!expiryDate) return { ok: false, error: "Date de péremption invalide." };
  }
  const lot = text(input.lot);
  if (lot.length > TEXT_MAX) return { ok: false, error: `Le lot est trop long (${TEXT_MAX} caractères max).` };
  // A TEXT column holds 65 535 bytes: a longer note was a 500.
  const note = text(input.note);
  if (note.length > NOTES_MAX) return { ok: false, error: "La note est trop longue (5 000 caractères max)." };

  const typedDay = text(input.movementDate);
  const movementDate = typedDay ? parseFormDay(typedDay) : parseIsoDay(today);
  if (!movementDate) return { ok: false, error: "La date du mouvement est invalide." };
  const dayError = movementDayError(movementDate.toISOString().slice(0, 10), today);
  if (dayError) return { ok: false, error: dayError };

  let unitPriceHT: number | null = null;
  if (type === "ENTREE" && filled(input.unitPriceHT)) {
    const price = numberFrom(input.unitPriceHT);
    if (!isValidAmount(price)) {
      return { ok: false, error: "Le prix unitaire HT doit être un nombre positif." };
    }
    unitPriceHT = price > 0 ? Math.round(price * 100) / 100 : null;
  }

  return {
    ok: true,
    value: {
      itemId,
      type,
      quantity,
      lot: lot || null,
      expiryDate,
      note: note || null,
      movementDate,
      unitPriceHT,
    },
  };
}

