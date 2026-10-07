import { NextResponse } from "next/server";
import { parsePortalFilters } from "@/lib/portal-query";
import { loadPortalSamples, requirePortalApi } from "@/lib/portal-server";

/**
 * The client's samples (PORTAIL.md §2), 50 per page — filters `q`, `site`,
 * `etat`, `du`, `au`, `page`. Always scoped to the signed-in account's
 * client: no parameter can name another one.
 */
export async function GET(request: Request) {
  const guard = await requirePortalApi();
  if (guard instanceof NextResponse) return guard;

  const filters = parsePortalFilters(new URL(request.url).searchParams);
  const result = await loadPortalSamples(guard.clientId, filters);

  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
