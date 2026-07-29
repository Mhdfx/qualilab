import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
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
