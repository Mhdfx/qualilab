import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateProductType } from "@/lib/criteria-input";

/**
 * The product types of the catalogue — the forms pick one per line
 * (a client's own types first), the admin manages them.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "TECHNICIEN", "VALIDATEUR", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const clientId = params.get("clientId") || null;
  const all = params.get("all") === "1" && session.role === "ADMIN";

  const where: Prisma.ProductTypeWhereInput = {
    ...(all ? {} : { active: true }),
    ...(q ? { name: { contains: q } } : {}),
    ...(all ? {} : clientId ? { OR: [{ clientId }, { clientId: null }] } : { clientId: null }),
  };

  const rows = await prisma.productType.findMany({
    where,
    select: {
      id: true,
      name: true,
      family: true,
      clientId: true,
      active: true,
      client: { select: { name: true } },
      criteria: { where: { active: true }, select: { parameterId: true, n: true, normVersion: { select: { current: true } } } },
    },
    orderBy: [{ clientId: "desc" }, { name: "asc" }],
    take: 400,
  });

  return NextResponse.json(
    rows.map((row) => {
      // The parameters a line inherits: one per germ, the version in force first.
      const parameterIds = [...new Set(row.criteria.map((c) => c.parameterId))];
      return {
        id: row.id,
        name: row.name,
        family: row.family,
        clientId: row.clientId,
        clientName: row.client?.name ?? null,
        active: row.active,
        criteriaCount: row.criteria.length,
        parameterIds,
        unitCount: row.criteria.reduce((max, c) => Math.max(max, c.n), 1),
      };
    })
  );
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const checked = validateProductType(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (checked.value.clientId) {
    const client = await prisma.client.findUnique({ where: { id: checked.value.clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 400 });
  }
  const duplicate = await prisma.productType.findFirst({
    where: { normalizedName: checked.value.normalizedName, clientId: checked.value.clientId },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Ce type de produit existe déjà." }, { status: 409 });

  const created = await prisma.productType.create({ data: checked.value, select: { id: true, name: true } });
  await logAudit({ actorId: session.id, action: "PRODUCT_TYPE_CREATED", entity: "ProductType", entityId: created.id, metadata: checked.value });
  return NextResponse.json(created, { status: 201 });
}
