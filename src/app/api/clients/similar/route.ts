import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findSimilarClients } from "@/lib/client-identity";

/**
 * « Ce client existe peut-être déjà » while the client form is being filled
 * (CLIENTS-FUSION.md §5): the same list `POST /api/clients` answers with a
 * 409, so the gestionnaire sees the near-duplicates before saving.
 *
 * `GET /api/clients/similar?name=&ice=&excludeId=` → `{ similar: [{ id, name, reason }] }`.
 * `excludeId`: the client being renamed. Only active clients are proposed;
 * the exact same name is not (it is refused outright on save).
 *
 * The reception and the préleveur read it too: they create clients at the
 * deposit and the visit (RETOUR-LABO-16-10.md E1), where the « Nouveau
 * client » dialog offers « Utiliser ce client » on each near-duplicate.
 */
export async function GET(request: Request) {
  const session = await requireApiRole("GESTIONNAIRE", "ADMIN", "RECEPTIONNISTE", "PRELEVEUR");
  if (session instanceof NextResponse) return session;

  const params = new URL(request.url).searchParams;
  const name = (params.get("name") ?? "").trim().slice(0, 191);
  const ice = (params.get("ice") ?? "").trim().slice(0, 64);
  const excludeId = params.get("excludeId")?.trim() || null;

  if (!name && !ice) return NextResponse.json({ similar: [] });

  const candidates = await prisma.client.findMany({
    where: { archived: false },
    select: { id: true, name: true, ice: true },
  });

  return NextResponse.json({ similar: findSimilarClients({ id: excludeId, name, ice }, candidates) });
}
