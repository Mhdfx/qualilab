import { createHash } from "node:crypto";
import type { PaymentMode } from "@/generated/prisma/enums";
import { parseIsoDay } from "./date-only";
import { roundMoney } from "./invoice-math";
import { validatePurchaseInvoice, validateSupplier, MAX_EXCHANGE_RATE, TEXT_MAX, type CleanPurchaseInvoice } from "./achat-validation";
import { cellDay, cellNumber, headerKey, paymentTermDays, type SheetCell, type SheetRow } from "./stock-import";
import { certificateState, withholdingFor, type CertificateState, type WithholdingBaseCode, type WithholdingSettings } from "./withholding";
import {
  PURCHASE_IMPORT_EMPTY_STATUS_UNPAID,
  PURCHASE_IMPORT_UNNUMBERED,
  PURCHASE_IMPORT_WITHHOLDING,
} from "./lab-proposals";

/**
 * Lot 6B, M15 (RETOUR-LABO-25-11.md §2, §6) — the laboratory's « Journal
 * Achat » (one sheet, one row per supplier invoice) read into invoices.
 * Pure: the route reads the file into rows and the database into maps; this
 * decides, and `planPurchaseJournal` says what an import would write.
 *
 * Columns (the template of 28/10): Fournisseurs | Délai de paiement | N°
 * Facture | Mois | Date | Échéance | Montant HT | TVA 20 % | Montant TTC |
 * Euro | Statut | Date paiement | Mode de paiement. Each row is checked by
 * the **form's rules** (`validatePurchaseInvoice`), then:
 *
 * - empty rows, and the template rows prepared for a month (no supplier, no
 *   number, amounts at zero), are ignored;
 * - no number: « SN-AAAA-MM-JJ-k » (`PURCHASE_IMPORT_UNNUMBERED`, E-4) — a
 *   rank above 1 (several on the same day for one supplier) flagged « à
 *   vérifier »;
 * - the same supplier + number twice in the file: identical rows (same day,
 *   same amounts) are imported once; different rows are « à trancher » —
 *   none of them is imported;
 * - HT and TVA rounded to the centime, TTC = HT + TVA; a TTC more than one
 *   centime away from HT + TVA is refused (« ligne à corriger »); a row with
 *   the TTC only is imported « TTC seul »; a row in euros without its DH
 *   amount needs the « Taux EUR → DH » of the screen, else it is refused; a
 *   row with both keeps the rate of the file (DH HT, else TTC, ÷ euros) only
 *   when plausible (`EUR_RATE_PLAUSIBLE`), else the screen's, flagged;
 * - « Statut » — the whole cell — « Payée » / « Prélèvement » → paid
 *   (« payée partiellement » is no status: refused); empty → to pay
 *   (`PURCHASE_IMPORT_EMPTY_STATUS_UNPAID`, E-5); « À payer » with a payment
 *   day keeps the invoice to pay, the payment left out and flagged;
 * - « Date paiement »: one day, or « date montant + date montant » (several
 *   payments, their amounts adding up to the TTC); a payment dated before
 *   the invoice (or in the future, or unreadable) is never recorded — the
 *   invoice is imported paid without a payment row (« payée en totalité »,
 *   like the invoices of before lot 3D), flagged;
 * - « Mode de paiement » through `paymentModeOf` (a bank reference in the
 *   column = a transfer, the code kept as reference; anything else = « Autre »
 *   with the text as reference, flagged).
 *
 * Nothing already in the database is ever modified (`planPurchaseJournal`):
 * an invoice known by its supplier + number is skipped — « créer seulement »,
 * like every import of the magasin — so a second import writes nothing.
 * Each invoice imported keeps its `importKey` (relecture du lot 6, constat
 * 6): the file's supplier name + the number, or — no number — the row's
 * fingerprint (supplier, day, amounts); a re-import finds it whatever the
 * supplier is called now, and an unnumbered row numbered since is not
 * imported twice.
 */

// ————— Cells —————

const text = (value: SheetCell | undefined) => String(value ?? "").trim();
/** Rounded on the decimal written (`roundMoney`: 0,145 → 0,15, not 0,14). */
const round2 = roundMoney;
const cents = (value: number) => Math.round(roundMoney(value) * 100);

/** A rate EUR → DH outside this range is a slip (an amount in the wrong column, a TTC against an HT…). */
export const EUR_RATE_PLAUSIBLE = { min: 8, max: 14 } as const;

/** The fingerprint kept in `PurchaseInvoice.importKey` (64 hex). */
export function purchaseImportKey(parts: (string | number | null)[]): string {
  return createHash("sha256").update(JSON.stringify(["lot6b-v1", ...parts])).digest("hex");
}

