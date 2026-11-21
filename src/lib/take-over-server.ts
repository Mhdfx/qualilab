import "server-only";
import { prisma } from "./prisma";
import { HOLDER_ACTIONS, currentTakeOver, holderTakenAt, type HolderRow, type TakeOver } from "./take-over";

/** The journal's bench rows of these samples, oldest first, by sample. */
async function holderRowsOf(ids: readonly string[]): Promise<Map<string, HolderRow[]>> {
  const bySample = new Map<string, HolderRow[]>();
  if (ids.length === 0) return bySample;
  const rows = await prisma.auditLog.findMany({
    where: { entity: "Sample", entityId: { in: [...new Set(ids)] }, action: { in: [...HOLDER_ACTIONS] } },
    select: { entityId: true, action: true, actorId: true, createdAt: true, metadata: true },
    // Oldest first: on a tie `currentTakeOver` keeps the last row, as the sheet reads it.
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  for (const { entityId, ...row } of rows) {
    if (!entityId) continue;
    const list = bySample.get(entityId);
    if (list) list.push(row);
    else bySample.set(entityId, [row]);
  }
  return bySample;
}

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
  const takes = await holderTakesOf(samples.map((sample) => ({ ...sample, assignedAt: null })));
  const takeOvers = new Map<string, TakeOver>();
  for (const [id, take] of takes) if (take.takeOver) takeOvers.set(id, take.takeOver);
  return takeOvers;
}

export type HolderTake = {
  /** The take-over the holder holds it by, null when taken from « À prendre ». */
  takeOver: TakeOver | null;
  /** Since when the holder holds it (`holderTakenAt`): what « pris le … » says. */
  takenAt: Date | null;
};

/**
 * How each listed sample's holder holds it (`currentTakeOver`,
 * `holderTakenAt`): one read of the journal for the whole list. A sample
 * handed over by an administrator (J7) keeps `assignedAt`, the start of the
 * analyses, so its new holder's take is dated by the journal (review of lot
 * 5A). Samples nobody holds are not asked.
 */
export async function holderTakesOf(
  samples: readonly { id: string; technicianId: string | null; assignedAt: Date | null }[]
): Promise<Map<string, HolderTake>> {
  const held = samples.filter((sample) => sample.technicianId !== null);
  const takes = new Map<string, HolderTake>();
  if (held.length === 0) return takes;
  const bySample = await holderRowsOf(held.map((sample) => sample.id));
  for (const sample of held) {
    const rows = bySample.get(sample.id) ?? [];
    takes.set(sample.id, {
      takeOver: currentTakeOver(rows, sample.technicianId),
      takenAt: holderTakenAt(rows, sample.technicianId, sample.assignedAt),
    });
  }
  return takes;
}

/** Since when one sample's holder holds it (`holderTakenAt`) — the sheets that show a single sample. */
export async function holderTakenAtOf(sample: {
  id: string;
  technicianId: string | null;
  assignedAt: Date | null;
}): Promise<Date | null> {
  if (!sample.technicianId) return null;
  return (await holderTakesOf([sample])).get(sample.id)?.takenAt ?? sample.assignedAt;
}
