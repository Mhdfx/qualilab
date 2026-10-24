import "server-only";
import { prisma } from "./prisma";
import { HOLDER_ACTIONS, currentTakeOver, type HolderRow, type TakeOver } from "./take-over";

/**
 * The take-over each listed sample's holder holds it by (`currentTakeOver`),
 * for the bench lists: one read of the journal's bench rows for the whole
 * list. A take-over never moves `assignedAt` (the start of the analyses):
 * « Pris par B · <time> » is dated by this row instead. Samples nobody holds
 * are not asked.
 */
export async function currentTakeOversOf(
  samples: readonly { id: string; technicianId: string | null }[]
): Promise<Map<string, TakeOver>> {
  const held = samples.filter((sample) => sample.technicianId !== null);
  if (held.length === 0) return new Map();
  const rows = await prisma.auditLog.findMany({
    where: { entity: "Sample", entityId: { in: [...new Set(held.map((sample) => sample.id))] }, action: { in: [...HOLDER_ACTIONS] } },
    select: { entityId: true, action: true, actorId: true, createdAt: true, metadata: true },
    // Oldest first: on a tie `currentTakeOver` keeps the last row, as the sheet reads it.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const bySample = new Map<string, HolderRow[]>();
  for (const { entityId, ...row } of rows) {
    if (!entityId) continue;
    const list = bySample.get(entityId);
    if (list) list.push(row);
    else bySample.set(entityId, [row]);
  }
  const takeOvers = new Map<string, TakeOver>();
  for (const sample of held) {
    const takeOver = currentTakeOver(bySample.get(sample.id) ?? [], sample.technicianId);
    if (takeOver) takeOvers.set(sample.id, takeOver);
  }
  return takeOvers;
}
