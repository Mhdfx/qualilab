import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseDueDelays, parseNatureDueDays } from "@/lib/due-date";
import { DUE_DELAYS_SELECT, getDueDelays, getNatureDueDays } from "@/lib/due-delays-server";

/**
 * « Délais de rendu » (RETOUR-LABO-28-10.md K5, Q8): the days between the
 * arrival and the promised report, per domain of the type d'analyse, in
 * working or calendar days — they propose « Délai de rendu promis » on the
 * programme sheet (`proposeDueAt`). `PUT { dueDaysMicro?, dueDaysChimie?,
 * dueDaysAutre?, dueCalendarDays?, natures? }`: absent = unchanged, empty =
 * no proposal; `natures` = { [natureId]: days | "" } — a type d'analyse's own
 * delay, which wins over its domain's (empty = the domain's). ADMIN only,
 * journalled before → after. Its own route beside
 * /api/admin/lab-settings, on the same settings row.
 */
export async function PUT(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body && typeof body === "object" && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const parsed = parseDueDelays(input);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const natures = parseNatureDueDays(input.natures);
  if (!natures.ok) return NextResponse.json({ error: natures.error }, { status: 400 });

  const before = await getDueDelays();
  const naturesBefore = new Map((await getNatureDueDays()).map((n) => [n.id, n]));
  const unknown = natures.value.filter((n) => !naturesBefore.has(n.id));
  if (unknown.length > 0) return NextResponse.json({ error: "Type d'analyse introuvable : rechargez la page." }, { status: 400 });
  const changedNatures = natures.value.filter((n) => naturesBefore.get(n.id)!.dueDays !== n.dueDays);

  const saved = await prisma.$transaction(async (tx) => {
    for (const nature of changedNatures) {
      await tx.analysisNature.update({ where: { id: nature.id }, data: { dueDays: nature.dueDays } });
    }
    return tx.labSettings.upsert({
      where: { id: "lab" },
      create: { id: "lab", ...parsed.value },
      update: parsed.value,
      select: DUE_DELAYS_SELECT,
    });
  });
  await logAudit({
    actorId: session.id,
    action: "DUE_DELAYS_UPDATED",
    entity: "LabSettings",
    entityId: "lab",
    metadata: {
      before,
      after: saved,
      natures: changedNatures.map((n) => ({ id: n.id, label: naturesBefore.get(n.id)!.label, before: naturesBefore.get(n.id)!.dueDays, after: n.dueDays })),
    },
  });
  return NextResponse.json({ ...saved, natures: await getNatureDueDays() });
}
