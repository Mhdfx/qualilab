import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import {
  emailSiteChanges,
  emailSiteIds,
  emailSitesRefusal,
  validateClient,
  validateClientEmails,
  type EmailSiteChange,
} from "@/lib/client-validation";
import { findSimilarClients, sameClientName } from "@/lib/client-identity";
import { LOCK_RETRIES, isLockConflict, lockRetryPause } from "@/lib/billing";
import { toCompleteAfterSave } from "@/lib/client-completion";

const LINK = { select: { id: true, name: true } } as const;

/** Another client took the new name meanwhile: rolls the save back, then the 409. */
class NameTaken extends Error {}

/** An address given a site that is not this client's (H3): rolls the save back, then the 400. */
class SiteRefused extends Error {}

/**
 * A client record: read, update, archive.
 *
 * Managing clients belongs to the gestionnaire commercial and the admin
 * (the reception and the préleveur only create one, POST /api/clients). A
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
    select: { id: true, name: true, toComplete: true, mergedInto: LINK },
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

  // H3 (Q45): each row may carry the site its address belongs to.
  const list = validateClientEmails(emails, { sites: true });
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

  // « À compléter » (RETOUR-LABO-16-10.md E3): the whole fiche saved by the
  // gestionnaire or the admin is the completion — an archiving alone (above)
  // never clears it.
  const completion = toCompleteAfterSave(existing.toComplete, true);

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
        toComplete: completion.toComplete,
        ...(typeof archived === "boolean" ? { archived } : {}),
      },
    });

    let siteChanges: EmailSiteChange[] = [];
    if (emails !== undefined) {
      // The list is replaced wholesale: simpler than diffing, and the client
      // form always submits the complete set. Since H3 (Q45) the form sends
      // each address's site (« Tout le client » / « Site : X »), checked
      // against this client's own sites; a row without `siteId` (an older
      // screen) keeps its address's previous site, as before (D-04). Who
      // receives what stays `src/lib/email-recipients.ts`.
      const [previous, sites] = await Promise.all([
        tx.clientEmail.findMany({ where: { clientId: id }, select: { email: true, siteId: true } }),
        tx.site.findMany({ where: { clientId: id }, select: { id: true, name: true, active: true } }),
      ]);
      const siteOf = new Map(previous.map((entry) => [entry.email.toLowerCase(), entry.siteId]));
      const refused = emailSitesRefusal(list.value, sites, siteOf);
      if (refused) throw new SiteRefused(refused);
      const siteIds = emailSiteIds(list.value, siteOf);
      // For the journal: the addresses whose site changed, a new one given a site included.
      siteChanges = emailSiteChanges(list.value, siteIds, siteOf, sites);
      await tx.clientEmail.deleteMany({ where: { clientId: id } });
      if (list.value.length > 0) {
        await tx.clientEmail.createMany({
          data: list.value.map(({ email, label, forReports, forAlerts }, index) => ({
            email,
            label,
            forReports,
            forAlerts,
            clientId: id,
            siteId: siteIds[index],
          })),
        });
      }
    }

    return { client, siteChanges };
  });

  let saved: Awaited<ReturnType<typeof saveOnce>> | null = null;
  for (let attempt = 1; saved === null; attempt += 1) {
    try {
      saved = await saveOnce();
    } catch (error) {
      if (error instanceof NameTaken) {
        return NextResponse.json({ error: "Un client porte déjà cette raison sociale." }, { status: 409 });
      }
      if (error instanceof SiteRefused) {
        return NextResponse.json({ error: error.message }, { status: 400 });
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

  const { client: updated, siteChanges } = saved;
  await logAudit({
    actorId: session.id,
    action: "CLIENT_UPDATED",
    entity: "Client",
    entityId: id,
    metadata: {
      name: updated.name,
      emails: list.value.length,
      // H3: who now receives a site's mail only (or every site's) — D-04.
      ...(siteChanges.length > 0 ? { emailSites: siteChanges } : {}),
      ...(renamed ? { renamedFrom: existing.name } : {}),
      ...(renamed && confirmDuplicate === true ? { confirmedNotDuplicate: true } : {}),
      ...(completion.completed ? { completed: true } : {}),
    },
  });

  return NextResponse.json(updated);
}