/** « AAAA-MM-JJ » + n days. */
export function addDays(day: string, days: number): string {
  const date = parseIsoDay(day) as Date;
  return new Date(date.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * A day of the journal: `cellDay`, except Excel's day 0 (« 00/01/1900 », read
 * « 1899-12-30 ») and anything before March 1900 — a date cell left at zero
 * in the file, read as empty rather than as a day of 1899.
 */
export function journalDay(value: SheetCell | undefined): string | null {
  const day = cellDay(value ?? null);
  return day && day >= "1900-03-01" ? day : null;
}

const isZeroDay = (value: SheetCell | undefined) => {
  const day = cellDay(value ?? null);
  return day !== null && day < "1900-03-01";
};

const daysBetween = (from: string, to: string) =>
  Math.round(((parseIsoDay(to) as Date).getTime() - (parseIsoDay(from) as Date).getTime()) / 86_400_000);

/**
 * The comparison key of an invoice number, as the database compares them
 * (`utf8mb4_unicode_ci`: case and accents ignored, trailing spaces too).
 */
export function invoiceNumberKey(number: string): string {
  return number
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// ————— « Mode de paiement » —————

export type PaymentModeReading = {
  method: PaymentMode;
  reference: string | null;
  /** False when the text is no known mode: « Autre », the text as reference — flagged. */
  known: boolean;
};

/**
 * The « Mode de paiement » cell (hypothèses of §2.3, à confirmer par E-4):
 * « Virement » → transfer; a bank reference « TRF… » → transfer, the code as
 * reference; « Prélèvement » → transfer, reference « Prélèvement » (the
 * application has no direct-debit mode); « Caisse » / « Espèce(s) » → cash;
 * « Carte … » → card; « Chèque … » → cheque; « Effet » / « LCN » → effet;
 * anything else (other codes, free notes, two modes at once) → « Autre »,
 * the text kept as reference. Null for an empty cell.
 */
export function paymentModeOf(value: SheetCell | undefined): PaymentModeReading | null {
  const raw = text(value).replace(/\s+/g, " ");
  if (!raw) return null;
  const key = headerKey(raw);
  const reference = raw.slice(0, TEXT_MAX);
  if (/^(virement|vir|virement bancaire)$/.test(key)) return { method: "VIREMENT", reference: null, known: true };
  if (/^trf ?[a-z0-9]*$/.test(key)) return { method: "VIREMENT", reference, known: true };
  if (/^prelevements?$/.test(key)) return { method: "VIREMENT", reference: "Prélèvement", known: true };
  if (/^(caisse|especes?)$/.test(key)) return { method: "ESPECES", reference: null, known: true };
  if (/^carte( [a-z0-9]+)*$/.test(key) && !/espece|cheque|virement/.test(key)) {
    return { method: "CARTE", reference: key === "carte" ? null : reference, known: true };
  }
  if (/^cheques?( [a-z0-9]+)*$/.test(key) && !/espece|carte|virement/.test(key)) {
    return { method: "CHEQUE", reference: /^cheques?$/.test(key) ? null : reference, known: true };
  }
  if (/^(effets?|lcn|traite)( [a-z0-9]+)*$/.test(key)) return { method: "EFFET", reference: /^(effets?|lcn|traite)$/.test(key) ? null : reference, known: true };
  return { method: "AUTRE", reference, known: false };
}

// ————— « Date paiement » —————

export type PaymentCellReading =
  | { kind: "vide" }
  | { kind: "dates"; entries: { day: string; amount: number | null }[] }
  | { kind: "illisible"; text: string };

/**
 * The « Date paiement » cell: a day (an Excel date, « JJ/MM/AAAA »), or
 * several separated by « + » or « et », each optionally followed by its
 * amount (« 12/03/26 1500 + 30/03/26 900 »). A part without its year
 * (« 12/03 ») makes the cell unreadable — no year is guessed.
 */
export function parsePaymentCell(value: SheetCell | undefined): PaymentCellReading {
  if (value === null || value === undefined || text(value) === "" || isZeroDay(value)) return { kind: "vide" };
  const single = journalDay(value);
  if (single) return { kind: "dates", entries: [{ day: single, amount: null }] };
  const raw = text(value);
  const parts = raw.split(/\s*\+\s*|\s+et\s+/i).filter((part) => part.trim() !== "");
  const entries: { day: string; amount: number | null }[] = [];
  for (const part of parts) {
    const match = /^(\d{1,2}[/.-]\d{1,2}[/.-](?:\d{4}|\d{2}))(?:\s+(.*))?$/.exec(part.trim());
    const day = match ? journalDay(match[1]) : null;
    if (!match || !day) return { kind: "illisible", text: raw.slice(0, 120) };
    const rest = (match[2] ?? "").replace(/\s*(dh|mad)\s*$/i, "").trim();
    let amount: number | null = null;
    if (rest) {
      amount = cellNumber(rest);
      if (amount === null || amount <= 0) return { kind: "illisible", text: raw.slice(0, 120) };
    }
    entries.push({ day, amount });
  }
  return entries.length > 0 ? { kind: "dates", entries } : { kind: "illisible", text: raw.slice(0, 120) };
}

// ————— The journal —————

export type JournalPayment = { day: string; amount: number };

export type JournalDraft = {
  /** The file's row (1-based). */
  line: number;
  supplierName: string;
  supplierKey: string;
  /** « Délai de paiement » of the row (days), null when empty or unreadable. */
  termDays: number | null;
  /** The invoice as the form validates it (`number` may be generated). */
  invoice: CleanPurchaseInvoice;
  generatedNumber: boolean;
  /** « Échéance » of the file when usable; null = the issue day + the row's, else the supplier's, délai. */
  dueDay: string | null;
  status: "A_PAYER" | "PAYEE";
  /** Payment rows to record (their total = the TTC); empty = none recorded. */
  payments: JournalPayment[];
  paidAt: string | null;
  paymentMethod: PaymentMode | null;
  paymentReference: string | null;
  /** Converted from euros at the rate typed on the screen. */
  convertedFromEuro: boolean;
  /** `PurchaseInvoice.importKey`: the number's key, or — no number — `printKey`. */
  importKey: string;
  /** The row's fingerprint: supplier of the file, day, amounts (and its rank among identical ones). */
  printKey: string;
};

export type RefusalKind =
  | "fournisseur"
  | "date"
  | "montant"
  | "dh-manquant"
  | "ht-tva-ttc"
  | "sans-numero"
  | "statut"
  | "a-trancher"
  | "retenue"
  | "fournisseur-invalide"
  | "invalide";

export type WarningKind =
  | "sans-numero"
  | "doublon-identique"
  | "mois"
  | "echeance"
  | "paiement-avant-facture"
  | "paiement-futur"
  | "paiement-illisible"
  | "paiement-montants"
  | "statut-vide-paiement"
  | "mode-inconnu"
  | "mode-vide"
  | "taux-eur"
  | "taux-eur-improbable"
  | "sans-numero-rang"
  | "paiement-ignore"
  | "numero-ajoute"
  | "tva-sans-ht"
  | "fournisseur-archive";

export const REFUSAL_LABELS: Record<RefusalKind, string> = {
  fournisseur: "Fournisseur manquant",
  date: "Date de facture manquante ou illisible",
  montant: "Montant manquant ou illisible",
  "dh-manquant": "Montant en DH manquant (facture en euros)",
  "ht-tva-ttc": "HT + TVA ≠ TTC — ligne à corriger",
  "sans-numero": "Sans numéro de facture",
  statut: "Statut à préciser",
  "a-trancher": "Même numéro, lignes différentes — à trancher",
  retenue: "Retenue à la source impossible à calculer",
  "fournisseur-invalide": "Fournisseur invalide",
  invalide: "Ligne invalide",
};

export const WARNING_LABELS: Record<WarningKind, string> = {
  "sans-numero": "Sans numéro — numéro « SN-… » attribué",
  "doublon-identique": "Ligne répétée à l'identique — importée une fois",
  mois: "« Mois » différent du mois de la date",
  echeance: "Échéance différente de date + délai",
  "paiement-avant-facture": "Paiement daté avant la facture — payée, sans ligne de paiement",
  "paiement-futur": "Paiement daté dans le futur — payée, sans ligne de paiement",
  "paiement-illisible": "Date de paiement illisible — payée, sans ligne de paiement",
  "paiement-montants": "Paiement sans montants (ou montants ≠ TTC) — payée, sans ligne de paiement, à vérifier",
  "statut-vide-paiement": "Statut vide mais date de paiement — reprise payée",
  "mode-inconnu": "Mode de paiement non reconnu — « Autre », le texte en référence",
  "mode-vide": "Paiement sans mode — « Autre »",
  "taux-eur": "Montant en DH calculé au taux EUR → DH saisi",
  "taux-eur-improbable": "Taux EUR → DH du fichier improbable — à vérifier",
  "sans-numero-rang": "Sans numéro, plusieurs factures du fournisseur ce jour-là — à vérifier",
  "paiement-ignore": "Statut « à payer » mais date de paiement — reprise à payer, paiement non repris, à vérifier",
  "numero-ajoute": "Reprise sans numéro lors d'un import précédent, numérotée depuis dans le fichier — non réimportée : reportez le numéro à la main",
  "tva-sans-ht": "TVA sans montant HT — reprise au TTC seul",
  "fournisseur-archive": "Fournisseur archivé — facture rattachée quand même",
};

export type JournalNote<K extends string> = { line: number; kind: K; message: string };

export type ProposedSupplier = {
  key: string;
  name: string;
  /** The délai the supplier would be created with (§2.2). */
  paymentTermDays: number;
  rows: number;
};

export type PurchaseJournal = {
  /** Non-empty rows under the header. */
  rows: number;
  /** Template rows (no supplier, no number, amounts at zero) — ignored. */
  templateRows: number;
  drafts: JournalDraft[];
  refused: JournalNote<RefusalKind>[];
  warnings: JournalNote<WarningKind>[];
  /** Same supplier + number on different rows: none imported. */
  conflicts: { supplierName: string; number: string; lines: number[] }[];
  /** Every supplier named by the file (key → name and délai proposed). */
  suppliers: Map<string, ProposedSupplier>;
};

export type JournalOptions = {
  /** The lab's today « AAAA-MM-JJ »: no payment in the future. */
  today: string;
  /** « Taux EUR → DH » typed on the screen; null = the euro-only rows are refused. */
  eurRate: number | null;
  defaultVatRate: number;
  unnumbered?: "GENERATE" | "SKIP";
  emptyStatusUnpaid?: boolean;
};

const SUPPLIER_KEYS = ["fournisseurs", "fournisseur", "raison sociale"];
const NUMBER_KEYS = ["n facture", "no facture", "n de facture", "numero facture", "numero de facture", "num facture", "facture"];

function findColumns(header: SheetRow) {
  const keys = header.map((value) => headerKey(value));
  const exact = (candidates: string[]) => keys.findIndex((key) => candidates.includes(key));
  const starts = (prefixes: string[]) => keys.findIndex((key) => prefixes.some((prefix) => key === prefix || key.startsWith(`${prefix} `)));
  return {
    supplier: exact(SUPPLIER_KEYS),
    term: keys.findIndex((key) => key.startsWith("delai")),
    number: exact(NUMBER_KEYS),
    month: exact(["mois"]),
    date: exact(["date", "date facture", "date de facture", "date de la facture"]),
    due: keys.findIndex((key) => key.startsWith("echeance") || key === "date echeance" || key === "date d echeance"),
    ht: starts(["montant ht", "ht"]),
    vat: starts(["tva", "montant tva", "montant de la tva"]),
    ttc: starts(["montant ttc", "ttc"]),
    euro: starts(["euro", "euros", "montant euro", "montant en euro", "montant en euros", "eur"]),
    status: starts(["statut", "etat"]),
    paidOn: starts(["date paiement", "date de paiement", "date reglement", "date de reglement"]),
    mode: starts(["mode de paiement", "mode paiement", "mode de reglement", "mode"]),
  };
}

/** The header row (among the first ten): « Fournisseurs » and « N° Facture » on the same row. */
function findJournalHeader(rows: SheetRow[]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i += 1) {
    const keys = (rows[i] ?? []).map((value) => headerKey(value));
    if (keys.some((key) => SUPPLIER_KEYS.includes(key)) && keys.some((key) => NUMBER_KEYS.includes(key))) return i;
  }
  return -1;
}

/** Most frequent value (first seen wins a tie); null for none. */
function mostFrequent(values: number[]): number | null {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** A VAT rate from HT and TVA: two decimals, snapped to the whole percent when within 0,05. */
function vatRateOf(ht: number, vat: number): number {
  const rate = (vat / ht) * 100;
  const whole = Math.round(rate);
  return Math.abs(rate - whole) <= 0.05 ? whole : round2(rate);
}

type StatusReading = "PAYEE" | "A_PAYER" | "VIDE" | "INCONNU";

/**
 * The « Statut » cell, read whole: « payée partiellement » or « payé 50 % »
 * is no status the import can record (refused, « Statut à préciser »).
 */
function statusOf(value: SheetCell | undefined): StatusReading {
  const key = headerKey(value ?? null);
  if (!key) return "VIDE";
  if (/^(payee?s?|reglee?s?|soldee?s?|prelevee?s?|prelevements?)( en totalite| totalement)?$/.test(key)) return "PAYEE";
  if (/^(a payer|non payee?s?|impayee?s?|en attente|non reglee?s?)$/.test(key)) return "A_PAYER";
  return "INCONNU";
}

const isZeroOrEmpty = (value: SheetCell | undefined) => {
  if (value === null || value === undefined || text(value) === "") return true;
  const number = cellNumber(value);
  return number !== null && number === 0;
};

export function parsePurchaseJournal(rows: SheetRow[], options: JournalOptions): PurchaseJournal | { error: string } {
  const at = findJournalHeader(rows);
  if (at < 0) return { error: "En-tête introuvable : la feuille doit porter les colonnes « Fournisseurs » et « N° Facture » (modèle « Journal Achat »)." };
  const col = findColumns(rows[at]);
  if (col.date < 0) return { error: "Colonne « Date » introuvable (modèle « Journal Achat »)." };
  if (col.ttc < 0 && col.ht < 0) return { error: "Colonnes « Montant HT » / « Montant TTC » introuvables (modèle « Journal Achat »)." };

  const unnumbered = options.unnumbered ?? PURCHASE_IMPORT_UNNUMBERED;
  const emptyStatusUnpaid = options.emptyStatusUnpaid ?? PURCHASE_IMPORT_EMPTY_STATUS_UNPAID;
  const at_ = (row: SheetRow, index: number): SheetCell => (index < 0 ? null : row[index] ?? null);

  const drafts: JournalDraft[] = [];
  const refused: JournalNote<RefusalKind>[] = [];
  const warnings: JournalNote<WarningKind>[] = [];
  const refuse = (line: number, kind: RefusalKind, detail?: string) =>
    refused.push({ line, kind, message: detail ? `${REFUSAL_LABELS[kind]} : ${detail}` : REFUSAL_LABELS[kind] });
  const warn = (line: number, kind: WarningKind, detail?: string) =>
    warnings.push({ line, kind, message: detail ? `${WARNING_LABELS[kind]} (${detail})` : WARNING_LABELS[kind] });

  // Per supplier: the délais and gaps of its rows (the délai it is created with), its spelling.
  const supplierFacts = new Map<string, { name: string; terms: number[]; gaps: number[]; rows: number }>();
  // Per supplier + written number: the lines, to find the file's own duplicates.
  const numbered = new Map<string, { supplierName: string; number: string; lines: number[] }>();
  // Per supplier + day: the rank of the next unnumbered row.
  const unnumberedRank = new Map<string, number>();
  const fingerprints = new Map<number, string>();
  // Per supplier + fingerprint: how many rows so far (two identical unnumbered invoices keep two keys).
  const printRank = new Map<string, number>();

  let count = 0;
  let templateRows = 0;
  for (let i = at + 1; i < rows.length; i += 1) {
    const row = rows[i] ?? [];
    if (row.every((value) => text(value) === "")) continue;
    count += 1;
    const line = i + 1;
    const supplierName = text(at_(row, col.supplier)).replace(/\s+/g, " ");
    const writtenNumber = text(at_(row, col.number));
    if (!supplierName && !writtenNumber) {
      const amounts = [col.ht, col.vat, col.ttc, col.euro].map((index) => at_(row, index));
      if (amounts.every(isZeroOrEmpty)) {
        templateRows += 1;
        continue;
      }
    }
    if (!supplierName) {
      refuse(line, "fournisseur");
      continue;
    }
    const supplierKey = headerKey(supplierName);
    const facts = supplierFacts.get(supplierKey) ?? { name: supplierName, terms: [], gaps: [], rows: 0 };
    facts.rows += 1;
    supplierFacts.set(supplierKey, facts);

    const termCell = at_(row, col.term);
    const termDays = text(termCell) === "" ? null : paymentTermDays(termCell);
    if (termDays !== null && termDays >= 0 && termDays <= 365) facts.terms.push(termDays);

    if (writtenNumber) {
      const key = `${supplierKey}|${invoiceNumberKey(writtenNumber)}`;
      const group = numbered.get(key) ?? { supplierName, number: writtenNumber, lines: [] };
      group.lines.push(line);
      numbered.set(key, group);
    }

    // The day.
    const issueDay = journalDay(at_(row, col.date));
    if (!issueDay) {
      refuse(line, "date", isZeroDay(at_(row, col.date)) ? "vide" : text(at_(row, col.date)) || "vide");
      continue;
    }
    const writtenDue = col.due >= 0 ? journalDay(at_(row, col.due)) : null;
    if (writtenDue && writtenDue >= issueDay) facts.gaps.push(daysBetween(issueDay, writtenDue));

    // « Mois »: recomputed from the date; a disagreement is only flagged.
    const month = cellNumber(at_(row, col.month));
    if (month !== null && Number.isInteger(month) && month >= 1 && month <= 12 && month !== Number(issueDay.slice(5, 7))) {
      warn(line, "mois", `${month} pour une facture du ${issueDay.split("-").reverse().join("/")}`);
    }

    // The number (or one generated, E-4).
    let number = writtenNumber;
    let generatedNumber = false;
    if (!number) {
      if (unnumbered === "SKIP") {
        refuse(line, "sans-numero");
        continue;
      }
      const rankKey = `${supplierKey}|${issueDay}`;
      const rank = (unnumberedRank.get(rankKey) ?? 0) + 1;
      unnumberedRank.set(rankKey, rank);
      number = `SN-${issueDay}-${rank}`;
      generatedNumber = true;
      warn(line, "sans-numero", number);
      if (rank > 1) warn(line, "sans-numero-rang", `${rank}e de la journée`);
    }

    // The amounts.
    const raw = {
      ht: cellNumber(at_(row, col.ht)),
      vat: cellNumber(at_(row, col.vat)),
      ttc: cellNumber(at_(row, col.ttc)),
      euro: cellNumber(at_(row, col.euro)),
    };
    const unreadable = (["ht", "vat", "ttc", "euro"] as const).filter((name) => {
      const index = { ht: col.ht, vat: col.vat, ttc: col.ttc, euro: col.euro }[name];
      return index >= 0 && text(at_(row, index)) !== "" && raw[name] === null;
    });
    if (unreadable.length > 0 || [raw.ht, raw.vat, raw.ttc, raw.euro].some((value) => value !== null && value < 0)) {
      refuse(line, "montant", unreadable.length > 0 ? "montant illisible" : "montant négatif (un avoir se saisit à la main)");
      continue;
    }
    const ht = raw.ht && raw.ht > 0 ? round2(raw.ht) : null;
    const vat = raw.vat !== null ? round2(raw.vat) : null;
    const ttc = raw.ttc && raw.ttc > 0 ? round2(raw.ttc) : null;
    const euro = raw.euro && raw.euro > 0 ? round2(raw.euro) : null;

    const input: Record<string, unknown> = { number, issueDate: issueDay };
    let convertedFromEuro = false;
    let dhTotal: number;
    if (ht !== null) {
      const vatAmount = vat ?? (ttc !== null ? round2(ttc - ht) : null);
      if (vatAmount !== null && vatAmount < 0) {
        refuse(line, "ht-tva-ttc", `HT ${ht} > TTC ${ttc}`);
        continue;
      }
      if (ttc !== null && vatAmount !== null && Math.abs(cents(ht) + cents(vatAmount) - cents(ttc)) > 1) {
        refuse(line, "ht-tva-ttc", `HT ${ht} + TVA ${vatAmount} ≠ TTC ${ttc}`);
        continue;
      }
      input.amountHT = ht;
      if (vatAmount !== null) {
        input.vatAmount = vatAmount;
        input.vatRate = vatRateOf(ht, vatAmount);
        dhTotal = round2(ht + vatAmount);
      } else {
        dhTotal = round2(ht * (1 + options.defaultVatRate / 100));
      }
    } else if (ttc !== null) {
      if (vat !== null && vat > 0) warn(line, "tva-sans-ht");
      input.amount = ttc;
      dhTotal = ttc;
    } else if (euro !== null) {
      if (options.eurRate === null) {
        refuse(line, "dh-manquant", `${euro} EUR`);
        continue;
      }
      dhTotal = round2(euro * options.eurRate);
      input.amount = dhTotal;
      convertedFromEuro = true;
      warn(line, "taux-eur", `${euro} EUR × ${options.eurRate}`);
    } else {
      refuse(line, "montant");
      continue;
    }
    if (euro !== null) {
      input.currency = "EUR";
      input.amountForeign = euro;
      let rate = options.eurRate;
      if (!convertedFromEuro) {
        // The file's rate: the DH amount before VAT when there is one (euros carry no Moroccan VAT).
        const fromFile = Math.round(((ht ?? dhTotal) / euro) * 1_000_000) / 1_000_000;
        if (fromFile >= EUR_RATE_PLAUSIBLE.min && fromFile <= EUR_RATE_PLAUSIBLE.max) rate = fromFile;
        else {
          warn(
            line,
            "taux-eur-improbable",
            `${String(fromFile).replace(".", ",")} DH pour 1 EUR — ${options.eurRate !== null ? `taux saisi ${String(options.eurRate).replace(".", ",")} enregistré` : "aucun taux enregistré"}`
          );
        }
      }
      if (rate !== null && rate > 0 && rate <= MAX_EXCHANGE_RATE) input.exchangeRate = rate;
    }

    // The due day: the file's when usable (never before the invoice — the form's rule).
    let dueDay: string | null = null;
    if (writtenDue && writtenDue >= issueDay) dueDay = writtenDue;
    if (writtenDue && termDays !== null && writtenDue >= issueDay && daysBetween(issueDay, writtenDue) !== termDays) {
      warn(line, "echeance", `échéance à ${daysBetween(issueDay, writtenDue)} jours, délai ${termDays} jours`);
    }
    if (writtenDue && writtenDue < issueDay) warn(line, "echeance", "échéance avant la date — date + délai retenu");
    if (!dueDay && termDays !== null) dueDay = addDays(issueDay, termDays);

    const validated = validatePurchaseInvoice(input, { defaultVatRate: options.defaultVatRate });
    if (!validated.ok) {
      refuse(line, "invalide", validated.error);
      continue;
    }

    // The status and the payments.
    const payment = parsePaymentCell(at_(row, col.paidOn));
    let status = statusOf(at_(row, col.status));
    if (status === "INCONNU") {
      refuse(line, "statut", `« ${text(at_(row, col.status)).slice(0, 60)} »`);
      continue;
    }
    if (status === "VIDE") {
      if (payment.kind !== "vide") {
        status = "PAYEE";
        warn(line, "statut-vide-paiement");
      } else if (emptyStatusUnpaid) {
        status = "A_PAYER";
      } else {
        refuse(line, "statut", "vide");
        continue;
      }
    }

    if (status === "A_PAYER" && payment.kind !== "vide") warn(line, "paiement-ignore");

    const printParts = [supplierKey, issueDay, cents(validated.value.amount), validated.value.amountHT === null ? null : cents(validated.value.amountHT), euro === null ? null : cents(euro)];
    const printSignature = JSON.stringify(printParts);
    const printOccurrence = (printRank.get(printSignature) ?? 0) + 1;
    printRank.set(printSignature, printOccurrence);
    const printKey = purchaseImportKey(["empreinte", ...printParts, printOccurrence]);

    const draft: JournalDraft = {
      line,
      supplierName,
      supplierKey,
      termDays,
      invoice: validated.value,
      generatedNumber,
      dueDay,
      status: status === "PAYEE" ? "PAYEE" : "A_PAYER",
      payments: [],
      paidAt: null,
      paymentMethod: null,
      paymentReference: null,
      convertedFromEuro,
      importKey: generatedNumber ? printKey : purchaseImportKey(["numero", supplierKey, invoiceNumberKey(number)]),
      printKey,
    };

    if (draft.status === "PAYEE") {
      const total = validated.value.amount;
      if (payment.kind === "illisible") warn(line, "paiement-illisible", `« ${payment.text} »`);
      if (payment.kind === "dates") {
        const days = payment.entries.map((entry) => entry.day);
        const last = [...days].sort().at(-1) as string;
        const amounts = payment.entries.map((entry) => entry.amount);
        if (days.some((day) => day < issueDay)) {
          draft.paidAt = last;
          warn(line, "paiement-avant-facture", days.map((day) => day.split("-").reverse().join("/")).join(" + "));
        } else if (days.some((day) => day > options.today)) {
          warn(line, "paiement-futur", days.map((day) => day.split("-").reverse().join("/")).join(" + "));
        } else if (payment.entries.length === 1 && (amounts[0] === null || cents(amounts[0]) === cents(total))) {
          draft.payments = [{ day: days[0], amount: total }];
          draft.paidAt = days[0];
        } else if (amounts.every((amount) => amount !== null) && amounts.reduce((sum, amount) => sum + cents(amount as number), 0) === cents(total)) {
          draft.payments = payment.entries.map((entry) => ({ day: entry.day, amount: entry.amount as number }));
          draft.paidAt = last;
        } else {
          draft.paidAt = last;
          warn(line, "paiement-montants");
        }
      }
      const mode = paymentModeOf(at_(row, col.mode)) ?? (headerKey(at_(row, col.status)).startsWith("prelev") ? paymentModeOf("Prélèvement") : null);
      if (mode) {
        draft.paymentMethod = mode.method;
        draft.paymentReference = mode.reference;
        if (!mode.known) warn(line, "mode-inconnu", `« ${text(at_(row, col.mode)).slice(0, 60)} »`);
      } else if (draft.payments.length > 0) {
        draft.paymentMethod = "AUTRE";
        warn(line, "mode-vide");
      }
    }

    fingerprints.set(line, [issueDay, validated.value.amount, validated.value.amountHT, validated.value.vatAmount, validated.value.amountForeign].join("|"));
    drafts.push(draft);
  }

  // The file's own duplicates (same supplier + number): identical → once; different → à trancher.
  const conflicts: PurchaseJournal["conflicts"] = [];
  const dropped = new Set<number>();
  for (const group of numbered.values()) {
    if (group.lines.length < 2) continue;
    const prints = group.lines.map((line) => fingerprints.get(line));
    const identical = prints.every((print) => print !== undefined && print === prints[0]);
    if (identical) {
      for (const line of group.lines.slice(1)) {
        dropped.add(line);
        warn(line, "doublon-identique", `ligne ${group.lines[0]}`);
      }
    } else {
      for (const line of group.lines) dropped.add(line);
      conflicts.push({ supplierName: group.supplierName, number: group.number, lines: group.lines });
      for (const line of group.lines) {
        if (fingerprints.has(line)) refuse(line, "a-trancher", `${group.supplierName} n° ${group.number}, lignes ${group.lines.join(", ")}`);
      }
    }
  }

  const suppliers = new Map<string, ProposedSupplier>();
  for (const [key, facts] of supplierFacts) {
    suppliers.set(key, {
      key,
      name: facts.name.slice(0, TEXT_MAX),
      paymentTermDays: mostFrequent(facts.terms) ?? mostFrequent(facts.gaps.filter((gap) => gap <= 365)) ?? 30,
      rows: facts.rows,
    });
  }

  refused.sort((a, b) => a.line - b.line);
  // A row not imported keeps only the note saying why (its other warnings are about nothing).
  const refusedLines = new Set(refused.map((note) => note.line));
  const kept = warnings.filter((note) => note.kind === "doublon-identique" || (!dropped.has(note.line) && !refusedLines.has(note.line)));
  kept.sort((a, b) => a.line - b.line);
  return {
    rows: count,
    templateRows,
    drafts: drafts.filter((draft) => !dropped.has(draft.line)),
    refused,
    warnings: kept,
    conflicts,
    suppliers,
  };
}

// ————— Against the database —————

export type ExistingSupplier = {
  id: string;
  name: string;
  archived: boolean;
  paymentTermDays: number;
  withholdingSubject: boolean;
  taxCertificateDate: Date | null;
  taxCertificateValidUntil: Date | null;
};

export type ExistingInvoice = { issueDay: string; amount: number; status: "A_PAYER" | "PAYEE" | "ANNULEE" };

/** An invoice written by an import, found by its `importKey`. */
export type ImportedInvoice = { supplierId: string; supplierName: string; number: string; issueDay: string; amount: number };

export type InvoicePlan = {
  draft: JournalDraft;
  /** Null = the supplier is created by the import. */
  supplierId: string | null;
  dueDay: string;
  withholding: { rate: number | null; amount: number | null; base: WithholdingBaseCode; certificate: CertificateState };
};

export type PurchaseJournalPlan = {
  suppliersToCreate: ProposedSupplier[];
  /** Suppliers of the file already in the database (whether or not they get a new invoice). */
  suppliersMatched: number;
  invoices: InvoicePlan[];
  /** Already in the database (supplier + number): skipped, never modified. */
  existing: { line: number; supplierName: string; number: string; same: boolean }[];
  refused: JournalNote<RefusalKind>[];
  warnings: JournalNote<WarningKind>[];
  totals: {
    invoices: number;
    paid: number;
    toPay: number;
    /** To pay, due before today: « En retard » once imported. */
    late: number;
    payments: number;
    ht: number;
    vat: number;
    ttc: number;
    withheld: number;
    generatedNumbers: number;
  };
};

export type PlanContext = {
  today: string;
  /** By `headerKey(name)`. */
  suppliers: Map<string, ExistingSupplier>;
  /** By `${supplierId}|${invoiceNumberKey(number)}`. */
  invoices: Map<string, ExistingInvoice>;
  /** By `importKey` — the invoices of the file already imported (`importKey`, `printKey` of the drafts). */
  imported?: Map<string, ImportedInvoice>;
  /** Every supplier by its id: the one a previous import attached a file's supplier to, renamed since. */
  suppliersById?: Map<string, ExistingSupplier>;
  settings: WithholdingSettings;
  withholding?: "UNPAID_ONLY" | "NEVER";
};

/**
 * What an import would write: the suppliers to create (the others matched by
 * their name, or by the invoices a previous import attached to them — a
 * supplier renamed since is still found; an archived one is still matched,
 * flagged), the invoices to create with their due day and retenue (§2.5),
 * the ones already there (by `importKey`, else supplier + number: skipped),
 * and the refusals the retenue adds. A generated « SN-… » number already
 * taken by the supplier moves to the next free rank. Pure.
 */
export function planPurchaseJournal(journal: PurchaseJournal, context: PlanContext): PurchaseJournalPlan {
  const mode = context.withholding ?? PURCHASE_IMPORT_WITHHOLDING;
  const refused = [...journal.refused];
  const warnings = [...journal.warnings];
  const existing: PurchaseJournalPlan["existing"] = [];
  const invoices: InvoicePlan[] = [];
  const toCreate = new Map<string, ProposedSupplier>();
  const matched = new Set<string>();
  const archivedWarned = new Set<string>();
  const imported = context.imported ?? new Map<string, ImportedInvoice>();
  const priorOf = (draft: JournalDraft) => {
    const byKey = imported.get(draft.importKey);
    if (byKey) return { prior: byKey, numbered: false };
    const byPrint = draft.generatedNumber ? undefined : imported.get(draft.printKey);
    return byPrint ? { prior: byPrint, numbered: true } : null;
  };
  // The file's suppliers a previous import attached to a supplier of the database (renamed or not).
  const attached = new Map<string, string>();
  for (const draft of journal.drafts) {
    const found = priorOf(draft);
    if (found && !attached.has(draft.supplierKey)) attached.set(draft.supplierKey, found.prior.supplierId);
  }
  const used = new Set<string>();

  for (const draft of journal.drafts) {
    const found = priorOf(draft);
    if (found) {
      const { prior } = found;
      existing.push({
        line: draft.line,
        supplierName: prior.supplierName,
        number: prior.number,
        same: prior.issueDay === draft.invoice.issueDate.toISOString().slice(0, 10) && cents(prior.amount) === cents(draft.invoice.amount),
      });
      if (found.numbered) {
        warnings.push({ line: draft.line, kind: "numero-ajoute", message: `${WARNING_LABELS["numero-ajoute"]} (${prior.number} → ${draft.invoice.number})` });
      }
      continue;
    }
    const attachedId = attached.get(draft.supplierKey);
    const known = context.suppliers.get(draft.supplierKey) ?? (attachedId ? (context.suppliersById?.get(attachedId) ?? null) : null);
    const proposed = journal.suppliers.get(draft.supplierKey) as ProposedSupplier;
    if (known) matched.add(known.id);
    if (!known) {
      const check = validateSupplier({ name: proposed.name, paymentTermDays: proposed.paymentTermDays });
      if (!check.ok) {
        refused.push({ line: draft.line, kind: "fournisseur-invalide", message: `${REFUSAL_LABELS["fournisseur-invalide"]} : ${check.error}` });
        continue;
      }
    }
    if (known) {
      // A generated « SN-… » is no number of the supplier's: its invoice is found by its fingerprint
      // above — or, imported before the fingerprints were kept, by the same number, day and TTC.
      const holder = context.invoices.get(`${known.id}|${invoiceNumberKey(draft.invoice.number)}`);
      const sameRow = (invoice: ExistingInvoice) =>
        invoice.issueDay === draft.invoice.issueDate.toISOString().slice(0, 10) && cents(invoice.amount) === cents(draft.invoice.amount);
      const already = holder && (!draft.generatedNumber || sameRow(holder)) ? holder : undefined;
      if (already) {
        existing.push({
          line: draft.line,
          supplierName: known.name,
          number: draft.invoice.number,
          same: already.issueDay === draft.invoice.issueDate.toISOString().slice(0, 10) && cents(already.amount) === cents(draft.invoice.amount),
        });
        continue;
      }
      if (known.archived && !archivedWarned.has(known.id)) {
        archivedWarned.add(known.id);
        warnings.push({ line: draft.line, kind: "fournisseur-archive", message: `${WARNING_LABELS["fournisseur-archive"]} (${known.name})` });
      }
    }

    // A generated number the supplier already holds (another unnumbered invoice of that day): the next free rank.
    let planned = draft;
    if (draft.generatedNumber) {
      const owner = known?.id ?? `nouveau:${draft.supplierKey}`;
      const taken = (number: string) => used.has(`${owner}|${invoiceNumberKey(number)}`) || (known !== null && context.invoices.has(`${known.id}|${invoiceNumberKey(number)}`));
      const stem = draft.invoice.number.replace(/-\d+$/, "");
      let rank = Number(/-(\d+)$/.exec(draft.invoice.number)?.[1] ?? "1");
      let number = draft.invoice.number;
      while (taken(number)) number = `${stem}-${(rank += 1)}`;
      if (number !== draft.invoice.number) planned = { ...draft, invoice: { ...draft.invoice, number } };
      used.add(`${owner}|${invoiceNumberKey(number)}`);
    }

    const issueDay = draft.invoice.issueDate.toISOString().slice(0, 10);
    const term = known ? known.paymentTermDays : proposed.paymentTermDays;
    const dueDay = draft.dueDay ?? addDays(issueDay, term);

    const supplierFacts = known ?? { withholdingSubject: false, taxCertificateDate: null, taxCertificateValidUntil: null };
    let withholding: InvoicePlan["withholding"];
    if (mode === "NEVER" || draft.status === "PAYEE") {
      // Paid: what was paid was the TTC — nothing withheld; the attestation's state is recorded, as the form does.
      withholding = {
        rate: null,
        amount: null,
        base: context.settings.base,
        certificate: certificateState({
          issueDate: draft.invoice.issueDate,
          invoiceProvided: draft.invoice.taxCertificateProvided,
          invoiceCertificateDate: draft.invoice.taxCertificateDate,
          supplierCertificateDate: supplierFacts.taxCertificateDate,
          supplierCertificateValidUntil: supplierFacts.taxCertificateValidUntil,
          validityMonths: context.settings.certificateValidityMonths,
        }),
      };
    } else {
      const computed = withholdingFor(draft.invoice, supplierFacts, context.settings);
      if (computed.refusal) {
        refused.push({ line: draft.line, kind: "retenue", message: `${REFUSAL_LABELS.retenue} : ${computed.refusal}` });
        continue;
      }
      withholding = { rate: computed.rate, amount: computed.amount, base: computed.base, certificate: computed.certificate };
    }

    if (!known && !toCreate.has(draft.supplierKey)) toCreate.set(draft.supplierKey, proposed);
    invoices.push({ draft: planned, supplierId: known?.id ?? null, dueDay, withholding });
  }

  const sum = (pick: (plan: InvoicePlan) => number | null) => invoices.reduce((total, plan) => total + cents(pick(plan) ?? 0), 0) / 100;
  refused.sort((a, b) => a.line - b.line);
  warnings.sort((a, b) => a.line - b.line);
  return {
    suppliersToCreate: [...toCreate.values()],
    suppliersMatched: matched.size,
    invoices,
    existing,
    refused,
    warnings,
    totals: {
      invoices: invoices.length,
      paid: invoices.filter((plan) => plan.draft.status === "PAYEE").length,
      toPay: invoices.filter((plan) => plan.draft.status === "A_PAYER").length,
      late: invoices.filter((plan) => plan.draft.status === "A_PAYER" && plan.dueDay < context.today).length,
      payments: invoices.reduce((total, plan) => total + plan.draft.payments.length, 0),
      ht: sum((plan) => plan.draft.invoice.amountHT),
      vat: sum((plan) => plan.draft.invoice.vatAmount),
      ttc: sum((plan) => plan.draft.invoice.amount),
      withheld: sum((plan) => plan.withholding.amount),
      generatedNumbers: invoices.filter((plan) => plan.draft.generatedNumber).length,
    },
  };
}

/** « Reprise du journal des achats » — what `PurchaseInvoice.importedFrom` holds: « AAAA-MM-JJ|fichier ». */
export function importedFromValue(day: string, fileName: string): string {
  return `${day}|${fileName}`.slice(0, TEXT_MAX);
}

/** The sentence a screen prints for `importedFrom`; null for an invoice typed on the screen. */
export function importedFromLabel(value: string | null): string | null {
  if (!value) return null;
  const at = value.indexOf("|");
  const day = at > 0 ? value.slice(0, at) : "";
  const file = at > 0 ? value.slice(at + 1) : value;
  const readable = parseIsoDay(day) ? day.split("-").reverse().join("/") : "";
  return `Reprise du journal des achats (${[file, readable].filter(Boolean).join(", ")})`;
}
