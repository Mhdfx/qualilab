import "server-only";
import { prisma } from "./prisma";
import { COMPANY, type CompanyInfo } from "./company";

/**
 * The identity to print on documents: the row the admin edits, or the static
 * defaults when none has been saved yet. Server-only — `company.ts` stays pure
 * data so client components may import the type and the defaults without
 * dragging the database driver into their bundle.
 */

/** Keeps only the printable fields of a settings row. */
export function pickCompanyInfo(
  row: CompanyInfo & { id?: string; updatedAt?: Date }
): CompanyInfo {
  return {
    name: row.name, tagline: row.tagline, address: row.address, city: row.city,
    phone: row.phone, email: row.email, website: row.website, ice: row.ice,
    rc: row.rc, bank: row.bank, rib: row.rib, iban: row.iban, swift: row.swift,
  };
}

/** Reading the identity must never break a document: any failure falls back. */
export async function getCompany(): Promise<CompanyInfo> {
  try {
    const saved = await prisma.companySettings.findUnique({
      where: { id: "company" },
    });
    return saved ? pickCompanyInfo(saved) : COMPANY;
  } catch (error) {
    console.error("[company] falling back to defaults", { error });
    return COMPANY;
  }
}
