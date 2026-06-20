import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { SampleType } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") as SampleType | null;

  const parameters = await prisma.analysisParameter.findMany({
    where: category ? { category } : undefined,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(parameters);
}
