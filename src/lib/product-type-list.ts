import type { Prisma, SampleType } from "@/generated/prisma/client";

/**
 * Which families of products `GET /api/product-types` lists — pure, so the
 * filters of RETOUR-LABO-16-10.md F1 / F5 are tested, not only read:
 *
 *   - by default the active families of the catalogue, plus the client's own
 *     when `clientId` is given;
 *   - `all` (the families' managers only — the route decides) adds the
 *     archived ones and every client's;
 *   - `natureId` keeps one type d'analyse;
 *   - `category` keeps the families whose type d'analyse is of that category
 *     **and those still « à préciser »** (no nature yet): an unclassified
 *     family may be of any category, and hiding it would make it unpickable
 *     on its own lines (LineEditor, DepositForm, « Corriger la fiche » ask for
 *     ALIMENTAIRE);
 *   - `q` narrows by name.
 */
export type ProductTypeListFilter = {
  all: boolean;
  clientId: string | null;
  natureId: string | null;
  category: SampleType | null;
  q: string | null;
};

export function productTypeListWhere({ all, clientId, natureId, category, q }: ProductTypeListFilter): Prisma.ProductTypeWhereInput {
  const and: Prisma.ProductTypeWhereInput[] = [
    ...(all ? [] : [clientId ? { OR: [{ clientId }, { clientId: null }] } : { clientId: null }]),
    ...(category ? [{ OR: [{ natureId: null }, { nature: { legacyType: category } }] }] : []),
  ];
  return {
    ...(all ? {} : { active: true }),
    ...(q ? { name: { contains: q } } : {}),
    ...(natureId ? { natureId } : {}),
    ...(and.length > 0 ? { AND: and } : {}),
  };
}
