import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateSite } from "@/lib/site-input";

const SITE_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  phone: true,
  contact: true,
  active: true,
} as const;

/** A client's sampling sites — the list the préleveur picks from on site. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "GESTIONNAIRE", "COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const sites = await prisma.site.findMany({
    where: { clientId: id, ...(session.role === "GESTIONNAIRE" || session.role === "ADMIN" ? {} : { active: true }) },
    select: SITE_SELECT,
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(sites);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, archived: true } });
  if (!client || client.archived) {
    return NextResponse.json({ error: "Client introuvable ou archivé." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const checked = validateSite(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  // One name per client (the schema's unique index); say so instead of a 500.
  const duplicate = await prisma.site.findUnique({
    where: { clientId_name: { clientId: id, name: checked.value.name } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Ce client a déjà un site de ce nom." }, { status: 409 });

  const site = await prisma.site.create({ data: { clientId: id, ...checked.value }, select: SITE_SELECT });

  await logAudit({
    actorId: session.id,
    action: "SITE_CREATED",
    entity: "Site",
    entityId: site.id,
    metadata: { clientId: id, name: site.name, city: site.city },
  });

  return NextResponse.json(site, { status: 201 });
}
