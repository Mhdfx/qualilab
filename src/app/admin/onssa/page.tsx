import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parameterProposals } from "@/lib/onssa-mapping";
import { PageHeader } from "@/components/ui/PageHeader";
import { OnssaMappingsManager } from "@/components/admin/OnssaMappingsManager";

export const metadata = { title: "Correspondances ONSSA" };

/**
 * Lot 3E, N2 — the correspondences of the ONSSA monthly report
 * (RETOUR-LABO-28-10.md §5): the product groups (a proposed list until the
 * laboratory sends its own, R-22), the group of each type d'analyse and
 * family, the canevas column of each parameter — « non déclaré » by
 * default, proposed from the names and aliases. Administrator only.
 *
 * The archived families and types d'analyse that still carry samples are
 * listed too, labelled « archivée » / « archivé »: the report counts a
 * sample whatever its family's state (after a reprise or a split, a sample
 * of the month can name an archived family), so it must be classable here.
 */
export default async function OnssaMappingsPage() {
  await requireRole("ADMIN");

  const [groups, natures, productTypes, parameters] = await Promise.all([
    prisma.onssaProductGroup.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, domain: true, sortOrder: true, active: true },
    }),
    prisma.analysisNature.findMany({
      where: { OR: [{ active: true }, { samples: { some: {} } }] },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { id: true, label: true, onssaGroupId: true, active: true },
    }),
    prisma.productType.findMany({
      where: { OR: [{ active: true }, { samples: { some: {} } }] },
      orderBy: { name: "asc" },
      select: { id: true, name: true, natureId: true, onssaGroupId: true, clientId: true, active: true },
    }),
    prisma.analysisParameter.findMany({
      orderBy: [{ category: "asc" }, { name: "asc" }],
      select: { id: true, name: true, category: true, family: true, aliases: true, onssaColumn: true },
    }),
  ]);
  const proposals = new Map(parameterProposals(parameters).map((link) => [link.id, link.column]));

  return (
    <div>
      <PageHeader
        badge="Configuration"
        title="Correspondances ONSSA"
        subtitle="Ce que le rapport mensuel d'activité ONSSA compte : les groupes de produits, le groupe de chaque type d'analyse et de chaque famille, la colonne du canevas de chaque paramètre. Sans correspondance, une analyse n'est pas déclarée et l'écran du rapport la liste."
      />
      <OnssaMappingsManager
        groups={groups}
        natures={natures}
        productTypes={productTypes.map(({ clientId, ...type }) => ({ ...type, clientOwn: clientId !== null }))}
        parameters={parameters.map((parameter) => ({
          id: parameter.id,
          name: parameter.name,
          category: parameter.category,
          family: parameter.family,
          onssaColumn: parameter.onssaColumn,
          proposal: proposals.get(parameter.id) ?? null,
        }))}
      />
    </div>
  );
}
