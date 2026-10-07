import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { isEmail } from "./client-validation";

/**
 * Moving a client's memory onto another client (CLIENTS-FUSION.md §2–3) —
 * the rules first written for the import of the sites (RETOUR-LABO-06-10.md
 * §5, `POST /api/admin/import/sites`), shared with « Fusionner avec… » and
 * « Rattacher comme site de… » so the three merge memories the same way:
 *
 *   - products: one per normalised label and client — a row whose label the
 *     target already has is merged into it (usage counts added, the
 *     target's regulation kept, a blank filled), the others move;
 *   - places: the same, per site and normalised label;
 *   - addresses: an address the target already has is not moved (kept on
 *     the source, or deleted); the others move, optionally onto a site,
 *     labelled with its name, boxes unticked;
 *   - the samples of a merged row follow the row it joined.
 *
 * Every function takes the caller's transaction and returns its counts;
 * `byClient` counts, per source client, the rows it gave (moved or merged).
 * Sources are processed in the order of `fromClientIds`: when two sources
 * bring the same label, the first one's row is kept.
 */

type Tx = Prisma.TransactionClient;

/** The rows a transfer moved as they are and merged into a row of the target. */
export type MemoryTransfer = { moved: number; merged: number; byClient: Map<string, number> };

export type EmailTransfer = {
  /** Addresses moved to the target. */
  moved: number;
  /** Addresses created from the source's record (`Client.email`). */
  created: number;
  /** Addresses the target already had, deleted on the source (`duplicates: "delete"`). */
  deleted: number;
  /** Per source client: moved + created. */
  byClient: Map<string, number>;
};

export type EmailTransferOptions = {
  /** The site each source's addresses go to; absent: their site is left as it is. */
  siteIdFor?: ((clientId: string) => string | null) | null;
  /**
   * The name that prefixes the label of each source's addresses (« Site —
   * own label », see `siteLabel`) and labels its record address; absent or
   * null: the label is left as it is.
   */
  label?: ((clientId: string) => string | null) | null;
  /** « Rapports » and « Alertes » unticked on every address moved or created. */
  untickBoxes?: boolean;
  /** An address the target already has: kept on the source (default) or deleted. */
  duplicates?: "keep" | "delete";
  /** Also add the source's record address (`Client.email`) when not in its list. */
  recordEmail?: boolean;
};

const zeroByClient = (ids: string[]) => new Map(ids.map((id) => [id, 0]));

function byClientOrder(ids: string[]) {
  const order = new Map(ids.map((id, i) => [id, i]));
  return <T extends { clientId: string }>(a: T, b: T) => order.get(a.clientId)! - order.get(b.clientId)!;
}

/**
 * The label of an address moved onto a site: the site's name first, so the
 * client fiche still tells the addresses apart (it does not show the site).
 */
export function siteLabel(siteName: string, label: string | null): string {
  const own = label?.trim();
  return (own && own !== siteName ? `${siteName} — ${own}` : siteName).slice(0, 191);
}

/**
 * A memory row merged into another is deleted; any sample still pointing at
 * it follows to the row it joined. Returns the samples repointed.
 */
export async function repointSamples(tx: Tx, field: "productId" | "placeId", merges: Map<string, string>): Promise<number> {
  const merged = [...merges.keys()];
  if (merged.length === 0) return 0;
  const samples = await tx.sample.findMany({
    where: field === "productId" ? { productId: { in: merged } } : { placeId: { in: merged } },
    select: { id: true, productId: true, placeId: true },
  });
  let count = 0;
  for (const sample of samples) {
    const target = merges.get((field === "productId" ? sample.productId : sample.placeId) ?? "");
    if (!target) continue;
    await tx.sample.update({ where: { id: sample.id }, data: field === "productId" ? { productId: target } : { placeId: target } });
    count += 1;
  }
  return count;
}

