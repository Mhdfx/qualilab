import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ALERT_COPY_MAX, parseAlertCopy } from "@/lib/alert-copies";
import { ALERT_COPY_SELECT } from "@/lib/alert-copies-server";

/**
 * The laboratory's addresses copied on the contamination alerts
 * (RETOUR-LABO-28-10.md L5 — Q93, to confirm by R-16). `GET` the list,
 * `POST { email, label?, allClients, clientIds? }` one more. ADMIN only,
 * journalled. The clients chosen must exist (archived ones are kept: their
 * old séries still alert).
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const rows = await prisma.alertCopyAddress.findMany({ select: ALERT_COPY_SELECT, orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows);
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
  const parsed = parseAlertCopy(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const value = parsed.value;

  const [count, duplicate, known] = await Promise.all([
    prisma.alertCopyAddress.count(),
    prisma.alertCopyAddress.findFirst({ where: { email: value.email }, select: { id: true } }),
    value.clientIds.length ? prisma.client.count({ where: { id: { in: value.clientIds } } }) : Promise.resolve(0),
  ]);
  if (count >= ALERT_COPY_MAX) return NextResponse.json({ error: `${ALERT_COPY_MAX} adresses au plus.` }, { status: 400 });
  if (duplicate) return NextResponse.json({ error: "Cette adresse est déjà dans la liste." }, { status: 409 });
  if (known !== value.clientIds.length) return NextResponse.json({ error: "Client inconnu." }, { status: 400 });

  const created = await prisma.alertCopyAddress.create({
    data: {
      email: value.email,
      label: value.label,
      allClients: value.allClients,
      active: value.active,
      clients: { create: value.clientIds.map((clientId) => ({ clientId })) },
    },
    select: ALERT_COPY_SELECT,
  });
  await logAudit({
    actorId: session.id,
    action: "ALERT_COPY_CREATED",
    entity: "AlertCopyAddress",
    entityId: created.id,
    metadata: { email: value.email, label: value.label, allClients: value.allClients, active: value.active, clientIds: value.clientIds },
  });
  return NextResponse.json(created, { status: 201 });
}
