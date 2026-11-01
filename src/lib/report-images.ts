import "server-only";
import { prisma } from "./prisma";
import type { ReportImages } from "./report-html";

/**
 * The accreditation logo and the stamp uploaded in /admin/entreprise
 * (RETOUR-LABO-28-10.md K4), read apart from the identity (`getCompany`):
 * only the report prints them. A failed read prints neither, never fails a
 * report — exactly as before they existed.
 */
export async function getReportImages(): Promise<ReportImages> {
  try {
    const row = await prisma.companySettings.findUnique({
      where: { id: "company" },
      select: { accreditationLogoData: true, stampData: true },
    });
    return { accreditationLogoDataUri: row?.accreditationLogoData ?? null, stampDataUri: row?.stampData ?? null };
  } catch (error) {
    console.error("[report] accreditation logo and stamp unreadable, printed without them", { error });
    return {};
  }
}

/** Which of the two files exist — what a version issued now freezes (`accreditationLogo`, `stamp`). */
export async function reportImagesPresent(): Promise<{ accreditationLogo: boolean; stamp: boolean }> {
  const images = await getReportImages();
  return { accreditationLogo: Boolean(images.accreditationLogoDataUri), stamp: Boolean(images.stampDataUri) };
}