/** Products: one per label and client — merged into the target's when it has the label. */
export async function moveProducts(tx: Tx, fromClientIds: string[], toClientId: string): Promise<MemoryTransfer> {
  const result: MemoryTransfer = { moved: 0, merged: 0, byClient: zeroByClient(fromClientIds) };
  if (fromClientIds.length === 0) return result;
  const [targetProducts, sourceProducts] = [
    await tx.clientProduct.findMany({ where: { clientId: toClientId }, select: { id: true, normalizedLabel: true, regulationId: true } }),
    await tx.clientProduct.findMany({
      where: { clientId: { in: fromClientIds } },
      select: { id: true, clientId: true, normalizedLabel: true, usageCount: true, regulationId: true },
    }),
  ];
  const productByLabel = new Map(targetProducts.map((p) => [p.normalizedLabel, { id: p.id, regulationId: p.regulationId }]));
  const productMoves: string[] = [];
  const productMerges = new Map<string, string>(); // merged row → the row it joins
  const productAdds = new Map<string, { count: number; regulationId: string | null }>();
  for (const p of [...sourceProducts].sort(byClientOrder(fromClientIds))) {
    result.byClient.set(p.clientId, (result.byClient.get(p.clientId) ?? 0) + 1);
    const target = productByLabel.get(p.normalizedLabel);
    if (!target) {
      productMoves.push(p.id);
      productByLabel.set(p.normalizedLabel, { id: p.id, regulationId: p.regulationId });
      continue;
    }
    const add = productAdds.get(target.id) ?? { count: 0, regulationId: null };
    add.count += p.usageCount;
    // The regulation remembered for the product is kept; a merged row only fills a blank.
    if (!target.regulationId && p.regulationId) {
      target.regulationId = p.regulationId;
      add.regulationId = p.regulationId;
    }
    productAdds.set(target.id, add);
    productMerges.set(p.id, target.id);
  }
  if (productMerges.size > 0) {
    await repointSamples(tx, "productId", productMerges);
    await tx.clientProduct.deleteMany({ where: { id: { in: [...productMerges.keys()] } } });
  }
  if (productMoves.length > 0) await tx.clientProduct.updateMany({ where: { id: { in: productMoves } }, data: { clientId: toClientId } });
  for (const [id, add] of productAdds) {
    await tx.clientProduct.update({
      where: { id },
      data: { usageCount: { increment: add.count }, ...(add.regulationId ? { regulationId: add.regulationId } : {}) },
    });
  }
  result.moved = productMoves.length;
  result.merged = productMerges.size;
  return result;
}

/**
 * Places: merged with a place of the same label on the same site of the
 * target. `siteIdFor` puts each source's places onto that site of the target
 * (import of the sites, attach as site); null leaves each place on its own
 * site (merge: the sites were moved or merged first) — the target's places
 * with no site then match the source's places with no site.
 */
export async function movePlaces(
  tx: Tx,
  fromClientIds: string[],
  toClientId: string,
  siteIdFor: ((clientId: string) => string) | null
): Promise<MemoryTransfer> {
  const result: MemoryTransfer = { moved: 0, merged: 0, byClient: zeroByClient(fromClientIds) };
  if (fromClientIds.length === 0) return result;
  const siteIds = siteIdFor ? [...new Set(fromClientIds.map(siteIdFor))] : null;
  const [targetPlaces, sourcePlaces] = [
    await tx.clientPlace.findMany({
      where: siteIds ? { clientId: toClientId, siteId: { in: siteIds } } : { clientId: toClientId },
      select: { id: true, siteId: true, normalizedLabel: true },
    }),
    await tx.clientPlace.findMany({
      where: { clientId: { in: fromClientIds } },
      select: { id: true, clientId: true, siteId: true, normalizedLabel: true, usageCount: true },
    }),
  ];
  const placeByKey = new Map(targetPlaces.map((p) => [`${p.siteId ?? ""}|${p.normalizedLabel}`, p.id]));
  const placeMoves = new Map<string, string[]>(); // client → its rows moving
  const placeMerges = new Map<string, string>();
  const placeAdds = new Map<string, number>();
  for (const p of [...sourcePlaces].sort(byClientOrder(fromClientIds))) {
    result.byClient.set(p.clientId, (result.byClient.get(p.clientId) ?? 0) + 1);
    const siteId = siteIdFor ? siteIdFor(p.clientId) : p.siteId;
    const key = `${siteId ?? ""}|${p.normalizedLabel}`;
    const target = placeByKey.get(key);
    if (!target) {
      placeMoves.set(p.clientId, [...(placeMoves.get(p.clientId) ?? []), p.id]);
      placeByKey.set(key, p.id);
      continue;
    }
    placeAdds.set(target, (placeAdds.get(target) ?? 0) + p.usageCount);
    placeMerges.set(p.id, target);
  }
  if (placeMerges.size > 0) {
    await repointSamples(tx, "placeId", placeMerges);
    await tx.clientPlace.deleteMany({ where: { id: { in: [...placeMerges.keys()] } } });
  }
  for (const [clientId, placeIds] of placeMoves) {
    await tx.clientPlace.updateMany({
      where: { id: { in: placeIds } },
      data: siteIdFor ? { clientId: toClientId, siteId: siteIdFor(clientId) } : { clientId: toClientId },
    });
    result.moved += placeIds.length;
  }
  for (const [id, count] of placeAdds) await tx.clientPlace.update({ where: { id }, data: { usageCount: { increment: count } } });
  result.merged = placeMerges.size;
  return result;
}

