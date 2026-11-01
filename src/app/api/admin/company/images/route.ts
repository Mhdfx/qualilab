import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCompany } from "@/lib/company-server";
import { getReportImages } from "@/lib/report-images";
import { readImageField } from "@/lib/image-upload";

/**
 * The accreditation logo and the stamp (RETOUR-LABO-28-10.md K4, Q14) —
 * the files the laboratory sends (« [une personne du laboratoire]
 * transmet »), uploaded here and printed on the reports issued afterwards:
 * the logo in the cartouche of a report carrying an accredited analysis, the
 * stamp under « Direction ». Until then nothing is printed.
 *
 * `PUT { accreditationLogoData?, stampData? }`: absent = unchanged, null or
 * "" = removed. ADMIN only, journalled (REPORT_IMAGES_UPDATED, which file
 * changed — never the image itself).
 */
export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const logo = readImageField(input, "accreditationLogoData", "Logo d'accréditation");
  if (!logo.ok) return NextResponse.json({ error: logo.error }, { status: 400 });
  const stamp = readImageField(input, "stampData", "Cachet");
  if (!stamp.ok) return NextResponse.json({ error: stamp.error }, { status: 400 });
  if (logo.value === undefined && stamp.value === undefined) {
    return NextResponse.json({ error: "Aucun fichier à enregistrer." }, { status: 400 });
  }

  const before = await getReportImages();
  const data = {
    ...(logo.value !== undefined ? { accreditationLogoData: logo.value } : {}),
    ...(stamp.value !== undefined ? { stampData: stamp.value } : {}),
  };
  const row = await prisma.companySettings.findUnique({ where: { id: "company" }, select: { id: true } });
  if (!row) {
    // The identity is created whole by /admin/entreprise; the images join it.
    const company = await getCompany();
    const { logoData, ...identity } = company;
    await prisma.companySettings.create({ data: { id: "company", ...identity, logoData, ...data } });
  } else {
    await prisma.companySettings.update({ where: { id: "company" }, data });
  }

  const changed = [
    ...(logo.value !== undefined && logo.value !== (before.accreditationLogoDataUri ?? null) ? [logo.value ? "logo d'accréditation" : "logo d'accréditation retiré"] : []),
    ...(stamp.value !== undefined && stamp.value !== (before.stampDataUri ?? null) ? [stamp.value ? "cachet" : "cachet retiré"] : []),
  ];
  await logAudit({ actorId: session.id, action: "REPORT_IMAGES_UPDATED", entity: "CompanySettings", entityId: "company", metadata: { changed } });

  const after = await getReportImages();
  return NextResponse.json({ accreditationLogoData: after.accreditationLogoDataUri ?? null, stampData: after.stampDataUri ?? null });
}
