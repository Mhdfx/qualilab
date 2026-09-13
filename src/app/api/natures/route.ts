import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** The analysis natures a line can take — the circuit roles pick from them. */
export async function GET() {
  const session = await requireApiRole(
    "PRELEVEUR",
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  const natures = await prisma.analysisNature.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      label: true,
      family: true,
      defaultLineKind: true,
      legacyType: true,
      minQuantity: true,
      minQuantityUnit: true,
    },
  });

  return NextResponse.json(
    natures.map((n) => ({
      ...n,
      minQuantity: n.minQuantity === null ? null : Number(n.minQuantity),
    })),
    { headers: { "Cache-Control": "private, max-age=300" } }
  );
}
