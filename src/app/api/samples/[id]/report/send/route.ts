import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportSendRefusal, sendsReports } from "@/lib/report-actions";
import { sendReportWithAlerts } from "@/lib/validation-server";

/**
 * Sends — or resends — the report to the client.
 *
 * The validator, the Direction and the admin send it (`SEND_REPORT_ROLES`,
 * the answer of 28/10 to the re-ask 2.16 (b)); the gestionnaire commercial
 * neither sends nor resends since lot 4A (K8, Q9 of 04/11: refused here by
 * `reportSendRefusal`, 403), and resends a version already sent only if the
 * switch `COMMERCIAL_RESENDS_REPORTS` is turned back on. The guard admits
 * the four (`RESEND_REPORT_ROLES`). A resend never moves the sample
 * backwards, it only records another entry in the send journal.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "VALIDATEUR", "DIRECTION", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  if (!sendsReports(session.role)) {
    const report = await prisma.report.findUnique({
      where: { sampleId: id },
      select: { sentAt: true, amendedAt: true, amendmentPending: true },
    });
    const refusal = reportSendRefusal(session.role, report);
    if (refusal) return NextResponse.json({ error: refusal }, { status: 403 });
  }
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
