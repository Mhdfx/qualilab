export type CompanyInfo = {
  name: string; tagline: string; address: string; city: string; phone: string;
  email: string; website: string; ice: string; rc: string; bank: string;
  rib: string; iban: string; swift: string;
};

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
};

/**
 * The identity to print on documents: the row the admin edits, or the
 * defaults above when none has been saved yet. Reading it must never break a
 * document, so any failure falls back to the defaults.
 */
