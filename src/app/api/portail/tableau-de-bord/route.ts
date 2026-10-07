import { NextResponse } from "next/server";
import { loadPortalDashboard, requirePortalApi } from "@/lib/portal-server";

/** The client's dashboard: samples of the last 12 months by state, latest reports (PORTAIL.md §2). */
export async function GET() {
  const guard = await requirePortalApi();
  if (guard instanceof NextResponse) return guard;

  const dashboard = await loadPortalDashboard(guard.clientId);
  return NextResponse.json(dashboard, { headers: { "Cache-Control": "private, no-store" } });
}
