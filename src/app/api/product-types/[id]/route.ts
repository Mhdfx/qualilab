import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateProductType } from "@/lib/criteria-input";

const DETAIL_SELECT: Prisma.ProductTypeSelect = {
  id: true,
  name: true,
  family: true,
  clientId: true,
  active: true,
  client: { select: { name: true } },
  criteria: {
    select: {
      id: true,
      parameterId: true,
      normVersionId: true,
      unit: true,
      n: true,
      c: true,
      mKind: true,
      m: true,
      bigM: true,
      active: true,
      parameter: { select: { name: true } },
      normVersion: { select: { label: true, current: true } },
    },
    orderBy: [{ parameter: { name: "asc" } }, { normVersion: { version: "desc" } }],
  },
};

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("TECHNICIEN", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const type = await prisma.productType.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!type) return NextResponse.json({ error: "Type de produit introuvable." }, { status: 404 });
  return NextResponse.json(type);
}

/** Name, family, client and activity — the criteria have their own route. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const existing = await prisma.productType.findUnique({
    where: { id },
    select: { id: true, name: true, family: true, clientId: true, active: true },
  });
  if (!existing) return NextResponse.json({ error: "Type de produit introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const checked = validateProductType({
    name: input.name ?? existing.name,
    family: input.family ?? existing.family,
    clientId: input.clientId === undefined ? existing.clientId ?? "" : input.clientId,
    active: input.active ?? existing.active,
  });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (checked.value.clientId && checked.value.clientId !== existing.clientId) {
    const client = await prisma.client.findUnique({ where: { id: checked.value.clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 400 });
  }
  const duplicate = await prisma.productType.findFirst({
    where: { normalizedName: checked.value.normalizedName, clientId: checked.value.clientId, id: { not: id } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Un type de produit de ce nom existe déjà." }, { status: 409 });

  const updated = await prisma.productType.update({ where: { id }, data: checked.value, select: DETAIL_SELECT });
  await logAudit({ actorId: session.id, action: "PRODUCT_TYPE_UPDATED", entity: "ProductType", entityId: id, metadata: { before: existing, after: checked.value } });
  return NextResponse.json(updated);
}
