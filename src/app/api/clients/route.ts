import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }

  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
  });

  return NextResponse.json(clients);
}
