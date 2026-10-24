import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { sendReportWithAlerts } from "@/lib/validation-server";

/**
 * Sends — or resends — the report to the client.
 *
 * The gestionnaire commercial handles the client relationship, so a resend is
 * theirs to trigger; the validator, the Direction and the admin can too
 * (`RESEND_REPORT_ROLES`). A resend never moves the sample backwards, it
 * only records another entry in the send journal.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  // The alerts ride along: any batch that failed (or was skipped for lack of
  // an address) at approval is retried here — already-sent ones are not
  // repeated, the claim on the sample sees to that. The série's send (plan
  // D3) goes through the same helper.
  const result = await sendReportWithAlerts(id, session.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  return NextResponse.json(result);
}
