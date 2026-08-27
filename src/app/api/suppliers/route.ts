import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateSupplier } from "@/lib/achat-validation";

/**
 * Suppliers — Phase 6. Operated by the MAGASINIER (ADMIN keeps oversight,
 * as everywhere). Suppliers are archived, never deleted: their invoices are
 * the lab's payment history.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const includeArchived = searchParams.get("archived") === "true";

  const suppliers = await prisma.supplier.findMany({
    where: includeArchived ? undefined : { archived: false },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { invoices: { where: { status: "A_PAYER" } } },
      },
    },
  });

  return NextResponse.json(
    suppliers.map(({ _count, ...supplier }) => ({
      ...supplier,
      unpaidInvoices: _count.invoices,
    }))
  );
}

export async function POST(request: Request) {
  const session = await requireApiRole("MAGASINIER", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const validated = validateSupplier((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

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

  const supplier = await prisma.supplier.create({ data: validated.value });

  await logAudit({
    actorId: session.id,
    action: "SUPPLIER_CREATED",
    entity: "Supplier",
    entityId: supplier.id,
    metadata: { name: supplier.name, paymentTermDays: supplier.paymentTermDays },
  });

  return NextResponse.json(supplier, { status: 201 });
}
