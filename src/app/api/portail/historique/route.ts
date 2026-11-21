import { NextResponse } from "next/server";
import { LEGACY_HISTORY_ON_PORTAL } from "@/lib/lab-proposals";
import { parseLegacyHistoryFilters } from "@/lib/legacy-history";
import { loadLegacyHistory } from "@/lib/legacy-history-server";
import { portalNotFound, requirePortalApi } from "@/lib/portal-server";

/**
 * The client's history of the old software (lot 5B, HA4 — RETOUR-LABO-20-11.md
 * §6), 50 per page — filters `q`, `site`, `du`, `au`, `page`. Always scoped
 * to the signed-in account's client: no parameter can name another one.
 * `LEGACY_HISTORY_ON_PORTAL` off: not found.
 */
export async function GET(request: Request) {
  const guard = await requirePortalApi();
  if (guard instanceof NextResponse) return guard;
  if (!LEGACY_HISTORY_ON_PORTAL) return portalNotFound();

  const filters = parseLegacyHistoryFilters(new URL(request.url).searchParams);
  const result = await loadLegacyHistory(guard.clientId, filters);

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
