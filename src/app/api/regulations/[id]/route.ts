import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateRegulation } from "@/lib/regulation";

/**
 * Editing or archiving a regulation. An issued report keeps the text frozen
 * at its approval (`Report.regulation`), so nothing here changes the past.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const existing = await prisma.regulation.findUnique({
    where: { id },
    select: { id: true, title: true, text: true, active: true, sortOrder: true },
  });
  if (!existing) return NextResponse.json({ error: "Réglementation introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const checked = validateRegulation({
    title: input.title ?? existing.title,
    text: input.text ?? existing.text,
    active: input.active ?? existing.active,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  });
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const clash = await prisma.regulation.findFirst({
    where: { normalizedTitle: checked.value.normalizedTitle, id: { not: id } },
    select: { id: true },
  });
  if (clash) return NextResponse.json({ error: "Une autre réglementation porte déjà ce nom." }, { status: 409 });

  const updated = await prisma.regulation.update({
    where: { id },
    data: checked.value,
    select: { id: true, title: true, text: true, active: true, sortOrder: true },
  });
  await logAudit({
    actorId: session.id,
    action: "REGULATION_UPDATED",
    entity: "Regulation",
    entityId: id,
    metadata: { before: existing, after: checked.value },
  });
  return NextResponse.json(updated);
}
