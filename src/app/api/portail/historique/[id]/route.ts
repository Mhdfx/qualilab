import { NextResponse } from "next/server";
import { LEGACY_HISTORY_ON_PORTAL } from "@/lib/lab-proposals";
import { parseLegacySampleId } from "@/lib/legacy-history";
import { loadLegacySample } from "@/lib/legacy-history-server";
import { portalNotFound, requirePortalApi } from "@/lib/portal-server";

/** One sample of the client's history with its analyses; 404 for any other client's (lot 5B, HA6). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requirePortalApi();
  if (guard instanceof NextResponse) return guard;
  if (!LEGACY_HISTORY_ON_PORTAL) return portalNotFound();

  const id = parseLegacySampleId((await params).id);
  const sample = id === null ? null : await loadLegacySample(guard.clientId, id);
  if (!sample) return portalNotFound();

  return NextResponse.json(sample, { headers: { "Cache-Control": "private, no-store" } });
}
