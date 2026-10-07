import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateSite } from "@/lib/site-input";
import { checkSiteBilling } from "@/lib/client-merge-rules";

const SITE_SELECT = {
  id: true,
  code: true,
  name: true,
  address: true,
  city: true,
  phone: true,
  contact: true,
  active: true,
  billingClient: { select: { id: true, name: true } },
} as const;

/**
 * Editing or deactivating a site — never deleted, séries refer to it.
 *
 * `billingClientId` (CLIENTS-FUSION.md §4, « Facturé à »): absent = unchanged;
 * null or "" = the site's own client; otherwise a billing client of the
 * site's client (`checkSiteBilling`). The site's own client chosen
 * explicitly is stored as null.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; siteId: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id, siteId } = await params;
  const existing = await prisma.site.findFirst({
    where: { id: siteId, clientId: id },
    select: { ...SITE_SELECT, clientId: true },
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

  // « Facturé à »: checked against the billing client as it is now.
  let billingClientId: string | null | undefined;
  if (input.billingClientId !== undefined) {
    if (input.billingClientId !== null && typeof input.billingClientId !== "string") {
      return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    }
    const wanted = typeof input.billingClientId === "string" && input.billingClientId.trim() ? input.billingClientId.trim() : null;
    const billing = wanted
      ? await prisma.client.findUnique({ where: { id: wanted }, select: { id: true, name: true, archived: true, billedForId: true } })
      : null;
    if (wanted && !billing) return NextResponse.json({ error: "Client facturé introuvable." }, { status: 404 });
    const rule = checkSiteBilling({ id: existing.id, clientId: existing.clientId, name: existing.name }, billing);
    if (!rule.ok) return NextResponse.json({ error: rule.error }, { status: 400 });
    billingClientId = rule.billingClientId;
  }

  if (checked.value.name !== existing.name) {
    const duplicate = await prisma.site.findUnique({
      where: { clientId_name: { clientId: id, name: checked.value.name } },
      select: { id: true },
    });
    if (duplicate) return NextResponse.json({ error: "Ce client a déjà un site de ce nom." }, { status: 409 });
  }

  const site = await prisma.site.update({
    where: { id: siteId },
    data: { ...checked.value, ...(billingClientId !== undefined ? { billingClientId } : {}) },
    select: SITE_SELECT,
  });

  // The journal keeps the site's own fields and « Facturé à » apart.
  const fields = (row: typeof site) => ({
    id: row.id,
    code: row.code,
    name: row.name,
    address: row.address,
    city: row.city,
    phone: row.phone,
    contact: row.contact,
    active: row.active,
  });
  const before = fields(existing);
  const after = fields(site);
  const fieldsChanged = (Object.keys(after) as (keyof typeof after)[]).some((key) => before[key] !== after[key]);
  const beforeBilling = existing.billingClient;
  const afterBilling = site.billingClient;
  const billingChanged = (beforeBilling?.id ?? null) !== (afterBilling?.id ?? null);

  if (fieldsChanged || !billingChanged) {
    await logAudit({
      actorId: session.id,
      action: "SITE_UPDATED",
      entity: "Site",
      entityId: siteId,
      metadata: { clientId: id, before, after },
    });
  }
  if (billingChanged) {
    await logAudit({
      actorId: session.id,
      action: "SITE_BILLING_CHANGED",
      entity: "Site",
      entityId: siteId,
      metadata: { clientId: id, name: site.name, from: beforeBilling ?? null, to: afterBilling ?? null },
    });
  }

  return NextResponse.json(site);
}
