import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

function dateOrNull(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}/.test(value)) return "invalid";
  const d = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? "invalid" : d;
}

/** A norm version: its label, its dates, and whether it is the one in force. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;
  const { id } = await params;
  const existing = await prisma.normVersion.findUnique({
    where: { id },
    select: { id: true, normId: true, version: true, label: true, effectiveFrom: true, supersededOn: true, current: true },
  });
  if (!existing) return NextResponse.json({ error: "Version introuvable." }, { status: 404 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  const input = (body ?? {}) as Record<string, unknown>;
  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim().slice(0, 191) : existing.label;
  const effectiveFrom = input.effectiveFrom === undefined ? existing.effectiveFrom : dateOrNull(input.effectiveFrom);
  const supersededOn = input.supersededOn === undefined ? existing.supersededOn : dateOrNull(input.supersededOn);
  if (effectiveFrom === "invalid" || supersededOn === "invalid") return NextResponse.json({ error: "Date invalide." }, { status: 400 });
  const current = input.current === undefined ? existing.current : input.current === true;

  const updated = await prisma.$transaction(async (tx) => {
    // One version in force per norm.
    if (current && !existing.current) {
      await tx.normVersion.updateMany({ where: { normId: existing.normId, id: { not: id } }, data: { current: false } });
    }
    return tx.normVersion.update({
      where: { id },
      data: { label, effectiveFrom, supersededOn, current },
      select: { id: true, version: true, label: true, effectiveFrom: true, supersededOn: true, current: true },
    });
  });

  await logAudit({ actorId: session.id, action: "NORM_UPDATED", entity: "NormVersion", entityId: id, metadata: { before: existing, after: updated } });
  return NextResponse.json(updated);
}
