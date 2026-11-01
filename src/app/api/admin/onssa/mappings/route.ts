import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { onssaColumn } from "@/lib/onssa-canevas";
import { ONSSA_MAPPING_MESSAGES, validateMappingBatch } from "@/lib/onssa-mapping";

/** How many changes the journal entry names one by one (the counts are always complete). */
const JOURNAL_DETAIL = 60;

/**
 * Lot 3E, N2 — saves correspondences of the ONSSA report in one transaction:
 * the group of families (`ProductType.onssaGroupId`) and of types d'analyse
 * (`AnalysisNature.onssaGroupId`), the canevas column of parameters
 * (`AnalysisParameter.onssaColumn`); null = « non déclaré ». A new link
 * must name an active group; a row that does not exist refuses the whole
 * save. Administrator only; journalled ONSSA_MAPPING_UPDATED, before /
 * after in clear.
 */
export async function PATCH(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: ONSSA_MAPPING_MESSAGES.invalid }, { status: 400 });
  }
  const checked = validateMappingBatch(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { productTypes, natures, parameters } = checked.value;

  const [groups, types, natureRows, parameterRows] = await Promise.all([
    prisma.onssaProductGroup.findMany({ select: { id: true, name: true, active: true } }),
    productTypes.length
      ? prisma.productType.findMany({
          where: { id: { in: productTypes.map((link) => link.id) } },
          select: { id: true, name: true, onssaGroupId: true },
        })
      : [],
    natures.length
      ? prisma.analysisNature.findMany({
          where: { id: { in: natures.map((link) => link.id) } },
          select: { id: true, label: true, onssaGroupId: true },
        })
      : [],
    parameters.length
      ? prisma.analysisParameter.findMany({
          where: { id: { in: parameters.map((link) => link.id) } },
          select: { id: true, name: true, onssaColumn: true },
        })
      : [],
  ]);
  const groupById = new Map(groups.map((group) => [group.id, group]));
  if (types.length !== productTypes.length || natureRows.length !== natures.length || parameterRows.length !== parameters.length) {
    return NextResponse.json({ error: "Une famille, un type d'analyse ou un paramètre n'existe plus. Rechargez la page." }, { status: 409 });
  }

  const groupName = (id: string | null) => (id ? (groupById.get(id)?.name ?? id) : "non déclaré");
  const columnName = (key: string | null) => (key ? (onssaColumn(key)?.label ?? key) : "non déclaré");
  const typeById = new Map(types.map((row) => [row.id, row]));
  const natureById = new Map(natureRows.map((row) => [row.id, row]));
  const parameterById = new Map(parameterRows.map((row) => [row.id, row]));
  const typeChanges = productTypes.filter((link) => typeById.get(link.id)!.onssaGroupId !== link.groupId);
  const natureChanges = natures.filter((link) => natureById.get(link.id)!.onssaGroupId !== link.groupId);
  const parameterChanges = parameters.filter((link) => parameterById.get(link.id)!.onssaColumn !== link.column);
  const total = typeChanges.length + natureChanges.length + parameterChanges.length;
  if (total === 0) return NextResponse.json({ changed: 0 });
  // A new link names an active group (an archived one keeps its old links).
  if ([...typeChanges, ...natureChanges].some((link) => link.groupId && !groupById.get(link.groupId)?.active)) {
    return NextResponse.json({ error: ONSSA_MAPPING_MESSAGES.groupUnknown }, { status: 400 });
  }

  try {
    // Grouped by target value: one UPDATE per value, not one per row.
    const byValue = <T extends { id: string }>(list: T[], value: (item: T) => string | null) => {
      const map = new Map<string | null, string[]>();
      for (const item of list) map.set(value(item), [...(map.get(value(item)) ?? []), item.id]);
      return [...map.entries()];
    };
    await prisma.$transaction([
      ...byValue(typeChanges, (link) => link.groupId).map(([groupId, ids]) =>
        prisma.productType.updateMany({ where: { id: { in: ids } }, data: { onssaGroupId: groupId } })
      ),
      ...byValue(natureChanges, (link) => link.groupId).map(([groupId, ids]) =>
        prisma.analysisNature.updateMany({ where: { id: { in: ids } }, data: { onssaGroupId: groupId } })
      ),
      ...byValue(parameterChanges, (link) => link.column).map(([column, ids]) =>
        prisma.analysisParameter.updateMany({ where: { id: { in: ids } }, data: { onssaColumn: column } })
      ),
    ]);
  } catch (error) {
    console.error("[admin/onssa/mappings] save failed", error);
    return NextResponse.json({ error: "Les correspondances n'ont pas pu être enregistrées. Réessayez." }, { status: 500 });
  }

  const details = [
    ...typeChanges.map(
      (link) => `Famille « ${typeById.get(link.id)!.name} » : ${groupName(typeById.get(link.id)!.onssaGroupId)} → ${groupName(link.groupId)}`
    ),
    ...natureChanges.map(
      (link) =>
        `Type d'analyse « ${natureById.get(link.id)!.label} » : ${groupName(natureById.get(link.id)!.onssaGroupId)} → ${groupName(link.groupId)}`
    ),
    ...parameterChanges.map(
      (link) =>
        `Paramètre « ${parameterById.get(link.id)!.name} » : ${columnName(parameterById.get(link.id)!.onssaColumn)} → ${columnName(link.column)}`
    ),
  ];
  await logAudit({
    actorId: session.id,
    action: "ONSSA_MAPPING_UPDATED",
    entity: "OnssaMapping",
    metadata: {
      familles: typeChanges.length,
      typesAnalyse: natureChanges.length,
      parametres: parameterChanges.length,
      details: details.slice(0, JOURNAL_DETAIL),
      ...(details.length > JOURNAL_DETAIL ? { autres: details.length - JOURNAL_DETAIL } : {}),
    },
  });

  return NextResponse.json({ changed: total });
}
