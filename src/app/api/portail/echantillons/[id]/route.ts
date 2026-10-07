import { NextResponse } from "next/server";
import { loadPortalSample, portalNotFound, requirePortalApi } from "@/lib/portal-server";

/** One sample of the client; 404 for any other (PORTAIL.md §2). */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePortalApi();
  if (guard instanceof NextResponse) return guard;

  const { id } = await params;
  const row = await loadPortalSample(guard.clientId, id);
  if (!row) return portalNotFound();

  return NextResponse.json(row, { headers: { "Cache-Control": "private, no-store" } });
}
