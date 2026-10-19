import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";
import { findSimilarClients, sameClientName } from "@/lib/client-identity";
import { LOCK_RETRIES, isLockConflict, lockRetryPause } from "@/lib/billing";

const LINK = { select: { id: true, name: true } } as const;

/** Another client took the new name meanwhile: rolls the save back, then the 409. */
class NameTaken extends Error {}

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

  const saveOnce = () => prisma.$transaction(async (tx) => {
    if (renamed) {
      // The check above, again under a locking read on the name (index
      // archived + name, as at creation): a creation or another rename to
      // the same name at the same instant cannot both pass it.
      const clash = await tx.$queryRaw<{ id: string }[]>`
        SELECT \`id\` FROM \`Client\`
        WHERE \`archived\` IN (0, 1) AND \`name\` = ${validated.value.name} AND \`id\` <> ${id}
        FOR UPDATE`;
      if (clash.length > 0) throw new NameTaken();
    }
    const client = await tx.client.update({
      where: { id },
      data: {
        ...validated.value,
        ...(typeof archived === "boolean" ? { archived } : {}),
      },
    });

    if (emails !== undefined) {
      // The list is replaced wholesale: simpler than diffing, and the client
      // form always submits the complete set. The form shows an address's
      // site but never sends it (set by the sites import, RETOUR-LABO-06-10.md
      // §5 V5): an address kept in the list keeps its site (D-04).
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

  let updated: Awaited<ReturnType<typeof saveOnce>> | null = null;
  for (let attempt = 1; updated === null; attempt += 1) {
    try {
      updated = await saveOnce();
    } catch (error) {
      if (error instanceof NameTaken) {
        return NextResponse.json({ error: "Un client porte déjà cette raison sociale." }, { status: 409 });
      }
      // Two writes on the same name at the same instant: InnoDB rolls one
      // back (their gap locks deadlock). Nothing was written; it runs again
      // and then meets the other's name.
      if (!isLockConflict(error)) throw error;
      if (attempt >= LOCK_RETRIES) {
        return NextResponse.json(
          { error: "Une autre modification de client était en cours. Rien n'a été enregistré : réessayez." },
          { status: 409 }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, lockRetryPause(attempt)));
    }
  }

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
