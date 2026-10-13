import type { Prisma } from "@/generated/prisma/client";
import type { SampleStatus } from "@/generated/prisma/enums";
import type { TakeState } from "./bench-access";

/**
 * The sample as the take, the give-back and the results save read it —
 * under the row lock (`SELECT … FOR UPDATE`), inside their transaction.
 *
 * Every writer of `Sample.technicianId` (take, give-back, the implicit take
 * of a first result) and of `SampleParameter.technicianId` (programme,
 * « Corriger la fiche », give-back) locks the Sample row first, so they are
 * serialised: the first technician wins, the second reads the winner here.
 * The holder columns are read by the locking query itself, which always
 * sees the latest committed row (a plain read in the same transaction may
 * see an older snapshot).
 */
export type LockedTakeState = TakeState & {
  code: string;
  controlCode: string | null;
  /** The legacy per-parameter technicians of the line, each once. */
  parameterHolderIds: string[];
  /** What the bench reads the line with — compared by the results save. */
  unitCount: number;
  productTypeId: string | null;
};

type LockedRow = {
  status: SampleStatus;
  analysisBlocked: number | boolean | bigint;
  technicianId: string | null;
  code: string;
  controlCode: string | null;
  unitCount: number | bigint;
  productTypeId: string | null;
};

export async function lockTakeState(tx: Prisma.TransactionClient, sampleId: string): Promise<LockedTakeState | null> {
  const rows = await tx.$queryRaw<LockedRow[]>`
    SELECT \`status\`, \`analysisBlocked\`, \`technicianId\`, \`code\`, \`controlCode\`, \`unitCount\`, \`productTypeId\`
    FROM \`Sample\` WHERE \`id\` = ${sampleId} FOR UPDATE`;
  const row = rows[0];
  if (!row) return null;
  const legacy = await tx.sampleParameter.findMany({
    where: { sampleId, technicianId: { not: null } },
    select: { technicianId: true, technician: { select: { name: true } } },
  });
  const parameterHolderIds = [...new Set(legacy.map((parameter) => parameter.technicianId).filter((id): id is string => id !== null))];
  const holder = row.technicianId
    ? await tx.user.findUnique({ where: { id: row.technicianId }, select: { name: true } })
    : null;
  return {
    status: row.status,
    analysisBlocked: Number(row.analysisBlocked) === 1,
    technicianId: row.technicianId,
    holderName: holder?.name ?? legacy.find((parameter) => parameter.technician)?.technician?.name ?? null,
    heldByParameter: parameterHolderIds.length > 0,
    code: row.code,
    controlCode: row.controlCode,
    parameterHolderIds,
    unitCount: Number(row.unitCount),
    productTypeId: row.productTypeId,
  };
}
