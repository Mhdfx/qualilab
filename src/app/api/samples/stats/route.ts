import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * Headline figures for the sample dashboard — counted by the database over
 * the whole table, never derived from the page of rows on screen (which
 * would cap every number at the page size once the lab grows).
 */
export async function GET() {
  const session = await requireApiRole(
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const [total, byType, preleveurs] = await Promise.all([
    prisma.sample.count(),
    prisma.sample.groupBy({ by: ["type"], _count: { _all: true } }),
    prisma.sample.groupBy({ by: ["userId"], _count: { _all: true } }),
  ]);

  return NextResponse.json({
    total,
    byType: Object.fromEntries(byType.map((row) => [row.type, row._count._all])),
    activePreleveurs: preleveurs.length,
  });
}
