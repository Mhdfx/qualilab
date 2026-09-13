import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateSite } from "@/lib/site-input";

/** Editing or deactivating a site — never deleted, séries refer to it. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; siteId: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id, siteId } = await params;
  const existing = await prisma.site.findFirst({
    where: { id: siteId, clientId: id },
    select: { id: true, code: true, name: true, address: true, city: true, phone: true, contact: true, active: true },
  });
  if (!existing) return NextResponse.json({ error: "Site introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const input = (body ?? {}) as Record<string, unknown>;
  const checked = validateSite({
    name: input.name ?? existing.name,
    code: input.code ?? existing.code ?? "",
    address: input.address ?? existing.address ?? "",
    city: input.city ?? existing.city ?? "",
    phone: input.phone ?? existing.phone ?? "",
    contact: input.contact ?? existing.contact ?? "",
    active: input.active ?? existing.active,
  });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  if (checked.value.name !== existing.name) {
    const duplicate = await prisma.site.findUnique({
      where: { clientId_name: { clientId: id, name: checked.value.name } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "Ce client a déjà un site de ce nom." }, { status: 409 });
  }

  const site = await prisma.site.update({
    where: { id: siteId },
    data: checked.value,
    select: { id: true, code: true, name: true, address: true, city: true, phone: true, contact: true, active: true },
  });

  await logAudit({
    actorId: session.id,
    action: "SITE_UPDATED",
    entity: "Site",
    entityId: siteId,
    metadata: { clientId: id, before: existing, after: site },
  });

  return NextResponse.json(site);
}
