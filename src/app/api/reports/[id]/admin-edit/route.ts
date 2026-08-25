import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Administrator's correction of a validated report.
 *
 * ⚠️ **Deliberately not audited.** The client asked for this explicitly
 * (28/07) and confirmed on 18/08 that they do not want an internal log either.
 * We flagged the traceability trade-off in writing; this is their decision.
 *
 * It is kept in this one file, restricted to ADMIN and to the report's
 * editable text, so that removing the feature is deleting a route and a button
 * — nothing else in the system depends on it.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const report = await prisma.report.findUnique({
    where: { id },
    select: { id: true },
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

  const { conclusion } = (body ?? {}) as { conclusion?: unknown };

  if (typeof conclusion !== "string" || !conclusion.trim()) {
    return NextResponse.json(
      { error: "La conclusion ne peut pas être vide." },
      { status: 400 }
    );
  }

  const updated = await prisma.report.update({
    where: { id: report.id },
    data: { conclusion: conclusion.trim() },
    select: { id: true, number: true, conclusion: true },
  });

  // No logAudit() here — see the note above.
  return NextResponse.json(updated);
}
