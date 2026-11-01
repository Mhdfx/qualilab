import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "./prisma";
import { frozenReportImages, type ReportData, type ReportImages } from "./report-html";

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

/** The key of an image in `ReportImageArchive`: the SHA-256 of its data URI. */
export function reportImageHash(dataUri: string): string {
  return createHash("sha256").update(dataUri, "utf8").digest("hex");
}

/** What a version issued now freezes (K4): which file exists, and its hash. */
export type IssuedReportImages = {
  accreditationLogo: boolean;
  stamp: boolean;
  accreditationLogoHash?: string;
  stampHash?: string;
};

/**
 * At an issue (K4, « figé avec chaque version émise »): the files uploaded
 * now, each archived by its hash (append-only, a known hash is left as is)
 * so the version prints this very image for ever — a duplicata, a portal
 * download or a resend after the file is replaced or removed included. If
 * the archive cannot be written, the version is issued without the images
 * (logged), never with an image it could not keep.
 */
export async function freezeReportImages(): Promise<IssuedReportImages> {
  const images = await getReportImages();
  const logo = images.accreditationLogoDataUri || null;
  const stamp = images.stampDataUri || null;
  const files = [logo, stamp].filter((uri): uri is string => Boolean(uri));
  if (files.length === 0) return { accreditationLogo: false, stamp: false };
  try {
    await prisma.reportImageArchive.createMany({
      data: files.map((dataUri) => ({ hash: reportImageHash(dataUri), dataUri })),
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("[report] accreditation logo and stamp not archived, version issued without them", { error });
    return { accreditationLogo: false, stamp: false };
  }
  return {
    accreditationLogo: Boolean(logo),
    stamp: Boolean(stamp),
    ...(logo ? { accreditationLogoHash: reportImageHash(logo) } : {}),
    ...(stamp ? { stampHash: reportImageHash(stamp) } : {}),
  };
}

/**
 * The images a version prints: those frozen at its issue, read from the
 * archive by hash (`frozenReportImages`) — never the file uploaded today.
 * A failed read prints neither, never fails a report.
 */
export async function issuedReportImages(
  data: Pick<ReportData, "accreditationLogo" | "stamp" | "accreditationLogoHash" | "stampHash">
): Promise<ReportImages> {
  const hashes = [data.accreditationLogo ? data.accreditationLogoHash : undefined, data.stamp ? data.stampHash : undefined].filter(
    (hash): hash is string => Boolean(hash)
  );
  if (hashes.length === 0) return {};
  try {
    const rows = await prisma.reportImageArchive.findMany({ where: { hash: { in: hashes } }, select: { hash: true, dataUri: true } });
    return frozenReportImages(data, new Map(rows.map((row) => [row.hash, row.dataUri])));
  } catch (error) {
    console.error("[report] archived accreditation logo and stamp unreadable, printed without them", { error });
    return {};
  }
}
