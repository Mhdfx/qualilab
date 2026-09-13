import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateProfile } from "@/lib/profile-input";

/** Editing a profile — the parameter list is replaced as a whole, in one transaction. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const existing = await prisma.analysisProfile.findUnique({
    where: { id },
    select: { id: true, name: true, natureId: true, clientId: true, unitCount: true, active: true, sortOrder: true, parameters: { select: { parameterId: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Profil introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  // A partial edit fills the gaps from the stored row, then the whole thing is validated.
  const input = (body ?? {}) as Record<string, unknown>;
  const merged = {
    name: input.name ?? existing.name,
    natureId: input.natureId ?? existing.natureId,
    clientId: input.clientId === undefined ? existing.clientId ?? "" : input.clientId,
    unitCount: input.unitCount ?? existing.unitCount,
    parameterIds: input.parameterIds ?? existing.parameters.map((p) => p.parameterId),
    active: input.active ?? existing.active,
    sortOrder: input.sortOrder ?? existing.sortOrder,
  };
  const checked = validateProfile(merged);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { parameterIds, ...fields } = checked.value;

  const parameters = await prisma.analysisParameter.findMany({
    where: { id: { in: parameterIds } },
    select: { id: true },
  });
  if (parameters.length !== parameterIds.length) {
    return NextResponse.json({ error: "Une des analyses du profil n'existe pas." }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.analysisProfileParameter.deleteMany({ where: { profileId: id } });
    return tx.analysisProfile.update({
      where: { id },
      data: {
        ...fields,
        parameters: { create: parameterIds.map((parameterId) => ({ parameterId })) },
      },
      select: { id: true, name: true, natureId: true, clientId: true, unitCount: true, active: true, sortOrder: true },
    });
  });

  await logAudit({
    actorId: session.id,
    action: "PROFILE_UPDATED",
    entity: "AnalysisProfile",
    entityId: id,
    metadata: {
      before: { ...existing, parameterIds: existing.parameters.map((p) => p.parameterId), parameters: undefined },
      after: { ...updated, parameterIds },
    },
  });

  return NextResponse.json({ ...updated, parameterIds });
}
