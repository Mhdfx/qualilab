import { prisma } from "@/lib/prisma";

/**
 * Actions of the billing, report-amendment and portal slices (FACTURATION.md
 * §5, AMENDEMENT.md §2–3, PORTAIL.md §2). Write them through these constants
 * rather than retyping the strings: the journal (/admin/journal) labels each
 * of them, and a typo would show up there as a raw code.
 */
export const AUDIT_ACTIONS = {
  /** A draft invoice saved without a number. */
  INVOICE_DRAFT_CREATED: "INVOICE_DRAFT_CREATED",
  INVOICE_DRAFT_UPDATED: "INVOICE_DRAFT_UPDATED",
  INVOICE_DRAFT_DELETED: "INVOICE_DRAFT_DELETED",
  /** A number « FAC-AAAA-NNNN » drawn — metadata `{ number }`. */
  INVOICE_ISSUED: "INVOICE_ISSUED",
  /** Metadata `{ number, reason }`. */
  INVOICE_CANCELLED: "INVOICE_CANCELLED",
  /** Metadata `{ number, creditedNumber, total, reason }`. */
  CREDIT_NOTE_ISSUED: "CREDIT_NOTE_ISSUED",
  /** Metadata `{ number, amount, mode }`. */
  PAYMENT_RECORDED: "PAYMENT_RECORDED",
  /** Metadata `{ number, amount, mode, reason }`. */
  PAYMENT_DELETED: "PAYMENT_DELETED",
  /** « Rouvrir pour amendement » — metadata `{ number, reason }`. */
  REPORT_REOPENED: "REPORT_REOPENED",
  /** Amended report approved — metadata `{ number, version, note }`. */
  REPORT_AMENDED: "REPORT_AMENDED",
  /** Duplicate PDF printed — metadata `{ number }`. */
  REPORT_DUPLICATE: "REPORT_DUPLICATE",
  /** A CLIENT account opened the portal — metadata `{ clientId }`. */
  PORTAL_LOGIN: "PORTAL_LOGIN",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

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
