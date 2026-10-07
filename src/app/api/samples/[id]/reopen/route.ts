import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { reopenForAmendment } from "@/lib/report-dispatch";

/**
 * « Rouvrir pour amendement » (AMENDEMENT.md §2.1) — ADMIN only, on an
 * approved report (`VALIDE` or `RAPPORT_ENVOYE`), with a mandatory reason
 * printed on the amended report.
 *
 * The sample returns to `RESULTATS_SAISIS`, both signatures are cleared, the
 * version in force is frozen (« reconstituée » for a report issued before
 * versions existed) and the report notes « amendement en cours ». Then the
 * usual double validation; the approval issues « RAP-…-A1 ». Journal:
 * REPORT_REOPENED (written by `reopenForAmendment`).
 *
 * Body: `{ reason: string }`.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const { reason } = (body ?? {}) as { reason?: unknown };

  const outcome = await reopenForAmendment(id, { id: session.id, role: session.role }, reason);
  if (!outcome.ok) {
    return NextResponse.json({ error: outcome.error }, { status: outcome.status });
  }

  return NextResponse.json({
    status: "RESULTATS_SAISIS",
    number: outcome.number,
    version: outcome.version,
    frozen: outcome.frozen,
  });
}
