import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const LIMIT = 20;

/**
 * The client picker of a « Client (portail) » account (PORTAIL.md §1):
 * active clients only — an archived or merged client never opens the portal —
 * matching `?q=` on the name or the ICE, 20 at most.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 100) ?? "";

  const clients = await prisma.client.findMany({
    where: {
      archived: false,
      mergedIntoId: null,
      ...(q ? { OR: [{ name: { contains: q } }, { ice: { contains: q } }] } : {}),
    },
    select: { id: true, name: true, ice: true },
    orderBy: { name: "asc" },
    take: LIMIT,
  });

  return NextResponse.json(clients);
}
