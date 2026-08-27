import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateEil } from "@/lib/quality-validation";

/** EIL campaigns (essais interlaboratoires) — the proficiency register. */
export async function GET() {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  const campaigns = await prisma.eilCampaign.findMany({
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    take: 100,
  });

  return NextResponse.json(campaigns);
}

export async function POST(request: Request) {
  const session = await requireApiRole("VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const validated = validateEil((body ?? {}) as Record<string, unknown>);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const campaign = await prisma.eilCampaign.create({
    data: { ...validated.value, createdById: session.id },
  });

  await logAudit({
    actorId: session.id,
    action: "EIL_CREATED",
    entity: "EilCampaign",
    entityId: campaign.id,
    metadata: {
      name: campaign.name,
      organizer: campaign.organizer,
      status: campaign.status,
    },
  });

  return NextResponse.json(campaign, { status: 201 });
}
