import "server-only";
import { prisma } from "./prisma";
import { parameterKey } from "./criteria-import";

/**
 * Matching a germ's label to the catalogue: the parameter's name or one of
 * its aliases (one per line), compared through the same key the workbook
 * parser uses (mass suffix dropped, « de/des » folded, accents ignored).
 */
export type ParameterRef = { id: string; name: string; category: "ALIMENTAIRE" | "EAU" | "AMBIANCE"; unit: string | null };

export async function loadParameterIndex(category: ParameterRef["category"] = "ALIMENTAIRE"): Promise<Map<string, ParameterRef>> {
  // The workbook is food microbiology: a surface « Levures » must not catch it.
  const parameters = await prisma.analysisParameter.findMany({
    where: { category },
    select: { id: true, name: true, category: true, unit: true, aliases: true },
  });
  const index = new Map<string, ParameterRef>();
  for (const p of parameters) {
    const ref: ParameterRef = { id: p.id, name: p.name, category: p.category, unit: p.unit };
    index.set(parameterKey(p.name).key, ref);
    for (const alias of (p.aliases ?? "").split("\n")) {
      const key = parameterKey(alias).key;
      if (key && !index.has(key)) index.set(key, ref);
    }
  }
  return index;
}
