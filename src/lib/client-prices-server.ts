import "server-only";
import { prisma } from "./prisma";
import { toMoney } from "./money";
import { SAMPLE_TYPE_LABELS } from "./labels";
import { LAB_SERVICE_CATEGORY_LABELS, type LabServiceCategory } from "./lab-services";
import { buildCatalogueIndex, catalogueKey } from "./billing";
import { sortClientPriceRows, type ClientPriceRow } from "./client-prices";

/**
 * Lot 4H, H5 — a client's own prices as its fiche lists them, each with the
 * catalogue's price beside it. Called by the pages and the route of the
 * roles that see prices only (`BILLING_ROLES`, price-access.ts).
 */
export async function loadClientPriceRows(clientId: string): Promise<ClientPriceRow[]> {
  const [prices, services] = await Promise.all([
    prisma.clientPrice.findMany({
      // A price removed by hand stays as a memory for the reprise, never listed.
      where: { clientId, removedAt: null },
      select: {
        id: true,
        parameterId: true,
        labServiceId: true,
        unitPrice: true,
        origin: true,
        updatedAt: true,
        legacyModifiedAt: true,
        updatedBy: { select: { name: true } },
        parameter: { select: { name: true, category: true } },
        labService: { select: { name: true, category: true, unitPrice: true } },
      },
    }),
    prisma.labService.findMany({ select: { id: true, name: true, category: true, unitPrice: true, active: true } }),
  ]);
  // An analysis is billed as the catalogue service of its name and domain (`proposeLines`).
  const catalogue = buildCatalogueIndex(services.map((s) => ({ ...s, unitPrice: toMoney(s.unitPrice) })));
  const rows = prices.flatMap((price): ClientPriceRow[] => {
    const common = {
      id: price.id,
      parameterId: price.parameterId,
      labServiceId: price.labServiceId,
      unitPrice: toMoney(price.unitPrice),
      origin: price.origin,
      updatedAt: price.updatedAt.toISOString(),
      legacyModifiedAt: price.legacyModifiedAt?.toISOString() ?? null,
      updatedBy: price.updatedBy?.name ?? null,
    };
    if (price.parameter) {
      const entry = catalogue.get(catalogueKey(price.parameter.name, price.parameter.category));
      return [
        {
          ...common,
          kind: "ANALYSE",
          label: price.parameter.name,
          domain: SAMPLE_TYPE_LABELS[price.parameter.category],
          cataloguePrice: entry ? toMoney(entry.unitPrice) : null,
          billedServiceId: entry?.id ?? null,
        },
      ];
    }
    if (price.labService) {
      return [
        {
          ...common,
          kind: "PRESTATION",
          label: price.labService.name,
          domain: LAB_SERVICE_CATEGORY_LABELS[price.labService.category as LabServiceCategory] ?? price.labService.category,
          cataloguePrice: toMoney(price.labService.unitPrice),
          billedServiceId: null,
        },
      ];
    }
    return [];
  });
  return sortClientPriceRows(rows);
}
