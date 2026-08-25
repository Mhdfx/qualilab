import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";

/**
 * The client base.
 *
 * Everyone signed in may read it — a préleveur has to pick a client in the
 * field — but only the gestionnaire commercial and the admin may change it.
 * Archived clients are hidden unless asked for, so the pickers stay short.
 */
export async function GET(request: Request) {
  const session = await requireApiRole();
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const includeArchived = params.get("archived") === "true";
  const search = params.get("q")?.trim();

  const clients = await prisma.client.findMany({
    where: {
      ...(includeArchived ? {} : { archived: false }),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { ice: { contains: search } },
              { contact: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clients);
}

export async function POST(request: Request) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const { emails, ...fields } = (body ?? {}) as {
    emails?: unknown;
    [key: string]: unknown;
  };

  const validated = validateClient(fields);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const list = validateClientEmails(emails);
  if (!list.ok) {
    return NextResponse.json({ error: list.error }, { status: 400 });
  }

  // Two clients with the same name would be indistinguishable in every picker.
  const duplicate = await prisma.client.findFirst({
    where: { name: validated.value.name },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Un client porte déjà cette raison sociale." },
      { status: 409 }
    );
  }

  const client = await prisma.client.create({
    data: {
      ...validated.value,
      emails: list.value.length > 0 ? { create: list.value } : undefined,
    },
    include: { emails: true },
  });

  await logAudit({
    actorId: session.id,
    action: "CLIENT_CREATED",
    entity: "Client",
    entityId: client.id,
    metadata: { name: client.name, emails: list.value.length },
  });

  return NextResponse.json(client, { status: 201 });
}
