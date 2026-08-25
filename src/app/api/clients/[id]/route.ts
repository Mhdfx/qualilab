import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";

/**
 * A client record: read, update, archive.
 *
 * Managing clients belongs to the gestionnaire commercial and the admin. A
 * client is never deleted — samples, reports and invoices refer to it, and the
 * laboratory's history must stay readable — so "removing" one archives it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const client = await prisma.client.findUnique({
    where: { id },
    include: { emails: { orderBy: { email: "asc" } } },
  });

  if (!client) {
    return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  }

  return NextResponse.json(client);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!existing) {
    return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { archived, emails, ...fields } = (body ?? {}) as {
    archived?: unknown;
    emails?: unknown;
    [key: string]: unknown;
  };

  // Archiving is its own action and does not require the whole record.
  if (typeof archived === "boolean" && Object.keys(fields).length === 0) {
    const updated = await prisma.client.update({
      where: { id },
      data: { archived },
      select: { id: true, name: true, archived: true },
    });

    await logAudit({
      actorId: session.id,
      action: archived ? "CLIENT_ARCHIVED" : "CLIENT_RESTORED",
      entity: "Client",
      entityId: id,
      metadata: { name: updated.name },
    });

    return NextResponse.json(updated);
  }

  const validated = validateClient(fields);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const list = validateClientEmails(emails);
  if (!list.ok) {
    return NextResponse.json({ error: list.error }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const client = await tx.client.update({
      where: { id },
      data: {
        ...validated.value,
        ...(typeof archived === "boolean" ? { archived } : {}),
      },
    });

    if (emails !== undefined) {
      // The list is replaced wholesale: simpler than diffing, and the client
      // form always submits the complete set.
      await tx.clientEmail.deleteMany({ where: { clientId: id } });
      if (list.value.length > 0) {
        await tx.clientEmail.createMany({
          data: list.value.map((entry) => ({ ...entry, clientId: id })),
        });
      }
    }

    return client;
  });

  await logAudit({
    actorId: session.id,
    action: "CLIENT_UPDATED",
    entity: "Client",
    entityId: id,
    metadata: { name: updated.name, emails: list.value.length },
  });

  return NextResponse.json(updated);
}
