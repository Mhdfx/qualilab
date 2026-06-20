import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateSampleCode } from "@/lib/sample-code";
import type { SampleType } from "@/generated/prisma/client";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const where =
    session.role === "ADMIN" ? {} : { userId: session.id };

  const samples = await prisma.sample.findMany({
    where,
    include: {
      client: true,
      user: { select: { id: true, name: true } },
      parameters: { include: { parameter: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(samples);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "PRELEVEUR") {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

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
      include: {
        client: true,
        user: { select: { id: true, name: true } },
        parameters: { include: { parameter: true } },
      },
    });

    return NextResponse.json(sample, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Impossible de créer le prélèvement." },
      { status: 500 }
    );
  }
}
