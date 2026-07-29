import { prisma } from "@/lib/prisma";

/**
 * Traceability helper — call from every mutation.
 *
 * The lab must be able to answer "who did what, and when" on any record, so
 * writing the audit entry is part of the operation, not an optional extra.
 * Auditing must never break the business action: failures are logged, swallowed.
 */
export async function logAudit(params: {
  actorId: string | null;
  action: string;
  entity: string;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: params.actorId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.error("[audit] failed to record entry", {
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      error,
    });
  }
}
