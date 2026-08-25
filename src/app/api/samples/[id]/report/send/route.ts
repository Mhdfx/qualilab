import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { sendReport } from "@/lib/report-dispatch";

/**
 * Sends — or resends — the report to the client.
 *
 * The gestionnaire commercial handles the client relationship, so a resend is
 * theirs to trigger; the admin can too. A resend never moves the sample
 * backwards, it only records another entry in the send journal.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("GESTIONNAIRE", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const result = await sendReport(id, session.id);

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  return NextResponse.json(result);
}
