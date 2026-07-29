import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await requireApiRole();
  if (session instanceof NextResponse) return session;

  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clients);
}
