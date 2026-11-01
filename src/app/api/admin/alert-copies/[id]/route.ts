import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseAlertCopy } from "@/lib/alert-copies";
import { ALERT_COPY_SELECT } from "@/lib/alert-copies-server";

/**
 * One address copied on the contamination alerts (L5): `PUT` the whole
 * address again (e-mail, label, « tous les clients » or the clients chosen,
 * active), `DELETE` to remove it. ADMIN only, journalled before → after.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = parseAlertCopy(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const value = parsed.value;

  const [before, duplicate, known] = await Promise.all([
    prisma.alertCopyAddress.findUnique({ where: { id }, select: ALERT_COPY_SELECT }),
    prisma.alertCopyAddress.findFirst({ where: { email: value.email, NOT: { id } }, select: { id: true } }),
    value.clientIds.length ? prisma.client.count({ where: { id: { in: value.clientIds } } }) : Promise.resolve(0),
  ]);
  if (!before) return NextResponse.json({ error: "Adresse introuvable." }, { status: 404 });
  if (duplicate) return NextResponse.json({ error: "Cette adresse est déjà dans la liste." }, { status: 409 });
  if (known !== value.clientIds.length) return NextResponse.json({ error: "Client inconnu." }, { status: 400 });

  const saved = await prisma.$transaction(async (tx) => {
    await tx.alertCopyClient.deleteMany({ where: { addressId: id } });
    return tx.alertCopyAddress.update({
      where: { id },
      data: {
        email: value.email,
        label: value.label,
        allClients: value.allClients,
        active: value.active,
        clients: { create: value.clientIds.map((clientId) => ({ clientId })) },
      },
      select: ALERT_COPY_SELECT,
    });
  });
  await logAudit({
    actorId: session.id,
    action: "ALERT_COPY_UPDATED",
    entity: "AlertCopyAddress",
    entityId: id,
    metadata: {
      before: { email: before.email, label: before.label, allClients: before.allClients, active: before.active, clientIds: before.clients.map((c) => c.client.id) },
      after: { email: value.email, label: value.label, allClients: value.allClients, active: value.active, clientIds: value.clientIds },
    },
  });
  return NextResponse.json(saved);
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const before = await prisma.alertCopyAddress.findUnique({ where: { id }, select: ALERT_COPY_SELECT });
  if (!before) return NextResponse.json({ error: "Adresse introuvable." }, { status: 404 });
  await prisma.alertCopyAddress.delete({ where: { id } });
  await logAudit({
    actorId: session.id,
    action: "ALERT_COPY_DELETED",
    entity: "AlertCopyAddress",
    entityId: id,
    metadata: { email: before.email, label: before.label, allClients: before.allClients, clientIds: before.clients.map((c) => c.client.id) },
  });
  return NextResponse.json({ ok: true });
}
