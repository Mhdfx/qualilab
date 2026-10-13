export type CompanyInfo = {
  name: string; tagline: string; address: string; city: string; phone: string;
  email: string; website: string; ice: string; rc: string; bank: string;
  rib: string; iban: string; swift: string;
  /** Logo as a data URI, printed on the PDFs; null = styled text brand. */
  logoData: string | null;
  /** Identifiant fiscal (IF) — see `COMPANY_OPTIONAL_FIELDS`. */
  fiscalId: string | null;
  patente: string | null;
  cnss: string | null;
  fax: string | null;
};

/**
 * The fields of the report's footer (PG06/EN03 version M) beyond the
 * required identity: the legal identifiers IF, Patente, CNSS and the fax.
 * Optional — null until the owner types them in /admin/entreprise, and never
 * a placeholder in the defaults: a document leaves a missing one out rather
 * than print a made-up identifier.
 */
export const COMPANY_OPTIONAL_FIELDS = ["fiscalId", "patente", "cnss", "fax"] as const;

export type CompanyOptionalField = (typeof COMPANY_OPTIONAL_FIELDS)[number];

/** Fallback defaults — used until the admin saves the real identity. */
export const COMPANY: CompanyInfo = {
  name: "Qualilab International",
  tagline: "Laboratoire d'analyses agroalimentaire, eaux & environnement de travail",
  address: "Zone Industrielle, Casablanca",
  city: "Casablanca, Maroc",
  phone: "+212 5 22 00 00 00",
  email: "contact@qualilab.ma",
  website: "www.qualilab.ma",
  ice: "0000000000000",
  rc: "000000",
  bank: "Banque Populaire — Agence Casablanca",
  rib: "190 780 21211 0000123456 78",
  iban: "MA64 1907 8021 2110 0001 2345 678",
  swift: "BCPOMAMC",
  logoData: null,
  fiscalId: null,
  patente: null,
  cnss: null,
  fax: null,
};
