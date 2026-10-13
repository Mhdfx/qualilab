import "server-only";
import { prisma } from "./prisma";
import { TIMELINE_ACTION_CODES, sampleTimeline, type TimelineEvent } from "./sample-timeline";

/** The most journal rows a parcours reads (the most recent ones). */
export const TIMELINE_ROWS = 100;

const ACTOR = { select: { name: true } } as const;

/**
 * Loads the « Parcours de l'échantillon » of one sample: its timestamps and
 * the journal's rows on the sample and on its report — through the
 * (entity, entityId) index, newest first, at most `TIMELINE_ROWS`, then
 * merged oldest first by `sampleTimeline`. For the validation page only
 * (VALIDATEUR, DIRECTION, ADMIN): never served to the préleveur.
 */
export async function sampleTimelineFor(
  sampleId: string
): Promise<{ events: TimelineEvent[]; truncated: boolean } | null> {
  const select = {
    id: true,
    action: true,
    createdAt: true,
    metadata: true,
    actor: ACTOR,
  } as const;
  const [sample, sampleRows] = await Promise.all([
    prisma.sample.findUnique({
      where: { id: sampleId },
      select: {
        sampledAt: true,
        receivedAt: true,
        receivedBy: ACTOR,
        programmedAt: true,
        programmedBy: ACTOR,
        assignedAt: true,
        technician: ACTOR,
        validatedAt: true,
        validatedBy: ACTOR,
        approvedAt: true,
        approvedBy: ACTOR,
        rejectedAt: true,
        rejectedBy: ACTOR,
        rejectionReason: true,
        cancelledAt: true,
        cancelledBy: ACTOR,
        cancelReason: true,
        // A deposit whose sampling time was not declared: no « Prélèvement » step.
        serie: { select: { samplingTimeDeclared: true } },
        report: { select: { id: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { entity: "Sample", entityId: sampleId, action: { in: TIMELINE_ACTION_CODES } },
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: TIMELINE_ROWS + 1,
    }),
  ]);
  if (!sample) return null;

  const reportRows = sample.report
    ? await prisma.auditLog.findMany({
        where: { entity: "Report", entityId: sample.report.id, action: { in: TIMELINE_ACTION_CODES } },
        select,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: TIMELINE_ROWS + 1,
      })
    : [];

  const rows = [...sampleRows, ...reportRows].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
  );
  const truncated = rows.length > TIMELINE_ROWS;
  return {
    events: sampleTimeline({ ...sample, samplingTimeDeclared: sample.serie.samplingTimeDeclared }, rows.slice(0, TIMELINE_ROWS)),
    truncated,
  };
}
