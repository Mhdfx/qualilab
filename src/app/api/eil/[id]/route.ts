import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateEil } from "@/lib/quality-validation";
import { isoDayOf } from "@/lib/date-only";

/** Update a campaign: status moves, results arrive, notes accumulate. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.eilCampaign.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // A PATCH changes what it carries: a field it leaves out keeps its value
  // (the screen sends the whole form; a status alone nulled the results).
  const validated = validateEil({
    name: existing.name,
    organizer: existing.organizer,
    scope: existing.scope,
    startDate: existing.startDate ? isoDayOf(existing.startDate) : null,
    resultDate: existing.resultDate ? isoDayOf(existing.resultDate) : null,
    status: existing.status,
    outcome: existing.outcome,
    satisfactory: existing.satisfactory,
    notes: existing.notes,
    ...(body as Record<string, unknown>),
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const campaign = await prisma.eilCampaign.update({
    where: { id },
    data: validated.value,
  });

  await logAudit({
    actorId: session.id,
    action: "EIL_UPDATED",
    entity: "EilCampaign",
    entityId: id,
    metadata: {
      name: campaign.name,
      before: { status: existing.status, satisfactory: existing.satisfactory },
      after: { status: campaign.status, satisfactory: campaign.satisfactory },
    },
  });

  return NextResponse.json(campaign);
}
