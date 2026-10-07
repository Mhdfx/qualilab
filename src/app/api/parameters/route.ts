import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { PARAMETER_FAMILIES, SAMPLE_TYPES, validateParameter } from "@/lib/parameter-validation";
import type { Family, SampleType } from "@/generated/prisma/client";

/**
 * The analysis parameters, each with its domain (`category`) and its family
 * (`family`: MICRO / CHIMIE / AUTRE — RETOUR-LABO-06-10.md §5, V3).
 * `?category=` and `?family=` narrow the list.
 */
export async function GET(request: Request) {
  // The lab's own norms (limits, alert flags, factors): circuit roles only.
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const rawCategory = searchParams.get("category");
  if (rawCategory && !SAMPLE_TYPES.includes(rawCategory as SampleType)) {
    return NextResponse.json({ error: "Domaine d'analyse invalide." }, { status: 400 });
  }
  const category = rawCategory as SampleType | null;
  const rawFamily = searchParams.get("family");
  if (rawFamily && !PARAMETER_FAMILIES.includes(rawFamily as Family)) {
    return NextResponse.json({ error: "Famille d'analyse invalide." }, { status: 400 });
  }
  const family = rawFamily as Family | null;

  // No select: every column goes out, `family` included.
  const parameters = await prisma.analysisParameter.findMany({
    where: { ...(category ? { category } : {}), ...(family ? { family } : {}) },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(parameters);
}

/**
 * Creating an analysis parameter.
 *
 * This is where the laboratory's own norms are entered. Changing a limit here
 * changes what counts as conform and what raises a contamination alert — with
 * no code change, which is the point. The family defaults to MICRO.
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

  const validated = validateParameter((body ?? {}) as Record<string, unknown>);
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
      family: parameter.family,
      limitValue: parameter.limitValue,
      alertOnExceed: parameter.alertOnExceed,
    },
  });

  return NextResponse.json(parameter, { status: 201 });
}
