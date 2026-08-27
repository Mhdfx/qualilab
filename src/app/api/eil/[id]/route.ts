import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateEil } from "@/lib/quality-validation";

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

  const validated = validateEil({
    name: existing.name,
    status: existing.status,
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