/**
 * Addresses: those the target does not have yet move to it (see
 * `EmailTransferOptions`); an address it already has, case and spaces
 * ignored, stays on the source or is deleted.
 */
export async function moveEmails(
  tx: Tx,
  fromClientIds: string[],
  toClientId: string,
  options: EmailTransferOptions = {}
): Promise<EmailTransfer> {
  const result: EmailTransfer = { moved: 0, created: 0, deleted: 0, byClient: zeroByClient(fromClientIds) };
  if (fromClientIds.length === 0) return result;
  const { siteIdFor = null, label = null, untickBoxes = false, duplicates = "keep", recordEmail = false } = options;
  const boxes = untickBoxes ? { forReports: false, forAlerts: false } : {};
  const count = (clientId: string) => result.byClient.set(clientId, (result.byClient.get(clientId) ?? 0) + 1);

  const known = new Set(
    (await tx.clientEmail.findMany({ where: { clientId: toClientId }, select: { email: true } })).map((e) => e.email.trim().toLowerCase())
  );
  const sourceEmails = await tx.clientEmail.findMany({
    where: { clientId: { in: fromClientIds } },
    select: { id: true, clientId: true, email: true, label: true },
  });
  const duplicateIds: string[] = [];
  for (const e of [...sourceEmails].sort(byClientOrder(fromClientIds))) {
    const address = e.email.trim().toLowerCase();
    if (known.has(address)) {
      duplicateIds.push(e.id);
      continue;
    }
    known.add(address);
    const prefix = label ? label(e.clientId) : null;
    await tx.clientEmail.update({
      where: { id: e.id },
      data: {
        clientId: toClientId,
        ...(siteIdFor ? { siteId: siteIdFor(e.clientId) } : {}),
        ...(prefix ? { label: siteLabel(prefix, e.label) } : {}),
        ...boxes,
      },
    });
    result.moved += 1;
    count(e.clientId);
  }
  if (duplicates === "delete" && duplicateIds.length > 0) {
    result.deleted = (await tx.clientEmail.deleteMany({ where: { id: { in: duplicateIds } } })).count;
  }

  // The address on the client record itself, when it is not in its list.
  if (recordEmail) {
    const records = new Map(
      (await tx.client.findMany({ where: { id: { in: fromClientIds } }, select: { id: true, email: true } })).map((c) => [c.id, c.email])
    );
    for (const clientId of fromClientIds) {
      const address = records.get(clientId)?.trim().toLowerCase() ?? "";
      if (!address || !isEmail(address) || address.length > 191 || known.has(address)) continue;
      known.add(address);
      await tx.clientEmail.create({
        data: {
          clientId: toClientId,
          siteId: siteIdFor ? siteIdFor(clientId) : null,
          email: address,
          label: label ? label(clientId) : null,
          ...boxes,
        },
      });
      result.created += 1;
      count(clientId);
    }
  }
  return result;
}

/** The sources' own product types and analysis profiles belong to the target. */
export async function moveTypesAndProfiles(
  tx: Tx,
  fromClientIds: string[],
  toClientId: string
): Promise<{ productTypes: number; profiles: number }> {
  if (fromClientIds.length === 0) return { productTypes: 0, profiles: 0 };
  const productTypes = (await tx.productType.updateMany({ where: { clientId: { in: fromClientIds } }, data: { clientId: toClientId } })).count;
  const profiles = (await tx.analysisProfile.updateMany({ where: { clientId: { in: fromClientIds } }, data: { clientId: toClientId } })).count;
  return { productTypes, profiles };
}
