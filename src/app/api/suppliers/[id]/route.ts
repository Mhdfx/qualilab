import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateSupplier } from "@/lib/achat-validation";
import { isoDayOf } from "@/lib/date-only";

/** Edit or archive one supplier (lot 3D, M7: « soumis à la retenue », the attestation de régularité fiscale). */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.supplier.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Fournisseur introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;

  // Archiving is its own small action, like clients.
  if (typeof input.archived === "boolean" && Object.keys(input).length === 1) {
    const supplier = await prisma.supplier.update({
      where: { id },
      data: { archived: input.archived },
    });
    await logAudit({
      actorId: session.id,
      action: input.archived ? "SUPPLIER_ARCHIVED" : "SUPPLIER_RESTORED",
      entity: "Supplier",
      entityId: id,
      metadata: { name: supplier.name },
    });
    return NextResponse.json(supplier);
  }

  // A PATCH changes what it carries: a field it leaves out keeps its value
  // (the screen sends the whole form; a body of one field nulled the rest).
  const validated = validateSupplier({
    name: existing.name,
    contact: existing.contact,
    email: existing.email,
    phone: existing.phone,
    address: existing.address,
    ice: existing.ice,
    paymentTermDays: existing.paymentTermDays,
    notes: existing.notes,
    withholdingSubject: existing.withholdingSubject,
    taxCertificateDate: existing.taxCertificateDate ? isoDayOf(existing.taxCertificateDate) : "",
    taxCertificateValidUntil: existing.taxCertificateValidUntil ? isoDayOf(existing.taxCertificateValidUntil) : "",
    ...input,
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  if (validated.value.name !== existing.name) {
    const duplicate = await prisma.supplier.findUnique({
      where: { name: validated.value.name },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: "Un fournisseur porte déjà ce nom." },
        { status: 409 }
      );
    }
  }

  const supplier = await prisma.supplier.update({
    where: { id },
    data: validated.value,
  });

  await logAudit({
    actorId: session.id,
    action: "SUPPLIER_UPDATED",
    entity: "Supplier",
    entityId: id,
    metadata: {
      name: supplier.name,
      before: {
        paymentTermDays: existing.paymentTermDays,
        withholdingSubject: existing.withholdingSubject,
        taxCertificateDate: existing.taxCertificateDate ? isoDayOf(existing.taxCertificateDate) : null,
        taxCertificateValidUntil: existing.taxCertificateValidUntil ? isoDayOf(existing.taxCertificateValidUntil) : null,
      },
      after: {
        paymentTermDays: supplier.paymentTermDays,
        withholdingSubject: supplier.withholdingSubject,
        taxCertificateDate: supplier.taxCertificateDate ? isoDayOf(supplier.taxCertificateDate) : null,
        taxCertificateValidUntil: supplier.taxCertificateValidUntil ? isoDayOf(supplier.taxCertificateValidUntil) : null,
      },
    },
  });

  return NextResponse.json(supplier);
}
