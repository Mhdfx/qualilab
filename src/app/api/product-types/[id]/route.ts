import { NextResponse } from "next/server";
import type { Prisma } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateProductType } from "@/lib/criteria-input";
import { similarLabels } from "@/lib/similar";
import { normalizeLabel as normalizeName } from "@/lib/serie-input";

const DETAIL_SELECT: Prisma.ProductTypeSelect = {
  id: true,
  name: true,
  family: true,
  natureId: true,
  clientId: true,
  active: true,
  regulationId: true,
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
  const session = await requireApiRole("PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const type = await prisma.productType.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!type) return NextResponse.json({ error: "Famille de produits introuvable." }, { status: 404 });
  return NextResponse.json(type);
}

/** Name, type d'analyse, family, client, activity and the report's
 *  regulation text — the criteria have their own route. `natureId` left out
 *  keeps the family's; null or "" sets it back to « à préciser ». The
 *  responsable des paramètres manages the families too (16/10, Q125). */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const existing = await prisma.productType.findUnique({
    where: { id },
    select: { id: true, name: true, family: true, natureId: true, clientId: true, active: true, regulationId: true },
  });
  if (!existing) return NextResponse.json({ error: "Famille de produits introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const natureId = input.natureId === undefined ? existing.natureId : input.natureId;
  // The nature the family already carries stays acceptable once archived:
  // renaming or deactivating the family must not trip over it.
  const natures = typeof natureId === "string" && natureId
    ? (await prisma.analysisNature.findMany({ where: { id: natureId }, select: { id: true, family: true, active: true } }))
        .map((nature) => ({ ...nature, active: nature.active || nature.id === existing.natureId }))
    : [];
  const checked = validateProductType(
    {
      name: input.name ?? existing.name,
      family: input.family ?? existing.family,
      natureId,
      clientId: input.clientId === undefined ? existing.clientId ?? "" : input.clientId,
      active: input.active ?? existing.active,
    },
    natures
  );
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // The regulation proposed for this type's samples (slice I): null = the family's.
  let regulationId = existing.regulationId;
  if (input.regulationId !== undefined) {
    if (input.regulationId === null || input.regulationId === "") {
      regulationId = null;
    } else {
      const found = typeof input.regulationId === "string"
        ? await prisma.regulation.findFirst({ where: { id: input.regulationId, active: true }, select: { id: true } })
        : null;
      if (!found) return NextResponse.json({ error: "Réglementation inconnue ou archivée." }, { status: 400 });
      regulationId = found.id;
    }
  }

  if (checked.value.clientId && checked.value.clientId !== existing.clientId) {
    const client = await prisma.client.findUnique({ where: { id: checked.value.clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 400 });
  }
  const duplicate = await prisma.productType.findFirst({
    where: { normalizedName: checked.value.normalizedName, clientId: checked.value.clientId, id: { not: id } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Une famille de produits de ce nom existe déjà." }, { status: 409 });

  // Renaming into a near-duplicate of another type asks for the same confirmation.
  if (checked.value.normalizedName !== normalizeName(existing.name) && input.confirmSimilar !== true) {
    const others = await prisma.productType.findMany({
      where: { id: { not: id }, OR: [{ clientId: null }, ...(checked.value.clientId ? [{ clientId: checked.value.clientId }] : [])] },
      select: { name: true },
    });
    const similar = similarLabels(checked.value.name, others.map((t) => t.name), 5);
    if (similar.length > 0) {
      return NextResponse.json({ error: "Une famille de produits très proche existe déjà.", similar }, { status: 409 });
    }
  }

  const updated = await prisma.productType.update({ where: { id }, data: { ...checked.value, regulationId }, select: DETAIL_SELECT });
  await logAudit({ actorId: session.id, action: "PRODUCT_TYPE_UPDATED", entity: "ProductType", entityId: id, metadata: { before: existing, after: { ...checked.value, regulationId } } });
  return NextResponse.json(updated);
}
