import { NextResponse } from "next/server";
import type { SampleType } from "@/generated/prisma/client";
import { requireApiRole } from "@/lib/auth";
import { roleAllowed } from "@/lib/roles";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateProductType } from "@/lib/criteria-input";
import { SAMPLE_TYPES } from "@/lib/parameter-validation";
import { productTypeListWhere } from "@/lib/product-type-list";
import { similarLabels } from "@/lib/similar";

/**
 * The product types (familles de produits) of the catalogue — the forms
 * pick one per line (a client's own types first); the administrator and the
 * responsable des paramètres manage them (16/10, Q125 — RETOUR-LABO-16-10.md
 * F4, `programmation-guards.test.ts`).
 *
 * Filters (RETOUR-LABO-16-10.md F1): `?natureId=` keeps the families of one
 * type d'analyse; `?category=ALIMENTAIRE|EAU|AMBIANCE` keeps the families
 * whose type d'analyse is of that category **plus those still « à
 * préciser »** (no nature yet): an unclassified family may be of any
 * category, and hiding it would make it unpickable on its own lines
 * (`productTypeListWhere`, tested).
 */
export async function GET(request: Request) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "PROGRAMMATEUR", "TECHNICIEN", "VALIDATEUR", "DIRECTION", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const q = params.get("q")?.trim();
  const clientId = params.get("clientId") || null;
  // The archived families and every client's own: the families' managers only.
  const all = params.get("all") === "1" && roleAllowed(session.role, ["PROGRAMMATEUR", "ADMIN"]);
  const natureId = params.get("natureId") || null;
  const category = params.get("category") || null;
  // The same sentence as GET /api/parameters for the same mistake.
  if (category !== null && !SAMPLE_TYPES.includes(category as SampleType)) {
    return NextResponse.json({ error: "Catégorie d'analyse invalide." }, { status: 400 });
  }

  const where = productTypeListWhere({ all, clientId, natureId, category: category as SampleType | null, q: q || null });

  const rows = await prisma.productType.findMany({
    where,
    select: {
      id: true,
      name: true,
      family: true,
      natureId: true,
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
        natureId: row.natureId,
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
  const session = await requireApiRole("PROGRAMMATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  // The type d'analyse chosen, read for its domain and whether it is archived.
  const natureId = (body as { natureId?: unknown } | null)?.natureId;
  const natures = typeof natureId === "string" && natureId
    ? await prisma.analysisNature.findMany({ where: { id: natureId }, select: { id: true, family: true, active: true } })
    : [];
  const checked = validateProductType(body, natures);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (checked.value.clientId) {
    const client = await prisma.client.findUnique({ where: { id: checked.value.clientId }, select: { id: true } });
    if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 400 });
  }
  const duplicate = await prisma.productType.findFirst({
    where: { normalizedName: checked.value.normalizedName, clientId: checked.value.clientId },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Cette famille de produits existe déjà." }, { status: 409 });

  // A type one typing error away from an existing one is almost always a
  // duplicate (« Salade composee » / « Salades composées »): the admin
  // confirms explicitly before a second one is created.
  if ((body as { confirmSimilar?: unknown }).confirmSimilar !== true) {
    const others = await prisma.productType.findMany({
      where: { OR: [{ clientId: null }, ...(checked.value.clientId ? [{ clientId: checked.value.clientId }] : [])] },
      select: { name: true },
    });
    const similar = similarLabels(checked.value.name, others.map((t) => t.name), 5);
    if (similar.length > 0) {
      return NextResponse.json(
        { error: "Une famille de produits très proche existe déjà.", similar },
        { status: 409 }
      );
    }
  }

  const created = await prisma.productType.create({ data: checked.value, select: { id: true, name: true } });
  await logAudit({ actorId: session.id, action: "PRODUCT_TYPE_CREATED", entity: "ProductType", entityId: created.id, metadata: checked.value });
  return NextResponse.json(created, { status: 201 });
}
