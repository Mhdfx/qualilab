import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { loadSampleStats } from "@/lib/dashboard-first-page";

/**
 * Headline figures for the sample dashboard — counted by the database over
 * the whole table, never derived from the page of rows on screen (which
 * would cap every number at the page size once the lab grows).
 */
export async function GET() {
  const session = await requireApiRole(
    "RECEPTIONNISTE",
    "TECHNICIEN",
    "VALIDATEUR",
    "DIRECTION",
    "GESTIONNAIRE",
    "COMPTABLE",
    "ADMIN"
  );
  if (session instanceof NextResponse) return session;

  // The same figures the /admin page reads with its document (lot performance P2-7).
  return NextResponse.json(await loadSampleStats());
}
