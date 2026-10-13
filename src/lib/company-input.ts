import { COMPANY_OPTIONAL_FIELDS, type CompanyInfo, type CompanyOptionalField } from "./company";

/**
 * Reading the laboratory's identity from /admin/entreprise — pure, so the
 * form and `PUT /api/admin/company` share the labels and the rules.
 */

/** The text fields every document needs: refused when empty. */
export const COMPANY_REQUIRED_FIELDS = [
  "name", "tagline", "address", "city", "phone", "email",
  "website", "ice", "rc", "bank", "rib", "iban", "swift",
] as const;

export type CompanyRequiredField = (typeof COMPANY_REQUIRED_FIELDS)[number];

/** The label of each field, on the form and in the API's messages. */
export const COMPANY_FIELD_LABELS: Record<Exclude<keyof CompanyInfo, "logoData">, string> = {
  name: "Raison sociale",
  tagline: "Activité (sous le logo)",
  address: "Adresse",
  city: "Ville",
  phone: "Téléphone",
  fax: "Fax",
  email: "Email",
  website: "Site web",
  ice: "ICE",
  rc: "RC",
  fiscalId: "IF (identifiant fiscal)",
  patente: "Patente",
  cnss: "CNSS",
  bank: "Banque",
  rib: "RIB",
  iban: "IBAN",
  swift: "SWIFT",
};

/**
 * The legal identifiers and the fax print on one line of the report's
 * footer (PG06/EN03 version M), whose height the page reserves: a value
 * stays short, and in the characters such a number is written with.
 */
const OPTIONAL_RULES: Record<CompanyOptionalField, { max: number; pattern: RegExp; allowed: string }> = {
  fiscalId: { max: 30, pattern: /^[0-9A-Za-z][0-9A-Za-z ./-]*$/, allowed: "des chiffres, des lettres, des espaces, « . », « / » ou « - »" },
  patente: { max: 30, pattern: /^[0-9A-Za-z][0-9A-Za-z ./-]*$/, allowed: "des chiffres, des lettres, des espaces, « . », « / » ou « - »" },
  cnss: { max: 30, pattern: /^[0-9A-Za-z][0-9A-Za-z ./-]*$/, allowed: "des chiffres, des lettres, des espaces, « . », « / » ou « - »" },
  fax: { max: 40, pattern: /^[0-9+(][0-9 +().\/-]*$/, allowed: "des chiffres, des espaces et les signes + ( ) . / -" },
};

/** The longest value accepted for each optional field (the form's `maxLength`). */
export const COMPANY_OPTIONAL_MAX: Record<CompanyOptionalField, number> = {
  fiscalId: OPTIONAL_RULES.fiscalId.max,
  patente: OPTIONAL_RULES.patente.max,
  cnss: OPTIONAL_RULES.cnss.max,
  fax: OPTIONAL_RULES.fax.max,
};

export type OptionalFieldsRead =
  | { ok: true; data: Partial<Record<CompanyOptionalField, string | null>> }
  | { ok: false; error: string };

/**
 * IF, Patente, CNSS and fax from a request body. Each is optional: absent
 * leaves the stored value as it is (a page opened before these fields
 * existed), null or blank clears it — the footer then leaves it out — and a
 * text is trimmed, with its inner spaces collapsed, then checked.
 */
export function readCompanyOptionalFields(input: Record<string, unknown>): OptionalFieldsRead {
  const data: Partial<Record<CompanyOptionalField, string | null>> = {};
  for (const field of COMPANY_OPTIONAL_FIELDS) {
    if (!(field in input) || input[field] === undefined) continue;
    const raw = input[field];
    const label = COMPANY_FIELD_LABELS[field];
    if (raw === null) {
      data[field] = null;
      continue;
    }
    if (typeof raw !== "string") return { ok: false, error: `Le champ « ${label} » est invalide.` };
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) {
      data[field] = null;
      continue;
    }
    const rule = OPTIONAL_RULES[field];
    if (value.length > rule.max) {
      return { ok: false, error: `Le champ « ${label} » est trop long (${rule.max} caractères maximum).` };
    }
    if (!rule.pattern.test(value)) {
      return { ok: false, error: `Le champ « ${label} » ne peut contenir que ${rule.allowed}.` };
    }
    data[field] = value;
  }
  return { ok: true, data };
}
