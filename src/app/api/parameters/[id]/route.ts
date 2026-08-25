import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateParameter } from "@/lib/parameter-validation";

/**
 * Editing an analysis parameter — its unit, its reference threshold, its
 * numeric limit and whether exceeding it raises a contamination alert.
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
    ...(body as Record<string, unknown>),
  });
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
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
        limitValue: existing.limitValue,
        alertOnExceed: existing.alertOnExceed,
        threshold: existing.threshold,
      },
      after: {
        limitValue: parameter.limitValue,
        alertOnExceed: parameter.alertOnExceed,
        threshold: parameter.threshold,
      },
    },
  });

  return NextResponse.json(parameter);
}
