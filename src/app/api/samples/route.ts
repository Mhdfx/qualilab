import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { generateSampleCode } from "@/lib/sample-code";
import { sampleSelectFor } from "@/lib/sample-select";
import type { SampleType } from "@/generated/prisma/client";

export async function GET() {
  const session = await requireApiRole();
  if (session instanceof NextResponse) return session;

  // A préleveur only ever sees their own field work; the lab roles see all.
  const where =
    session.role === "PRELEVEUR" ? { userId: session.id } : {};

  const samples = await prisma.sample.findMany({
    where,
    // The préleveur's payload deliberately excludes the laboratory numbering.
    select: sampleSelectFor(session.role),
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(samples);
}

export async function POST(request: Request) {
  const session = await requireApiRole("PRELEVEUR");
  if (session instanceof NextResponse) return session;

  try {
    const body = await request.json();
    const { clientId, lieu, type, notes, parameterIds } = body as {
      clientId: string;
      lieu: string;
      type: SampleType;
      notes?: string;
      parameterIds: string[];
    };

    if (!clientId || !lieu || !type || !parameterIds?.length) {
      return NextResponse.json(
        { error: "Veuillez remplir tous les champs obligatoires." },
        { status: 400 }
      );
    }

    const code = await generateSampleCode();

    const sample = await prisma.sample.create({
      data: {
        code,
        clientId,
        userId: session.id,
        lieu,
        type,
        notes: notes || null,
        sampledAt: new Date(),
        status: "PRELEVE",
        parameters: {
          create: parameterIds.map((parameterId) => ({ parameterId })),
        },
      },
      select: sampleSelectFor(session.role),
    });

    await logAudit({
      actorId: session.id,
      action: "SAMPLE_CREATED",
      entity: "Sample",
      entityId: sample.id,
      metadata: { code: sample.code, type: sample.type, clientId },
    });

    return NextResponse.json(sample, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Impossible de créer le prélèvement." },
      { status: 500 }
    );
  }
}
