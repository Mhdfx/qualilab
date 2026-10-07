import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateParameter } from "@/lib/parameter-validation";

/**
 * Editing an analysis parameter — its unit, its reference threshold, its
 * numeric limit, whether exceeding it raises a contamination alert, and its
 * family (MICRO / CHIMIE / AUTRE — RETOUR-LABO-06-10.md §5, V3).
 *
 * The stored name, domain and family fill what the request leaves out: a
 * form that does not know the family yet never resets it to MICRO.
 *
 * Every change is audited: a limit decides whether results are declared
 * conform, so the laboratory must be able to see who changed one and when.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;

  const existing = await prisma.analysisParameter.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Paramètre introuvable." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const validated = validateParameter({
    name: existing.name,
    category: existing.category,
    family: existing.family,
    ...((body ?? {}) as Record<string, unknown>),
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  // A rename (or a move to another domain) must not create a twin.
  if (validated.value.name !== existing.name || validated.value.category !== existing.category) {
    const duplicate = await prisma.analysisParameter.findFirst({
      where: { name: validated.value.name, category: validated.value.category, id: { not: id } },
      select: { id: true },
    });
    if (duplicate) {
      return NextResponse.json({ error: "Ce paramètre existe déjà pour ce domaine." }, { status: 409 });
    }
  }

  const parameter = await prisma.analysisParameter.update({
    where: { id },
    data: validated.value,
  });

  await logAudit({
    actorId: session.id,
    action: "PARAMETER_UPDATED",
    entity: "AnalysisParameter",
    entityId: id,
    metadata: {
      name: parameter.name,
      before: {
        name: existing.name,
        category: existing.category,
        family: existing.family,
        unit: existing.unit,
        limitValue: existing.limitValue,
        alertOnExceed: existing.alertOnExceed,
        threshold: existing.threshold,
        calcFactor: existing.calcFactor,
        aliases: existing.aliases,
      },
      after: {
        name: parameter.name,
        category: parameter.category,
        family: parameter.family,
        unit: parameter.unit,
        limitValue: parameter.limitValue,
        alertOnExceed: parameter.alertOnExceed,
        threshold: parameter.threshold,
        calcFactor: parameter.calcFactor,
        aliases: parameter.aliases,
      },
    },
  });

  return NextResponse.json(parameter);
}
