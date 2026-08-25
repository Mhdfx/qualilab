import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { validateParameter } from "@/lib/parameter-validation";
import type { SampleType } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const session = await requireApiRole();
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") as SampleType | null;

  const parameters = await prisma.analysisParameter.findMany({
    where: category ? { category } : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(parameters);
}

/**
 * Creating an analysis parameter.
 *
 * This is where the laboratory's own norms are entered. Changing a limit here
 * changes what counts as conform and what raises a contamination alert — with
 * no code change, which is the point.
 */
export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const validated = validateParameter(body as never);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
  }

  const duplicate = await prisma.analysisParameter.findFirst({
    where: { name: validated.value.name, category: validated.value.category },
    select: { id: true },
  });
  if (duplicate) {
    return NextResponse.json(
      { error: "Ce paramètre existe déjà pour ce domaine." },
      { status: 409 }
    );
  }

  const parameter = await prisma.analysisParameter.create({
    data: validated.value,
  });

  await logAudit({
    actorId: session.id,
    action: "PARAMETER_CREATED",
    entity: "AnalysisParameter",
    entityId: parameter.id,
    metadata: {
      name: parameter.name,
      category: parameter.category,
      limitValue: parameter.limitValue,
      alertOnExceed: parameter.alertOnExceed,
    },
  });

  return NextResponse.json(parameter, { status: 201 });
}
