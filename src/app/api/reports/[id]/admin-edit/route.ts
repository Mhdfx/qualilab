import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { amendedNumber } from "@/lib/report-amendment";
import { readConclusionEdit } from "@/lib/report-actions";

/**
 * Administrator's correction of a validated report.
 *
 * ⚠️ **Deliberately not audited.** The client asked for this explicitly
 * (28/07) and confirmed on 18/08 that they do not want an internal log either.
 * We flagged the traceability trade-off in writing; this is their decision.
 *
 * It is kept in this one file, restricted to ADMIN and to the report's
 * editable text, so that removing the feature is deleting a route and a button
 * (« Modifier la conclusion », `ConclusionEditDialog`) — nothing else in the
 * system depends on it. The body's rules (length cap, refusal during an
 * amendment) are `readConclusionEdit` in `src/lib/report-actions.ts`.
 */

/** The text to prefill the dialog with, and the printed number of the version in force. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const report = await prisma.report.findUnique({
    where: { id },
    select: { number: true, version: true, conclusion: true, amendmentPending: true },
  });
  if (!report) {
    return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  return NextResponse.json({
    number: amendedNumber(report.number, report.version),
    conclusion: report.conclusion ?? "",
    amendmentPending: report.amendmentPending,
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true, amendmentPending: true },
  });

  if (!report) {
    return NextResponse.json({ error: "Rapport introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // While an amendment is pending the approval recomputes the conclusion
  // (`amendReportFor`): an edit made now would be silently dropped.
  const edit = readConclusionEdit(body, report.amendmentPending);
  if (!edit.ok) {
    return NextResponse.json({ error: edit.error }, { status: edit.status });
  }

  // Guarded write: a reopen racing this edit leaves the report untouched.
  const written = await prisma.report.updateMany({
    where: { id: report.id, amendmentPending: false },
    data: { conclusion: edit.conclusion },
  });
  if (written.count === 0) {
    const refused = readConclusionEdit(body, true);
    return NextResponse.json({ error: refused.ok ? "Rapport introuvable." : refused.error }, { status: 409 });
  }

  const updated = await prisma.report.findUnique({
    where: { id: report.id },
    select: { id: true, number: true, version: true, conclusion: true },
  });

  // No audit entry here — see the note above.
  return NextResponse.json(
    updated
      ? { id: updated.id, number: amendedNumber(updated.number, updated.version), conclusion: updated.conclusion }
      : { id: report.id, conclusion: edit.conclusion }
  );
}
