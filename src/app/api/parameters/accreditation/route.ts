import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { parseAccreditationUpdates } from "@/lib/accreditation";

/**
 * The accreditation of the analysis parameters (RETOUR-LABO-28-10.md K4,
 * Q14): `PATCH { updates: [{ id, accreditation }] }` — one status per
 * parameter, or null (« à préciser »). /admin/parametres sends the rows
 * changed by hand or the proposal read from the old software's marks
 * (`accreditationFromLegacyName`). Only the rows that change are written; a
 * single journal entry lists them before → after. ADMIN only. The reports
 * already issued keep the marks frozen with them.
 */
export async function PATCH(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const parsed = parseAccreditationUpdates(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const ids = parsed.value.map((u) => u.id);
  const current = await prisma.analysisParameter.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, accreditation: true } });
  if (current.length !== ids.length) return NextResponse.json({ error: "Paramètre inconnu." }, { status: 400 });
  const byId = new Map(current.map((p) => [p.id, p]));
  const changes = parsed.value.filter((u) => byId.get(u.id)!.accreditation !== u.accreditation);
  if (changes.length === 0) return NextResponse.json({ updated: 0 });

  await prisma.$transaction(
    changes.map((u) => prisma.analysisParameter.update({ where: { id: u.id }, data: { accreditation: u.accreditation }, select: { id: true } }))
  );
  await logAudit({
    actorId: session.id,
    action: "PARAMETER_ACCREDITATION_UPDATED",
    entity: "AnalysisParameter",
    entityId: changes.length === 1 ? changes[0].id : null,
    metadata: {
      count: changes.length,
      changes: changes.map((u) => ({ id: u.id, name: byId.get(u.id)!.name, before: byId.get(u.id)!.accreditation, after: u.accreditation })),
    },
  });
  return NextResponse.json({ updated: changes.length });
}
