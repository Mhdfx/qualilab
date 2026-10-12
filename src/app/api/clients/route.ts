import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateClient, validateClientEmails } from "@/lib/client-validation";
import { findSimilarClients } from "@/lib/client-identity";
import { LOCK_RETRIES, isLockConflict, lockRetryPause } from "@/lib/billing";
import type { Prisma } from "@/generated/prisma/client";

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

  type Outcome = { client: Prisma.ClientGetPayload<{ include: { emails: true } }> } | { refusal: NextResponse };
  const createOnce = () =>
    prisma.$transaction(async (tx): Promise<Outcome> => {
      // Two clients with the same name would be indistinguishable in every
      // picker. Client.name has no unique index (the imported base predates
      // the rule), so the check is a locking read on the name (index
      // archived + name, case and accents ignored by the collation): two
      // requests creating at the same instant cannot both pass it.
      const duplicate = await tx.$queryRaw<{ id: string }[]>`
        SELECT \`id\` FROM \`Client\`
        WHERE \`archived\` IN (0, 1) AND \`name\` = ${validated.value.name}
        FOR UPDATE`;
      if (duplicate.length > 0) {
        return {
          refusal: NextResponse.json({ error: "Un client porte déjà cette raison sociale." }, { status: 409 }),
        };
      }

      // A near-duplicate (same name under another spelling, same ICE, a typing
      // error away) is only a warning: the gestionnaire checks the list and
      // confirms « Ce n'est pas le même client » (CLIENTS-FUSION.md §5).
      if (confirmDuplicate !== true) {
        const candidates = await tx.client.findMany({
          where: { archived: false },
          select: { id: true, name: true, ice: true },
        });
        const similar = findSimilarClients({ name: validated.value.name, ice: validated.value.ice }, candidates);
        if (similar.length > 0) {
          return {
            refusal: NextResponse.json(
              { error: "Des clients très proches existent déjà : vérifiez avant de créer.", similar },
              { status: 409 }
            ),
          };
        }
      }

      const client = await tx.client.create({
        data: {
          ...validated.value,
          emails: list.value.length > 0 ? { create: list.value } : undefined,
        },
        include: { emails: true },
      });
      return { client };
    });

  let outcome: Outcome | null = null;
  for (let attempt = 1; outcome === null; attempt += 1) {
    try {
      outcome = await createOnce();
    } catch (error) {
      // Two creations at the same instant: InnoDB rolls one back (the gap
      // locks of their reads deadlock). Nothing was written; it runs again,
      // and then sees the other's row if it carried the same name.
      if (!isLockConflict(error)) throw error;
      if (attempt >= LOCK_RETRIES) {
        return NextResponse.json(
          { error: "Une autre création de client était en cours. Rien n'a été enregistré : réessayez." },
          { status: 409 }
        );
      }
      await new Promise((resolve) => setTimeout(resolve, lockRetryPause(attempt)));
    }
  }
  if ("refusal" in outcome) return outcome.refusal;
  const { client } = outcome;

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
