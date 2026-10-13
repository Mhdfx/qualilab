import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { getCompany, pickCompanyInfo } from "@/lib/company-server";
import { COMPANY_OPTIONAL_FIELDS } from "@/lib/company";
import { COMPANY_FIELD_LABELS, COMPANY_REQUIRED_FIELDS, readCompanyOptionalFields } from "@/lib/company-input";

/**
 * The laboratory's identity — printed on every report, invoice and email.
 * One row, upserted; every text field required so a half-empty identity can
 * never reach an official document — except the report footer's IF,
 * Patente, CNSS and fax (PG06/EN03 version M), optional: an empty one is
 * left out of the footer (`readCompanyOptionalFields`).
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await getCompany());
}

const FIELDS = COMPANY_REQUIRED_FIELDS;

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
        { error: `Le champ « ${COMPANY_FIELD_LABELS[field]} » est obligatoire.` },
        { status: 400 }
      );
    }
    // VARCHAR(191) except the tagline (TEXT): refuse rather than crash on insert.
    if (field !== "tagline" && value.length > 191) {
      return NextResponse.json(
        { error: `Le champ « ${COMPANY_FIELD_LABELS[field]} » est trop long (191 caractères maximum).` },
        { status: 400 }
      );
    }
    data[field] = value;
  }

  // IF, Patente, CNSS, fax: absent = unchanged, blank = cleared.
  const optional = readCompanyOptionalFields(input);
  if (!optional.ok) {
    return NextResponse.json({ error: optional.error }, { status: 400 });
  }

  // The logo is optional (NEEDEDINFO item 5 — the HD file is still awaited):
  // a data URI to set it, null/"" to remove it, absent to leave it untouched.
  let logoData: string | null | undefined = undefined;
  if ("logoData" in input) {
    const value = input.logoData;
    if (value === null || value === "") {
      logoData = null;
    } else if (typeof value === "string") {
      // Whole-string check: prefix AND a pure base64 body, so nothing in the
      // value can ever close the <img src="…"> attribute in the PDF templates.
      if (!/^data:image\/(png|jpe?g|svg\+xml|webp);base64,[A-Za-z0-9+/]+=*$/.test(value)) {
        return NextResponse.json(
          { error: "Logo invalide — PNG, JPEG, SVG ou WebP attendu." },
          { status: 400 }
        );
      }
      if (value.length > 400_000) {
        return NextResponse.json(
          { error: "Logo trop lourd — 300 Ko maximum." },
          { status: 400 }
        );
      }
      logoData = value;
    } else {
      return NextResponse.json({ error: "Logo invalide." }, { status: 400 });
    }
  }

  const before = await getCompany();

  const saved = await prisma.companySettings.upsert({
    where: { id: "company" },
    create: { id: "company", ...data, ...optional.data, logoData: logoData ?? null },
    update: { ...data, ...optional.data, ...(logoData !== undefined ? { logoData } : {}) },
  });

  await logAudit({
    actorId: session.id,
    action: "COMPANY_UPDATED",
    entity: "CompanySettings",
    entityId: "company",
    metadata: {
      changed: [
        ...FIELDS.filter((f) => before[f] !== data[f]),
        ...COMPANY_OPTIONAL_FIELDS.filter((f) => f in optional.data && before[f] !== optional.data[f]),
        ...(logoData !== undefined && logoData !== before.logoData
          ? ["logo"]
          : []),
      ],
    },
  });

  return NextResponse.json(pickCompanyInfo(saved));
}
