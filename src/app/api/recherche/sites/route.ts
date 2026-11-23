import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { benchHidesClient } from "@/lib/bench-access";
import { prisma } from "@/lib/prisma";

/**
 * The sites of one client, for the « Site » select of « Recherche des
 * analyses » (lot performance P2-2): the page no longer ships every site of
 * every client — the form asks for the chosen client's when it changes.
 *
 * Read-only, with exactly the roles of /recherche (its layout and page). The
 * inactive sites come too, flagged: old analyses were done there. Not
 * `/api/clients/[id]/sites`, whose roles and inactive-site rule differ.
 *
 * The blind bench (relance 2.15, BLIND_BENCH_SCREENS): a technician's search
 * names no client nor site, so this list is refused like `GET /api/clients`.
 */
export async function GET(request: Request) {
  const session = await requireApiRole(
    "RECEPTIONNISTE",
    "PROGRAMMATEUR",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;
  if (benchHidesClient(session.role)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const clientId = new URL(request.url).searchParams.get("client")?.trim() || null;
  if (!clientId) return NextResponse.json([]);

  const sites = await prisma.site.findMany({
    where: { clientId },
    select: { id: true, clientId: true, name: true, active: true },
    orderBy: [{ active: "desc" }, { name: "asc" }],
  });
  return NextResponse.json(sites);
}
