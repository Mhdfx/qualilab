import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * The préleveurs a visit may be attributed to — « Prélèvement effectué par »
 * on the protocol. A shared tablet or a colleague's visit keyed in later
 * both need the real name on the sheet, not the logged-in account's.
 */
export async function GET() {
  const session = await requireApiRole("PRELEVEUR", "RECEPTIONNISTE", "ADMIN");
  if (session instanceof NextResponse) return session;

  const users = await prisma.user.findMany({
    where: { role: "PRELEVEUR", banned: { not: true } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  // The logged-in account is always a valid choice, even outside the role.
  const me = users.some((u) => u.id === session.id)
    ? users
    : [{ id: session.id, name: session.name }, ...users];

  return NextResponse.json(me);
}
