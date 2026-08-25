import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";

export async function GET() {
  const session = await requireApiRole();
  if (session instanceof NextResponse) return session;

  const services = await prisma.labService.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  // unitPrice is DECIMAL: hand the screens a number, not a string.
  return NextResponse.json(
    services.map((service) => ({ ...service, unitPrice: toMoney(service.unitPrice) }))
  );
}
