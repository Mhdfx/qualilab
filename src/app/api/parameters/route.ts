import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { normInForce } from "@/lib/parameter-caption";
import { PARAMETER_FAMILIES, SAMPLE_TYPES, validateParameter } from "@/lib/parameter-validation";
import { normVersionsForParameters } from "@/lib/programme-referential";
import type { Family, SampleType } from "@/generated/prisma/client";

/**
 * The analysis parameters, each with its domain (`category`) and its family
 * (`family`: MICRO / CHIMIE / AUTRE — RETOUR-LABO-06-10.md §5, V3).
 * `?category=` and `?family=` narrow the list.
 *
 * Each one also carries `normLabel`: the norm version in force, as the
 * report prints it (`normInForce` over the norms its catalogue criteria
 * cite — the version the programme sheet proposes by default), null when
 * unknown. The sample card shows it under the analysis with the unit
 * (14/10); an added field, so the other readers are unaffected.
 */
export async function GET(request: Request) {
  // The lab's own norms (limits, alert flags, factors): circuit roles only.
  // The responsable des paramètres reads them in « Corriger les analyses »
  // once the bench has started (16/10, Q128).
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "PROGRAMMATEUR",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const { searchParams } = new URL(request.url);
  const rawCategory = searchParams.get("category");
  if (rawCategory && !SAMPLE_TYPES.includes(rawCategory as SampleType)) {
    return NextResponse.json({ error: "Catégorie d'analyse invalide." }, { status: 400 });
  }
  const category = rawCategory as SampleType | null;
  const rawFamily = searchParams.get("family");
  if (rawFamily && !PARAMETER_FAMILIES.includes(rawFamily as Family)) {
    return NextResponse.json({ error: "Domaine invalide." }, { status: 400 });
  }
  const family = rawFamily as Family | null;

  // No select: every column goes out, `family` included.
  const parameters = await prisma.analysisParameter.findMany({
    where: { ...(category ? { category } : {}), ...(family ? { family } : {}) },
    orderBy: { name: "asc" },
  });
  const versions = await normVersionsForParameters(parameters.map((parameter) => parameter.id));

  return NextResponse.json(
    parameters.map((parameter) => ({ ...parameter, normLabel: normInForce(versions[parameter.id] ?? []) }))
  );
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
      { error: "Ce paramètre existe déjà dans cette catégorie." },
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
