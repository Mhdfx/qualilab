import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateProfile } from "@/lib/profile-input";

const PROFILE_SELECT = {
  id: true,
  name: true,
  natureId: true,
  clientId: true,
  unitCount: true,
  active: true,
  sortOrder: true,
  client: { select: { name: true } },
  parameters: { select: { parameterId: true } },
} as const;

/**
 * Analysis profiles — the panels a nature is usually asked for, optionally
 * contractual to one client. The forms read them (`?natureId=`, `?clientId=`)
 * to pre-tick the analyses of a line; the admin manages them.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "TECHNICIEN", "VALIDATEUR", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const natureId = params.get("natureId");
  const clientId = params.get("clientId");
  const all = params.get("all") === "1" && session.role === "ADMIN";

  const rows = await prisma.analysisProfile.findMany({
    where: {
      ...(all ? {} : { active: true }),
      ...(natureId ? { natureId } : {}),
      // A client's own panels plus the generic ones; generic only when no client.
      ...(clientId ? { OR: [{ clientId }, { clientId: null }] } : all ? {} : { clientId: null }),
    },
    select: PROFILE_SELECT,
    orderBy: [{ natureId: "asc" }, { clientId: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      natureId: row.natureId,
      clientId: row.clientId,
      clientName: row.client?.name ?? null,
      unitCount: row.unitCount,
      active: row.active,
      sortOrder: row.sortOrder,
      parameterIds: row.parameters.map((p) => p.parameterId),
    }))
  );
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

  const checked = validateProfile(body);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  const { parameterIds, ...fields } = checked.value;

  const [nature, parameters, client] = await Promise.all([
    prisma.analysisNature.findUnique({ where: { id: fields.natureId }, select: { id: true } }),
    prisma.analysisParameter.findMany({ where: { id: { in: parameterIds } }, select: { id: true } }),
    fields.clientId
      ? prisma.client.findUnique({ where: { id: fields.clientId }, select: { id: true } })
      : Promise.resolve(null),
  ]);
  if (!nature) return NextResponse.json({ error: "Nature d'analyse inconnue." }, { status: 400 });
  if (parameters.length !== parameterIds.length) {
    return NextResponse.json({ error: "Une des analyses du profil n'existe pas." }, { status: 400 });
  }
  if (fields.clientId && !client) return NextResponse.json({ error: "Client introuvable." }, { status: 400 });

  const created = await prisma.analysisProfile.create({
    data: { ...fields, parameters: { create: parameterIds.map((parameterId) => ({ parameterId })) } },
    select: PROFILE_SELECT,
  });

  await logAudit({
    actorId: session.id,
    action: "PROFILE_CREATED",
    entity: "AnalysisProfile",
    entityId: created.id,
    metadata: { name: created.name, natureId: created.natureId, clientId: created.clientId, parameterIds },
  });

  return NextResponse.json({ ...created, parameterIds }, { status: 201 });
}
