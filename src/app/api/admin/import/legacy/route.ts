import { NextResponse } from "next/server";
import { requireApiRole } from "@/lib/auth";
import { importLegacyCatalogue } from "@/lib/legacy-catalogue-import";

/**
 * The old software's catalogue (RETOUR-LABO-30-09.md, slice J): the 176
 * regulation sources, the 634 product families and their criteria, from the
 * three CSV files `scripts/legacy/extract-legacy.py` writes — with the
 * reprise of 16/10 (RETOUR-LABO-16-10.md F3). ADMIN only.
 *
 *   mode=analyse → what would be written, nothing written;
 *   mode=commit  → one transaction, idempotent (re-running changes nothing).
 *
 * Q39 defaults: a family the September workbook already holds keeps the
 * workbook's criteria and only gains its regulation — unless it has no
 * active criterion (Q43): it then takes the old software's; a family the
 * old software alone knows is created with its criteria; a family unused
 * since 2025 comes in inactive. Unknown parameters are listed, never
 * created unless asked (`createMissing`), and then in the category and
 * domain of their family's type d'analyse. Each family gets its type
 * d'analyse from the old `echantillon` where it has none; the criteria of
 * hands, surface, water and air families bound to another category's
 * parameter are copied onto their own, the old rows deactivated (N2,
 * OLD31). A row the old software deleted from its family's grid (OBSOLETE =
 * 2) is never imported, and the ones an earlier import brought in are
 * deactivated — never deleted — before those copies (step (f)). A family
 * changed by hand keeps its criteria and its regulation; (f) lists the
 * deleted rows left active in it, and in a family a split created.
 * The commit carries the analysis's `planHash` and, when the analysis says
 * so, `confirmSimilar` (look-alike parameters) and `confirmInFlight`
 * (samples in progress whose verdicts change) — else 409, nothing written.
 * The plan: `planLegacyCatalogue`; the reads and writes:
 * `importLegacyCatalogue`.
 */

type Body = {
  regulations?: unknown;
  types?: unknown;
  criteria?: unknown;
  mode?: unknown;
  createMissing?: unknown;
  planHash?: unknown;
  confirmInFlight?: unknown;
  confirmSimilar?: unknown;
};

export async function POST(request: Request) {
  const session = await requireApiRole("ADMIN");
  if (session instanceof NextResponse) return session;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }
  // A JSON `null` (or any non-object) parsed fine and crashed on `body.x` (500).
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
  }

  const result = await importLegacyCatalogue({
    files: { regulations: body.regulations, types: body.types, criteria: body.criteria },
    mode: body.mode === "commit" ? "commit" : "analyse",
    createMissing: body.createMissing === true,
    planHash: typeof body.planHash === "string" ? body.planHash : null,
    confirmInFlight: body.confirmInFlight === true,
    confirmSimilar: body.confirmSimilar === true,
    actorId: session.id,
  });
  return NextResponse.json(result.body, { status: result.status });
}
