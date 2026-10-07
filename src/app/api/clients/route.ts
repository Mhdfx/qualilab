import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";
import { findSimilarClients } from "@/lib/client-identity";

/**
 * The client base.
 *
 * Every circuit role may read it — a préleveur has to pick a client in the
 * field — but only the gestionnaire commercial and the admin may change it.
 * The stock module and the future portal have no business here. Archived
 * clients are hidden unless asked for, so the pickers stay short.
 */
export async function GET(request: Request) {
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
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
    // Phase 9: the préleveur picks the site from the client's list.
    include: {
      sites: { where: { active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
      // CLIENTS-FUSION.md §4 and §6: « client facturé de » and « fusionnée dans ».
      billedFor: { select: { id: true, name: true } },
      mergedInto: { select: { id: true, name: true } },
    },
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

  const { emails, confirmDuplicate, ...fields } = (body ?? {}) as {
    emails?: unknown;
    confirmDuplicate?: unknown;
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

  // A near-duplicate (same name under another spelling, same ICE, a typing
  // error away) is only a warning: the gestionnaire checks the list and
  // confirms « Ce n'est pas le même client » (CLIENTS-FUSION.md §5).
  if (confirmDuplicate !== true) {
    const candidates = await prisma.client.findMany({
      where: { archived: false },
      select: { id: true, name: true, ice: true },
    });
    const similar = findSimilarClients({ name: validated.value.name, ice: validated.value.ice }, candidates);
    if (similar.length > 0) {
      return NextResponse.json(
        { error: "Des clients très proches existent déjà : vérifiez avant de créer.", similar },
        { status: 409 }
      );
    }
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
    metadata: {
      name: client.name,
      emails: list.value.length,
      ...(confirmDuplicate === true ? { confirmedNotDuplicate: true } : {}),
    },
  });

  return NextResponse.json(client, { status: 201 });
}
