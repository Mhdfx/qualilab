import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCompany, pickCompanyInfo } from "@/lib/company-server";

/**
 * The laboratory's identity — printed on every report, invoice and email.
 * One row, upserted; every field required so a half-empty identity can never
 * reach an official document.
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await getCompany());
}

const FIELDS = [
  "name", "tagline", "address", "city", "phone", "email",
  "website", "ice", "rc", "bank", "rib", "iban", "swift",
] as const;

export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const data = {} as Record<(typeof FIELDS)[number], string>;

  for (const field of FIELDS) {
    const value = typeof input[field] === "string" ? (input[field] as string).trim() : "";
    if (!value) {
      return NextResponse.json(
        { error: `Le champ « ${field} » est obligatoire.` },
        { status: 400 }
      );
    }
    data[field] = value;
  }

  const before = await getCompany();

  const saved = await prisma.companySettings.upsert({
    where: { id: "company" },
    create: { id: "company", ...data },
    update: data,
  });

  await logAudit({
    actorId: session.id,
    action: "COMPANY_UPDATED",
    entity: "CompanySettings",
    entityId: "company",
    metadata: {
      changed: FIELDS.filter((f) => before[f] !== data[f]),
    },
  });

  return NextResponse.json(pickCompanyInfo(saved));
}
