import "server-only";
import { prisma } from "./prisma";
import { SEND_BACK_ANSWERED_BY } from "./send-back";

/**
 * The newest « Résultats soumis à validation » of each sample, read in one
 * grouped query on the journal's (entity, entityId) index — for
 * `isCurrentSendBack`. Pass only the samples `maySendBack` keeps: a bench
 * list asks for a handful, never for the whole list.
 */
export async function lastSubmissionsOf(sampleIds: readonly string[]): Promise<Map<string, Date>> {
  const ids = [...new Set(sampleIds)];
  if (ids.length === 0) return new Map();
  const rows = await prisma.auditLog.groupBy({
    by: ["entityId"],
    where: { entity: "Sample", entityId: { in: ids }, action: SEND_BACK_ANSWERED_BY },
    _max: { createdAt: true },
  });
  const last = new Map<string, Date>();
  for (const row of rows) {
    if (row.entityId && row._max.createdAt) last.set(row.entityId, row._max.createdAt);
  }
  return last;
}
