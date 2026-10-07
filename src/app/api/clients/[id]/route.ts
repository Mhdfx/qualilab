import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";
import { findSimilarClients, sameClientName } from "@/lib/client-identity";

const LINK = { select: { id: true, name: true } } as const;

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
    include: {
      emails: { orderBy: { email: "asc" } },
      // CLIENTS-FUSION.md §2–4, §6: where an archived fiche went, the
      // principal client it is billed for, its billing clients (with the
      // sites billed to each) and the « Facturé à » of each of its sites.
      mergedInto: LINK,
      mergedFrom: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      billedFor: LINK,
      billingClients: {
        select: {
          id: true,
          name: true,
          archived: true,
          billedSites: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        },
        orderBy: { name: "asc" },
      },
      billedSites: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      sites: {
        select: { id: true, name: true, active: true, billingClient: LINK },
        orderBy: [{ active: "desc" }, { name: "asc" }],
      },
    },
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
    select: { id: true, name: true, mergedInto: LINK },
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

  const { archived, emails, confirmDuplicate, ...fields } = (body ?? {}) as {
    archived?: unknown;
    emails?: unknown;
    confirmDuplicate?: unknown;
    [key: string]: unknown;
  };

  // A fiche merged into another (or attached as one of its sites) is empty:
  // everything it had now lives on the kept record (CLIENTS-FUSION.md §2–3).
  // Reactivating it would recreate the duplicate the merge removed.
  if (archived === false && existing.mergedInto) {
    return NextResponse.json(
      {
        error: `Cette fiche a été regroupée avec « ${existing.mergedInto.name} » (fusion ou rattachement comme site) : travaillez sur « ${existing.mergedInto.name} » plutôt que de la réactiver.`,
      },
      { status: 409 }
    );
  }

  // Archiving is its own action and does not require the whole record.
  if (typeof archived === "boolean" && Object.keys(fields).length === 0) {
    // An archived billing client receives no more invoices: the sites billed
    // to it go back to their own client (CLIENTS-FUSION.md §4), so their
    // samples are not left billable to nobody.
    const { updated, sitesReleased } = await prisma.$transaction(async (tx) => {
      const sitesReleased = archived
        ? (await tx.site.updateMany({ where: { billingClientId: id }, data: { billingClientId: null } })).count
        : 0;
      const updated = await tx.client.update({
        where: { id },
        data: { archived },
        select: { id: true, name: true, archived: true },
      });
      return { updated, sitesReleased };
    });

    await logAudit({
      actorId: session.id,
      action: archived ? "CLIENT_ARCHIVED" : "CLIENT_RESTORED",
      entity: "Client",
      entityId: id,
      metadata: { name: updated.name, ...(sitesReleased > 0 ? { sitesReleased } : {}) },
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

  // A rename is checked like a creation (CLIENTS-FUSION.md §5): the exact
  // name of another client is refused, a near-duplicate asks for
  // confirmation. A change of case or accents only is not a rename.
  const renamed = !sameClientName(validated.value.name, existing.name);
  if (renamed) {
    const duplicate = await prisma.client.findFirst({
      where: { name: validated.value.name, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Un client porte déjà cette raison sociale." }, { status: 409 });
    }
    if (confirmDuplicate !== true) {
      const candidates = await prisma.client.findMany({
        where: { archived: false },
        select: { id: true, name: true, ice: true },
      });
      const similar = findSimilarClients({ id, name: validated.value.name, ice: validated.value.ice }, candidates);
      if (similar.length > 0) {
        return NextResponse.json(
          { error: "Des clients très proches existent déjà : vérifiez avant d'enregistrer.", similar },
          { status: 409 }
        );
      }
    }
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
      // form always submits the complete set. The form does not know an
      // address's site (set by the sites import, RETOUR-LABO-06-10.md §5 V5):
      // an address kept in the list keeps its site.
      const previous = await tx.clientEmail.findMany({
        where: { clientId: id, siteId: { not: null } },
        select: { email: true, siteId: true },
      });
      const siteOf = new Map(previous.map((entry) => [entry.email.toLowerCase(), entry.siteId]));
      await tx.clientEmail.deleteMany({ where: { clientId: id } });
      if (list.value.length > 0) {
        await tx.clientEmail.createMany({
          data: list.value.map((entry) => ({ ...entry, clientId: id, siteId: siteOf.get(entry.email) ?? null })),
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
    metadata: {
      name: updated.name,
      emails: list.value.length,
      ...(renamed ? { renamedFrom: existing.name } : {}),
      ...(renamed && confirmDuplicate === true ? { confirmedNotDuplicate: true } : {}),
    },
  });

  return NextResponse.json(updated);
}
