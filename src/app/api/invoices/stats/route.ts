import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toMoney } from "@/lib/money";

/**
 * Invoice headline figures, aggregated by the database over every invoice —
 * the list on screen only ever shows one page.
 */
export async function GET() {
  const session = await requireApiRole("COMPTABLE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const [count, sums, thisMonth] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.aggregate({ _sum: { total: true } }),
    prisma.invoice.count({ where: { issueDate: { gte: startOfMonth } } }),
  ]);

  return NextResponse.json({
    count,
    totalBilled: toMoney(sums._sum.total),
    thisMonth,
  });
}
