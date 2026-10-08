import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { listDocumentReferences } from "@/lib/document-reference";
import { validateDocumentReferences } from "@/lib/document-reference-input";

/**
 * The cartouches of the quality documents (Réf / version / dates) — ADMIN
 * only. Saving here is what a new version of a form costs: no code.
 */
export async function GET() {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  return NextResponse.json(await listDocumentReferences());
}

export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // The dates are calendar dates, read as the UTC midnight of their day:
  // re-saving a row leaves its dates exactly as they were.
  const check = validateDocumentReferences(body);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
  const { items } = check;

  const before = await listDocumentReferences();

  await prisma.$transaction(
    items.map((item) =>
      prisma.documentReference.upsert({
        where: { docType: item.docType },
        create: item,
        update: { reference: item.reference, version: item.version, createdOn: item.createdOn, updatedOn: item.updatedOn },
      })
    )
  );

  const after = await listDocumentReferences();
  const changed = after
    .filter((row) => {
      const previous = before.find((b) => b.docType === row.docType);
      return JSON.stringify(previous) !== JSON.stringify(row);
    })
    .map((row) => row.docType);

  if (changed.length > 0) {
    await logAudit({
      actorId: session.id,
      action: "DOCUMENT_REFERENCE_UPDATED",
      entity: "DocumentReference",
      entityId: changed.join(","),
      metadata: {
        changed,
        before: before.filter((b) => changed.includes(b.docType)),
        after: after.filter((a) => changed.includes(a.docType)),
      },
    });
  }

  return NextResponse.json(after);
}
