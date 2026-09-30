import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateRegulation } from "@/lib/regulation";
import { similarLabels } from "@/lib/similar";

/**
 * The regulations the technical validator picks from (RETOUR-LABO-30-09.md,
 * slice I). The validation desks read the active ones; the admin manages
 * the list (`?all=1` includes the archived).
 */
export async function GET(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;
  const all = new URL(request.url).searchParams.get("all") === "1" && session.role === "ADMIN";
  const rows = await prisma.regulation.findMany({
    where: all ? {} : { active: true },
    select: { id: true, title: true, text: true, active: true, sortOrder: true, legacyId: true, _count: { select: { samples: true } } },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
  return NextResponse.json(rows.map(({ _count, ...r }) => ({ ...r, samples: _count.samples })));
}

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const checked = validateRegulation(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });

  const others = await prisma.regulation.findMany({ select: { title: true, normalizedTitle: true } });
  if (others.some((o) => o.normalizedTitle === checked.value.normalizedTitle)) {
    return NextResponse.json({ error: "Cette réglementation existe déjà." }, { status: 409 });
  }
  // A title one typing error away from another is almost always a duplicate.
  if ((body as { confirmSimilar?: unknown }).confirmSimilar !== true) {
    const similar = similarLabels(checked.value.title, others.map((o) => o.title), 5);
    if (similar.length > 0) {
      return NextResponse.json({ error: "Une réglementation très proche existe déjà.", similar }, { status: 409 });
    }
  }

  const created = await prisma.regulation.create({ data: checked.value, select: { id: true, title: true } });
  await logAudit({ actorId: session.id, action: "REGULATION_CREATED", entity: "Regulation", entityId: created.id, metadata: checked.value });
  return NextResponse.json(created, { status: 201 });
}
