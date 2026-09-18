import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const NORM_SELECT = {
  id: true,
  code: true,
  versions: {
    select: { id: true, version: true, label: true, effectiveFrom: true, supersededOn: true, current: true, _count: { select: { criteria: true } } },
    orderBy: { version: "desc" as const },
  },
} as const;

/** The norms and their dated versions — the report prints the one in force. */
export async function GET() {
  const session = await requireApiRole("TECHNICIEN", "VALIDATEUR", "ADMIN");
  if (session instanceof NextResponse) return session;
  const norms = await prisma.norm.findMany({ select: NORM_SELECT, orderBy: { code: "asc" } });
  return NextResponse.json(norms);
}

/** A norm with its first version, typed by the admin. */
export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as { code?: unknown; version?: unknown; label?: unknown };
  const code = typeof input.code === "string" ? input.code.trim().replace(/\s+/g, " ") : "";
  const version = typeof input.version === "string" ? input.version.trim() : "";
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : version ? `${code}:${version}` : code;
  if (!code) return NextResponse.json({ error: "Le code de la norme est obligatoire." }, { status: 400 });
  if (code.length > 80 || version.length > 20 || label.length > 191) return NextResponse.json({ error: "Code, version ou libellé trop long." }, { status: 400 });

  // One step, one transaction: two admins creating the same norm at once
  // must not end with two « en vigueur » versions.
  const created = await prisma.$transaction(async (tx) => {
    const norm = await tx.norm.upsert({ where: { code }, create: { code }, update: {}, select: { id: true } });
    const existing = await tx.normVersion.findUnique({ where: { normId_version: { normId: norm.id, version } }, select: { id: true } });
    if (existing) return { norm, duplicate: true as const };
    const others = await tx.normVersion.count({ where: { normId: norm.id } });
    await tx.normVersion.create({ data: { normId: norm.id, version, label, current: others === 0 } });
    return { norm, duplicate: false as const };
  });
  if (created.duplicate) return NextResponse.json({ error: "Cette version existe déjà." }, { status: 409 });
  const norm = created.norm;

  await logAudit({ actorId: session.id, action: "NORM_UPDATED", entity: "Norm", entityId: norm.id, metadata: { code, version, label } });
  const saved = await prisma.norm.findUniqueOrThrow({ where: { id: norm.id }, select: NORM_SELECT });
  return NextResponse.json(saved, { status: 201 });
}
