import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * What the laboratory already knows of a client: its sampling places (per
 * site) and its products, most used first — the memory the forms propose
 * so nothing is typed twice (WORKFLOW.md rule 3).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "GESTIONNAIRE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const { id } = await params;
  const siteId = new URL(request.url).searchParams.get("siteId") || null;

  const [places, products] = await Promise.all([
    prisma.clientPlace.findMany({
      // The site's own places first; places recorded without a site apply everywhere.
      where: { clientId: id, active: true, ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}) },
      select: { id: true, label: true, siteId: true, usageCount: true },
      orderBy: [{ usageCount: "desc" }, { label: "asc" }],
      take: 200,
    }),
    prisma.clientProduct.findMany({
      where: { clientId: id, active: true },
      select: { id: true, label: true, usageCount: true },
      orderBy: [{ usageCount: "desc" }, { label: "asc" }],
      take: 500,
    }),
  ]);

  return NextResponse.json({ places, products });
}
