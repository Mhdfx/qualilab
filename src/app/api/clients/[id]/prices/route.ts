import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";
import { clientPriceKey, parseClientPriceInput } from "@/lib/client-prices";
import { loadClientPriceRows } from "@/lib/client-prices-server";

/**
 * Lot 4H, H5 (RETOUR-LABO-04-11.md §5, R-4 « Oui ») — the prices proper to
 * one client: read, set, removed by the roles that see prices and have a
 * screen for them (`BILLING_ROLES`, price-access.ts): the gestionnaire
 * commercial and the administrator on the fiche client, the comptabilité on
 * its page and in the invoice form. The Direction sees prices by the rule
 * but has no client nor invoice screen — its guards stay the validateur's
 * (direction-guards.test.ts); hypothèse, à confirmer par C-8 (RETOUR-LABO-04-11.md §7) :
 * ceux qui les lisent les corrigent aussi.
 *
 *   GET                       → the client's prices (`ClientPriceRow[]`)
 *   PUT { parameterId | labServiceId, unitPrice }
 *                             → sets one price (origin SAISIE: a later
 *                               reprise never overwrites it)
 *   DELETE ?prix=<id>         → removes one: the catalogue's price applies again.
 *                               A price that came from the old software
 *                               (`legacyPriceId`) is not deleted but marked
 *                               `removedAt`: the reprise remembers the
 *                               decision and never brings it back (every
 *                               reader ignores such a row; a price typed
 *                               again for the same item clears the mark)
 *
 * Every change is journalled with the price before and after. An archived
 * client (merged, attached as a site) keeps its prices on record but takes
 * no new one: its prices moved to the kept fiche with its invoices.
 */

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN", "GESTIONNAIRE");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  return NextResponse.json(await loadClientPriceRows(id));
}

export async function PUT(request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN", "GESTIONNAIRE");
  if (session instanceof NextResponse) return session;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = parseClientPriceInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { target, unitPrice } = parsed.value;

  const [client, parameter, service] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { id: true, name: true, archived: true } }),
    target.parameterId ? prisma.analysisParameter.findUnique({ where: { id: target.parameterId }, select: { id: true, name: true } }) : null,
    target.labServiceId ? prisma.labService.findUnique({ where: { id: target.labServiceId }, select: { id: true, name: true } }) : null,
  ]);
  if (!client) return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
  if (client.archived) {
    return NextResponse.json({ error: "Client archivé : ses prix se corrigent sur la fiche du client conservé." }, { status: 409 });
  }
  const item = parameter ?? service;
  if (!item) {
    return NextResponse.json({ error: target.parameterId ? "Analyse introuvable." : "Prestation introuvable." }, { status: 404 });
  }

  const itemKey = clientPriceKey(target);
  const before = await prisma.clientPrice.findUnique({
    where: { clientId_itemKey: { clientId: id, itemKey } },
    select: { unitPrice: true, origin: true, removedAt: true },
  });
  const saved = await prisma.clientPrice.upsert({
    where: { clientId_itemKey: { clientId: id, itemKey } },
    create: {
      clientId: id,
      parameterId: target.parameterId ?? null,
      labServiceId: target.labServiceId ?? null,
      itemKey,
      unitPrice,
      origin: "SAISIE",
      updatedById: session.id,
    },
    // Typed by hand: the reprise will not overwrite it any more (and a price
    // removed earlier comes back as this one).
    update: { unitPrice, origin: "SAISIE", updatedById: session.id, removedAt: null },
    select: { id: true },
  });

  await logAudit({
    actorId: session.id,
    action: "CLIENT_PRICE_SET",
    entity: "Client",
    entityId: id,
    metadata: {
      client: client.name,
      priceId: saved.id,
      item: item.name,
      kind: parameter ? "analyse" : "prestation",
      before: before && !before.removedAt ? { unitPrice: toMoney(before.unitPrice), origin: before.origin } : null,
      after: { unitPrice, origin: "SAISIE" },
    },
  });
  return NextResponse.json(await loadClientPriceRows(id));
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await requireApiRole("COMPTABLE", "ADMIN", "GESTIONNAIRE");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const priceId = new URL(request.url).searchParams.get("prix")?.trim();
  if (!priceId) return NextResponse.json({ error: "Prix à retirer manquant." }, { status: 400 });

  const price = await prisma.clientPrice.findFirst({
    where: { id: priceId, clientId: id, removedAt: null },
    select: {
      id: true,
      unitPrice: true,
      origin: true,
      legacyPriceId: true,
      client: { select: { name: true, archived: true } },
      parameter: { select: { name: true } },
      labService: { select: { name: true } },
    },
  });
  if (!price) return NextResponse.json({ error: "Ce prix n'existe plus : la liste a été rechargée." }, { status: 404 });
  if (price.client.archived) {
    return NextResponse.json({ error: "Client archivé : ses prix se corrigent sur la fiche du client conservé." }, { status: 409 });
  }
  // A price of the old software: kept as the memory of the removal, so the
  // next « Importer les prix clients » leaves it out (`keptRemoved`).
  const remembered = price.legacyPriceId !== null;
  if (remembered) {
    await prisma.clientPrice.update({ where: { id: price.id }, data: { removedAt: new Date(), updatedById: session.id } });
  } else {
    await prisma.clientPrice.delete({ where: { id: price.id } });
  }
  await logAudit({
    actorId: session.id,
    action: "CLIENT_PRICE_DELETED",
    entity: "Client",
    entityId: id,
    metadata: {
      client: price.client.name,
      priceId: price.id,
      item: price.parameter?.name ?? price.labService?.name ?? null,
      kind: price.parameter ? "analyse" : "prestation",
      before: { unitPrice: toMoney(price.unitPrice), origin: price.origin },
      // The reprise will not bring it back.
      remembered,
    },
  });
  return NextResponse.json(await loadClientPriceRows(id));
}
