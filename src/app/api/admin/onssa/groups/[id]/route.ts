import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { ONSSA_MAPPING_MESSAGES, validateGroupInput } from "@/lib/onssa-mapping";

const GROUP_SELECT = { id: true, name: true, domain: true, sortOrder: true, active: true } as const;

/**
 * Lot 3E, N2 — renames, re-domains, reorders, archives or restores a product
 * group of the ONSSA report. Never deleted: an archived group keeps the
 * families that point to it (they still count in its rows) and is offered
 * to no new family. Administrator only; journalled ONSSA_GROUP_UPDATED with
 * the values before / after.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.onssaProductGroup.findUnique({ where: { id }, select: GROUP_SELECT });
  if (!existing) return NextResponse.json({ error: "Groupe de produits introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: ONSSA_MAPPING_MESSAGES.invalid }, { status: 400 });
  }
  const checked = validateGroupInput(body, false);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const changed = (Object.keys(checked.value) as (keyof typeof checked.value)[]).filter(
    (key) => checked.value[key] !== existing[key]
  );
  if (changed.length === 0) return NextResponse.json(existing);

  try {
    const group = await prisma.onssaProductGroup.update({
      where: { id },
      data: Object.fromEntries(changed.map((key) => [key, checked.value[key]])),
      select: GROUP_SELECT,
    });
    await logAudit({
      actorId: session.id,
      action: "ONSSA_GROUP_UPDATED",
      entity: "OnssaProductGroup",
      entityId: id,
      metadata: Object.fromEntries(changed.map((key) => [key, { avant: existing[key], apres: group[key] }])),
    });
    return NextResponse.json(group);
  } catch (error) {
    if ((error as { code?: unknown })?.code === "P2002") {
      return NextResponse.json({ error: ONSSA_MAPPING_MESSAGES.duplicate }, { status: 409 });
    }
    console.error("[admin/onssa/groups] update failed", error);
    return NextResponse.json({ error: "Le groupe n'a pas pu être modifié. Réessayez." }, { status: 500 });
  }
}
