import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { siegeSiteRefusal, validateSite } from "@/lib/site-input";
import { createdSiteActive } from "@/lib/site-creation";

const SITE_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  phone: true,
  contact: true,
  active: true,
  // CLIENTS-FUSION.md §4: « Facturé à » (null: the site's own client).
  billingClient: { select: { id: true, name: true } },
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
  // The préleveur may create the site they are standing on (WORKFLOW.md §13).
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "GESTIONNAIRE", "ADMIN");
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
  // The pickers' « Siège (adresse du client) » is no site — the rule of
  // POST /api/clients too (`siegeSiteRefusal`).
  const siege = siegeSiteRefusal(checked.value.name);
  if (siege) return NextResponse.json({ error: siege }, { status: 400 });
  // The préleveur and the reception create the site they need: always
  // active, an `active: false` from them is ignored (src/lib/site-creation.ts).
  const value = { ...checked.value, active: createdSiteActive(session.role, checked.value.active) };

  // One name per client (the schema's unique index); say so instead of a 500.
  const duplicate = await prisma.site.findUnique({
    where: { clientId_name: { clientId: id, name: value.name } },
    select: { id: true },
  });
  if (duplicate) return NextResponse.json({ error: "Ce client a déjà un site de ce nom." }, { status: 409 });

  let site;
  try {
    site = await prisma.site.create({ data: { clientId: id, ...value }, select: SITE_SELECT });
  } catch (error) {
    // The same name created at the same instant (double click): the unique
    // index refuses the second, which answers like the check above.
    if ((error as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Ce client a déjà un site de ce nom." }, { status: 409 });
    }
    throw error;
  }

  await logAudit({
    actorId: session.id,
    action: "SITE_CREATED",
    entity: "Site",
    entityId: site.id,
    metadata: { clientId: id, name: site.name, city: site.city },
  });

  return NextResponse.json(site, { status: 201 });
}
