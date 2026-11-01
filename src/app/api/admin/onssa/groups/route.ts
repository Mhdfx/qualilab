import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PROPOSED_ONSSA_GROUPS } from "@/lib/onssa-canevas";
import { ONSSA_MAPPING_MESSAGES, validateGroupInput } from "@/lib/onssa-mapping";

const GROUP_SELECT = { id: true, name: true, domain: true, sortOrder: true, active: true } as const;

const isUniqueConflict = (error: unknown) => (error as { code?: unknown })?.code === "P2002";

/**
 * Lot 3E, N2 — creates a product group of the ONSSA report: `{ name, domain }`,
 * or `{ proposed: true }` for the proposed list (`PROPOSED_ONSSA_GROUPS`,
 * hypothèse R-22) — the names already there are skipped. Administrator only;
 * journalled ONSSA_GROUP_CREATED.
 */
export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: ONSSA_MAPPING_MESSAGES.invalid }, { status: 400 });
  }

  if (body && typeof body === "object" && (body as Record<string, unknown>).proposed === true) {
    const existing = await prisma.onssaProductGroup.findMany({ select: { name: true, sortOrder: true } });
    const taken = new Set(existing.map((group) => group.name.toLocaleLowerCase("fr")));
    const start = existing.reduce((max, group) => Math.max(max, group.sortOrder), -1) + 1;
    const missing = PROPOSED_ONSSA_GROUPS.filter((group) => !taken.has(group.name.toLocaleLowerCase("fr")));
    if (missing.length === 0) return NextResponse.json({ created: [] });
    await prisma.onssaProductGroup.createMany({
      data: missing.map((group, i) => ({ name: group.name, domain: group.domain, sortOrder: Math.min(999, start + i) })),
      skipDuplicates: true,
    });
    const created = await prisma.onssaProductGroup.findMany({
      where: { name: { in: missing.map((group) => group.name) } },
      select: GROUP_SELECT,
      orderBy: { sortOrder: "asc" },
    });
    await logAudit({
      actorId: session.id,
      action: "ONSSA_GROUP_CREATED",
      entity: "OnssaProductGroup",
      metadata: { proposee: true, groupes: created.map((group) => group.name) },
    });
    return NextResponse.json({ created }, { status: 201 });
  }

  const checked = validateGroupInput(body, true);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { name, domain } = checked.value as { name: string; domain: "ALIMENTAIRE" | "EAU" };

  try {
    const last = await prisma.onssaProductGroup.aggregate({ _max: { sortOrder: true } });
    const group = await prisma.onssaProductGroup.create({
      data: { name, domain, sortOrder: checked.value.sortOrder ?? Math.min(999, (last._max.sortOrder ?? -1) + 1) },
      select: GROUP_SELECT,
    });
    await logAudit({
      actorId: session.id,
      action: "ONSSA_GROUP_CREATED",
      entity: "OnssaProductGroup",
      entityId: group.id,
      metadata: { nom: group.name, domaine: group.domain },
    });
    return NextResponse.json({ created: [group] }, { status: 201 });
  } catch (error) {
    if (isUniqueConflict(error)) return NextResponse.json({ error: ONSSA_MAPPING_MESSAGES.duplicate }, { status: 409 });
    console.error("[admin/onssa/groups] create failed", error);
    return NextResponse.json({ error: "Le groupe n'a pas pu être créé. Réessayez." }, { status: 500 });
  }
}
